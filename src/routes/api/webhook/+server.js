import { json } from '@sveltejs/kit';
import { query, transaction } from '$lib/db.js';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import { timeToSlot, calculateTotalSlots } from '$lib/utils/timeSlots.js';
import { sendBookingConfirmation } from '$lib/email.js';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST({ request }) {
	try {
		const payload = await request.text();
		const sig = request.headers.get('stripe-signature');
		const event = stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET);

		console.log(`Webhook mottagen: ${event.type} vid ${new Date().toISOString()}`);

		if (event.type === 'checkout.session.completed') {
			const session = event.data.object;
			console.log('Session metadata:', session.metadata);
			console.log('Session ID:', session.id);

			try {
				await transaction(async (client) => {
					// Hämta experience_type först
					const {
						rows: [experience]
					} = await client.query('SELECT experience_type FROM experiences WHERE id = $1', [
						session.metadata.experience_id
					]);

					// Kontrollera kapacitet endast för guidade upplevelser
					if (experience?.experience_type === 'guided') {
						const {
							rows: [capacity]
						} = await client.query(
							`SELECT 
								gec.max_participants, 
								COALESCE(SUM(b.number_of_adults), 0) as current_bookings
							 FROM guided_experience_capacity gec
							 LEFT JOIN bookings b ON b.experience_id = gec.experience_id 
							 AND b.start_date = $1 
							 AND b.start_time = $2
							 AND b.status != 'cancelled'
							 WHERE gec.experience_id = $3
							 GROUP BY gec.max_participants`,
							[
								session.metadata.start_date,
								session.metadata.start_time,
								session.metadata.experience_id
							]
						);

						if (!capacity) {
							throw new Error(
								'Kunde inte hitta kapacitetsinformation för denna guidade upplevelse'
							);
						}

						const requestedSpots = parseInt(session.metadata.number_of_adults);
						const availableSpots = capacity.max_participants - capacity.current_bookings;

						if (availableSpots < requestedSpots) {
							throw new Error(
								`Inte tillräckligt med lediga platser. Tillgängligt: ${availableSpots}, Efterfrågat: ${requestedSpots}`
							);
						}
					}

					// Add this logging before creating the booking
					console.log('Creating booking with data:', {
						metadata: session.metadata,
						sessionId: session.id,
						startLocation: session.metadata.startlocation
					});

					// Modify createBooking function to ensure startlocation is properly saved
					const booking = await createBooking(
						client,
						{
							...session.metadata,
							startlocation: session.metadata.startlocation, // Ensure this matches your database column name
							stripe_session_id: session.id
						},
						session
					);
					await createBookingAddons(client, booking.id, session.metadata);
					await createBookingOptionalProducts(client, booking.id, session.metadata);
					await updateAvailabilityForBooking(client, session.metadata);

					if (!session.metadata.confirmation_sent) {
						const formattedBooking = {
							...booking,
							id: booking.id,
							startLocationName: session.metadata.startlocation_name,
							startlocation: booking.startlocation,
							adultPrice: parseInt(session.metadata.adult_price),
							subtotal: parseInt(session.metadata.amount_total) / 1.25,
							vat:
								parseInt(session.metadata.amount_total) -
								parseInt(session.metadata.amount_total) / 1.25,
							total: parseInt(session.metadata.amount_total),
							date_time_created: booking.date_time_created,
							start_date: session.metadata.start_date,
							end_date: session.metadata.end_date,
							start_time: session.metadata.start_time,
							end_time: session.metadata.end_time,
							customer_email: booking.customer_email,
							customer_phone: booking.customer_phone,
							booking_name: booking.booking_name,
							booking_lastname: booking.booking_lastname,
							experience: booking.experience,
							number_of_adults: booking.number_of_adults,
							number_of_children: booking.number_of_children,
							addons: [
								{ name: 'Kanot', amount: booking.amount_canoes },
								{ name: 'Kajak', amount: booking.amount_kayak },
								{ name: 'SUP', amount: booking.amount_sup }
							],
							optional_products: JSON.parse(session.metadata.optional_products || '[]')
						};

						console.log(
							'Fullständig bokningsdata för bekräftelse:',
							JSON.stringify(formattedBooking, null, 2)
						);

						await client.query('UPDATE bookings SET confirmation_sent = true WHERE id = $1', [
							booking.id
						]);

						try {
							await sendBookingConfirmation(formattedBooking, false);
							console.log('✅ Bokningsbekräftelse skickad framgångsrikt');
						} catch (emailError) {
							console.error('Fel vid sändning av bokningsbekräftelse:', emailError);
						}
					}

					// Efter att bokningen är skapad
					console.log('Bokning skapad med session ID:', session.id);
					console.log('Redirect URL:', `/success?session_id=${session.id}`);

					// Uppdatera status till confirmed men behåll booking_status som pending
					await client.query('UPDATE bookings SET status = $1 WHERE stripe_session_id = $2', [
						'confirmed',
						session.id
					]);

					// Vänta lite innan redirect för att säkerställa att databasen har uppdaterats
					await new Promise((resolve) => setTimeout(resolve, 1000));

					return json({
						received: true,
						message: 'bokning genomförd',
						redirectUrl: `/success?session_id=${session.id}`
					});
				});

				console.log('✅ Booking Complete');
				console.log(`Webhook behandlad: ${event.type}`);
				return json({ received: true, message: 'bokning genomförd' }, { status: 200 });
			} catch (error) {
				console.error('fel vid bokning:', error);
				throw error;
			}
		}

		console.log(`Webhook behandlad: ${event.type}`);
		return json({ received: true });
	} catch (error) {
		console.error('Webhook Error:', error.message);
		return json({ error: error.message }, { status: 400 });
	}
}

async function updateAvailabilityForBooking(client, bookingData) {
	try {
		const { rows: addons } = await client.query(
			'SELECT name, availability_table_name, column_name FROM addons WHERE column_name = ANY($1)',
			[Object.keys(bookingData).filter((key) => key.startsWith('amount_'))]
		);

		for (const addon of addons) {
			const amount = bookingData[addon.column_name] || 0;
			if (amount > 0) {
				const startDate = new Date(bookingData.start_date);
				const endDate = new Date(bookingData.end_date);
				const isOvernight = bookingData.booking_type === 'overnight';

				for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
					const dateStr = date.toISOString().split('T')[0];
					const isFirstDay = date.getTime() === startDate.getTime();
					const isLastDay = date.getTime() === endDate.getTime();
					const isMiddleDay = !isFirstDay && !isLastDay;

					// Skapa rad om den inte finns
					const { rows } = await client.query(
						`SELECT date FROM ${addon.availability_table_name} WHERE date = $1`,
						[dateStr]
					);

					if (rows.length === 0) {
						await client.query(`INSERT INTO ${addon.availability_table_name} (date) VALUES ($1)`, [
							dateStr
						]);
					}

					let startMinutes, endMinutes;

					if (isOvernight) {
						if (isFirstDay) {
							startMinutes = timeToMinutes(bookingData.start_time);
							endMinutes = 1440;
							console.log(`\n=== Första dagen (${dateStr}) ===`);
							console.log(`Blockerar från ${formatMinutes(startMinutes)} till 00:00`);
						} else if (isMiddleDay) {
							startMinutes = 0;
							endMinutes = 1440;
							console.log(`\n=== Mellandag (${dateStr}) ===`);
							console.log(`Blockerar hela dagen (00:00-00:00)`);
						} else if (isLastDay) {
							startMinutes = 0;
							endMinutes = timeToMinutes(bookingData.end_time);
							console.log(`\n=== Sista dagen (${dateStr}) ===`);
							console.log(`Blockerar från 00:00 till ${formatMinutes(endMinutes)}`);
						}
					} else {
						// Dagsbokning eller hela dagen
						startMinutes = timeToMinutes(bookingData.start_time);
						endMinutes = timeToMinutes(bookingData.end_time);

						if (process.env.NODE_ENV === 'development') {
							console.log(`=== Bokning (${dateStr}) ===`);
							console.log(`Tid: ${formatMinutes(startMinutes)} till ${formatMinutes(endMinutes)}`);
						}
					}

					console.log('Debug:', {
						date: dateStr,
						isFirstDay,
						isMiddleDay,
						isLastDay,
						isOvernight,
						startMinutes,
						endMinutes,
						startTime: formatMinutes(startMinutes),
						endTime: formatMinutes(endMinutes)
					});

					const slots = [];
					for (let minutes = startMinutes; minutes < endMinutes; minutes += 15) {
						const slotMinutes = Math.floor(minutes / 15) * 15;
						slots.push(`"${slotMinutes}" = COALESCE("${slotMinutes}", 0) - ${amount}`);
					}

					if (slots.length > 0) {
						await client.query(
							`UPDATE ${addon.availability_table_name}
							 SET ${slots.join(', ')}
							 WHERE date = $1`,
							[dateStr]
						);
					}
				}
			}
		}
	} catch (error) {
		console.error('Fel vid uppdatering av tillgänglighet:', error);
		throw error;
	}
}

// Hjälpfunktion för att konvertera tid till minuter
function timeToMinutes(timeStr) {
	const [hours, minutes] = timeStr.split(':').map(Number);
	return hours * 60 + minutes;
}

function calculateTimeSlot(time) {
	const [hours, minutes] = time.split(':').map(Number);
	return (hours * 60 + minutes) / 15;
}

function generateDateRange(startDate, endDate) {
	const dates = [];
	const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
	const [endYear, endMonth, endDay] = endDate.split('-').map(Number);

	let currentDate = new Date(Date.UTC(startYear, startMonth - 1, startDay));
	const lastDate = new Date(Date.UTC(endYear, endMonth - 1, endDay));

	// lägg till en extra dag för att inkludera slutdatumet
	lastDate.setDate(lastDate.getDate() + 1);

	while (currentDate < lastDate) {
		dates.push(
			`${currentDate.getUTCFullYear()}-${String(currentDate.getUTCMonth() + 1).padStart(2, '0')}-${String(currentDate.getUTCDate()).padStart(2, '0')}`
		);
		currentDate.setUTCDate(currentDate.getUTCDate() + 1);
	}

	console.log('Generated date range:', dates);
	return dates;
}

function timeToIndex(time) {
	const [hours, minutes] = time.split(':').map(Number);
	return Math.floor((hours * 60 + minutes) / 15);
}

function calculateEndDate(startDate, nights) {
	if (!nights || nights <= 0) return startDate;

	const date = new Date(startDate);
	date.setDate(date.getDate() + nights);
	return date.toISOString().split('T')[0];
}

// Hjälpfunktion för att formatera minuter till tid
function formatMinutes(minutes) {
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

async function createBooking(client, metadata, session) {
	// säkerställ att alla numeriska värden är giltiga integers
	const numberOfAdults = parseInt(metadata.number_of_adults) || 0;
	const numberOfChildren = parseInt(metadata.number_of_children) || 0;
	const amountCanoes = parseInt(metadata.amount_canoes) || 0;
	const amountKayak = parseInt(metadata.amount_kayak) || 0;
	const amountSup = parseInt(metadata.amount_sup) || 0;
	const amountTotal = parseInt(metadata.amount_total) || 0;
	const startlocation = parseInt(metadata.startlocation) || null;

	// beräkna start_slot, end_slot och total_slots
	const startSlot = metadata.start_slot
		? parseInt(metadata.start_slot)
		: calculateTimeSlot(metadata.start_time);
	const endSlot = metadata.end_slot
		? parseInt(metadata.end_slot)
		: calculateTimeSlot(metadata.end_time);
	const totalSlots = metadata.total_slots ? parseInt(metadata.total_slots) : endSlot - startSlot;

	// bestäm booking_type (day eller overnight)
	const bookingType =
		metadata.booking_type || (metadata.start_date === metadata.end_date ? 'day' : 'overnight');

	// logga startlocation-värdet för felsökning
	console.log('Startlocation-värde som ska sparas:', {
		raw: metadata.startlocation,
		parsed: startlocation,
		name: metadata.startlocation_name
	});

	// logga slots och booking_type för felsökning
	console.log('Slots och booking_type som ska sparas:', {
		startSlot,
		endSlot,
		totalSlots,
		bookingType
	});

	const {
		rows: [booking]
	} = await client.query(
		`INSERT INTO bookings (
			experience_id, 
			experience, 
			start_date, 
			start_time, 
			end_date, 
			end_time, 
			number_of_adults, 
			number_of_children, 
			amount_total, 
			startlocation, 
			customer_comment, 
			amount_canoes, 
			amount_kayak, 
			amount_sup, 
			booking_name, 
			booking_lastname, 
			customer_email, 
			status, 
			stripe_session_id, 
			booking_status, 
			start_slot, 
			end_slot, 
			total_slots, 
			booking_type, 
			payment_method, 
			customer_phone
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
		RETURNING *`,
		[
			metadata.experience_id,
			metadata.experience,
			metadata.start_date,
			metadata.start_time,
			metadata.end_date,
			metadata.end_time,
			numberOfAdults,
			numberOfChildren,
			amountTotal,
			startlocation,
			metadata.customer_comment,
			amountCanoes,
			amountKayak,
			amountSup,
			metadata.booking_name,
			metadata.booking_lastname,
			metadata.customer_email,
			'pending',
			metadata.stripe_session_id,
			'pending',
			startSlot,
			endSlot,
			totalSlots,
			bookingType,
			'stripe',
			metadata.customer_phone
		]
	);

	console.log('Skapad bokning:', booking);
	return booking;
}

async function createBookingAddons(client, bookingId, metadata) {
	// hämta alla addons för denna experience
	const { rows: addons } = await client.query('SELECT id, column_name FROM addons');

	// skapa booking_addons poster
	for (const addon of addons) {
		const amount = parseInt(metadata[addon.column_name]) || 0;
		if (amount > 0) {
			await client.query(
				`INSERT INTO booking_addons (booking_id, addon_id, amount)
				 VALUES ($1, $2, $3)`,
				[bookingId, addon.id, amount]
			);
		}
	}
}

async function createBookingOptionalProducts(client, bookingId, metadata) {
	try {
		// kontrollera om det finns optional_products i metadata
		if (!metadata.optional_products) {
			console.log('Inga optional products att spara');
			return;
		}

		// parsa optional_products från metadata
		const optionalProducts = JSON.parse(metadata.optional_products || '[]');

		console.log('Sparar optional products:', optionalProducts);

		// spara varje optional product
		for (const product of optionalProducts) {
			await client.query(
				`INSERT INTO booking_optional_products 
				 (booking_id, optional_product_id, quantity, price_per_unit, total_price) 
				 VALUES ($1, $2, $3, $4, $5)`,
				[bookingId, product.id, product.quantity, product.price, product.total_price]
			);
		}

		console.log(`✅ Sparat ${optionalProducts.length} optional products för bokning ${bookingId}`);
	} catch (error) {
		console.error('Fel vid sparande av optional products:', error);
		throw error;
	}
}
