import { json } from '@sveltejs/kit';
import { logger } from '$lib/utils/logger';
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

		logger.info(`Webhook mottagen: ${event.type} vid ${new Date().toISOString()}`);

		if (event.type === 'checkout.session.completed') {
			const session = event.data.object;
			logger.info('Session metadata:', session.metadata);
			logger.info('Session ID:', session.id);

			try {
				// Kontrollera först om bokningen redan existerar
				const existingBooking = await query(
					'SELECT id FROM bookings WHERE stripe_session_id = $1',
					[session.id]
				);

				if (existingBooking.rows.length > 0) {
					logger.info('Bokning finns redan för session:', session.id);
					return json({ received: true, message: 'bokning redan genomförd' });
				}

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
					logger.info('Creating booking with data:', {
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
						// hämta alla addons
						const { rows: addons } = await client.query('SELECT name, column_name FROM addons');

						// skapa dynamisk addonslista
						const bookingAddons = addons
							.map((addon) => ({
								name: addon.name,
								amount: booking[addon.column_name] || 0
							}))
							.filter((addon) => addon.amount > 0);

						const formattedBooking = {
							...booking,
							id: booking.id,
							startLocationName: session.metadata.startlocation_name,
							startlocation: booking.startlocation,
							adultPrice: parseInt(session.metadata.adult_price),
							subtotal: booking.amount_total_exc_vat || 0,
							vat:
								booking.amount_total_inc_vat && booking.amount_total_exc_vat
									? booking.amount_total_inc_vat - booking.amount_total_exc_vat
									: 0,
							total: booking.amount_total_inc_vat || 0,
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
							addons: bookingAddons,
							optional_products: JSON.parse(session.metadata.optional_products || '[]'),
							optional_products_total: JSON.parse(
								session.metadata.optional_products || '[]'
							).reduce((sum, product) => sum + parseInt(product.total_price || 0), 0)
						};

						logger.info(
							'Fullständig bokningsdata för bekräftelse:',
							JSON.stringify(formattedBooking, null, 2)
						);

						await client.query('UPDATE bookings SET confirmation_sent = true WHERE id = $1', [
							booking.id
						]);

						try {
							await sendBookingConfirmation(formattedBooking, false);
							logger.info('✅ Bokningsbekräftelse skickad framgångsrikt');
						} catch (emailError) {
							logger.error('Fel vid sändning av bokningsbekräftelse:', emailError);
						}
					}

					// Efter att bokningen är skapad
					logger.info('Bokning skapad med session ID:', session.id);
					logger.info('Redirect URL:', `/success?session_id=${session.id}`);

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

				logger.info('✅ Booking Complete');
				return json({ received: true, message: 'bokning genomförd' });
			} catch (error) {
				logger.error('fel vid bokning:', error);
				throw error;
			}
		}

		logger.info(`Webhook behandlad: ${event.type}`);
		return json({ received: true });
	} catch (error) {
		logger.error('Webhook Error:', error.message);
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
							logger.info(`\n=== Första dagen (${dateStr}) ===`);
							logger.info(`Blockerar från ${formatMinutes(startMinutes)} till 00:00`);
						} else if (isMiddleDay) {
							startMinutes = 0;
							endMinutes = 1440;
							logger.info(`\n=== Mellandag (${dateStr}) ===`);
							logger.info(`Blockerar hela dagen (00:00-00:00)`);
						} else if (isLastDay) {
							startMinutes = 0;
							endMinutes = timeToMinutes(bookingData.end_time);
							logger.info(`\n=== Sista dagen (${dateStr}) ===`);
							logger.info(`Blockerar från 00:00 till ${formatMinutes(endMinutes)}`);
						}
					} else {
						// Dagsbokning eller hela dagen
						startMinutes = timeToMinutes(bookingData.start_time);
						endMinutes = timeToMinutes(bookingData.end_time);

						if (process.env.NODE_ENV === 'development') {
							logger.info(`=== Bokning (${dateStr}) ===`);
							logger.info(`Tid: ${formatMinutes(startMinutes)} till ${formatMinutes(endMinutes)}`);
						}
					}

					logger.info('Debug:', {
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
		logger.error('Fel vid uppdatering av tillgänglighet:', error);
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

	logger.info('Generated date range:', dates);
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
	logger.info('Creating booking with complete metadata:', {
		...metadata,
		end_date: metadata.end_date,
		end_time: metadata.end_time
	});

	// Validera tider innan SQL-frågan
	if (!metadata.end_time) {
		metadata.end_time = metadata.start_time;
	}

	// säkerställ att alla numeriska värden är giltiga integers
	const numberOfAdults = parseInt(metadata.number_of_adults) || 0;
	const numberOfChildren = parseInt(metadata.number_of_children) || 0;
	const amountTotalExcVat = parseInt(metadata.amount_total_exc_vat) || 0;
	const amountTotalIncVat = parseInt(metadata.amount_total_inc_vat) || 0;

	// hämta alla addons och deras kolumnnamn
	const { rows: addons } = await client.query('SELECT id, name, column_name FROM addons');

	// skapa dynamiska kolumner och värden för addons
	const addonColumns = addons.map((addon) => addon.column_name);
	const addonValues = addons.map((addon) => parseInt(metadata[addon.column_name]) || 0);

	// beräkna start_slot, end_slot och total_slots
	const startSlot = metadata.start_slot
		? parseInt(metadata.start_slot)
		: calculateTimeSlot(metadata.start_time);
	const endSlot = metadata.end_slot
		? parseInt(metadata.end_slot)
		: calculateTimeSlot(metadata.end_time);
	const totalSlots = metadata.total_slots ? parseInt(metadata.total_slots) : endSlot - startSlot;

	// bestäm booking_type
	const bookingType =
		metadata.booking_type || (metadata.start_date === metadata.end_date ? 'day' : 'overnight');

	const startlocation = parseInt(metadata.startlocation) || null;

	// skapa dynamisk SQL-fråga
	const columns = [
		'experience_id',
		'experience',
		'start_date',
		'end_date',
		'start_time',
		'end_time',
		'number_of_adults',
		'number_of_children',
		'amount_total_exc_vat',
		'amount_total_inc_vat',
		'startlocation',
		'customer_comment',
		'booking_name',
		'booking_lastname',
		'customer_email',
		'status',
		'stripe_session_id',
		'booking_status',
		'start_slot',
		'end_slot',
		'total_slots',
		'booking_type',
		'payment_method',
		'customer_phone',
		...addonColumns
	];

	const placeholders = Array.from({ length: columns.length }, (_, i) => `$${i + 1}`);

	const values = [
		metadata.experience_id,
		metadata.experience,
		metadata.start_date,
		metadata.end_date,
		metadata.start_time,
		metadata.end_time,
		numberOfAdults,
		numberOfChildren,
		amountTotalExcVat,
		amountTotalIncVat,
		startlocation,
		metadata.customer_comment || '',
		metadata.booking_name,
		metadata.booking_lastname,
		metadata.customer_email,
		'confirmed',
		session.id,
		'pending',
		startSlot,
		endSlot,
		totalSlots,
		bookingType,
		'stripe',
		metadata.customer_phone,
		...addonValues
	];

	const {
		rows: [booking]
	} = await client.query(
		`INSERT INTO bookings (${columns.join(', ')})
		 VALUES (${placeholders.join(', ')})
		 RETURNING *`,
		values
	);

	return booking;
}

async function createBookingAddons(client, bookingId, addons) {
	try {
		// kontrollera om det redan finns addons för denna bokning
		const { rows: existingAddons } = await client.query(
			'SELECT addon_id FROM booking_addons WHERE booking_id = $1',
			[bookingId]
		);

		// skapa en uppslagstabell för befintliga addons
		const existingAddonIds = new Set(existingAddons.map((row) => row.addon_id));

		// hämta alla tillgängliga addons för att få deras id och column_name
		const { rows: allAddons } = await client.query('SELECT id, column_name FROM addons');

		// skapa en mappning mellan column_name och id
		const addonColumnToId = {};
		allAddons.forEach((addon) => {
			addonColumnToId[addon.column_name] = addon.id;
		});

		// skapa en array för att lagra alla insättningar
		const insertPromises = [];

		// gå igenom alla addons och lägg till dem om de inte redan finns
		for (const [key, value] of Object.entries(addons)) {
			if (key.startsWith('amount_') && value > 0) {
				const addonId = addonColumnToId[key];

				if (addonId && !existingAddonIds.has(addonId)) {
					// lägg bara till om addon inte redan finns för denna bokning
					insertPromises.push(
						client.query(
							'INSERT INTO booking_addons (booking_id, addon_id, amount) VALUES ($1, $2, $3)',
							[bookingId, addonId, value]
						)
					);
				}
			}
		}

		// kör alla insättningar parallellt
		if (insertPromises.length > 0) {
			await Promise.all(insertPromises);
		}

		return true;
	} catch (error) {
		console.error('Fel vid skapande av booking_addons:', error);
		throw error;
	}
}

async function createBookingOptionalProducts(client, bookingId, metadata) {
	try {
		// kontrollera om det finns optional_products i metadata
		if (!metadata.optional_products) {
			logger.info('Inga optional products att spara');
			return;
		}

		// parsa optional_products från metadata
		let optionalProducts;
		try {
			optionalProducts = JSON.parse(metadata.optional_products || '[]');
		} catch (error) {
			logger.error('Fel vid parsning av optional_products:', error);
			return;
		}

		logger.info('Sparar optional products:', optionalProducts);

		// spara varje optional product
		for (const product of optionalProducts) {
			await client.query(
				`INSERT INTO booking_optional_products 
				 (booking_id, optional_product_id, quantity, price_per_unit, total_price) 
				 VALUES ($1, $2, $3, $4, $5)`,
				[bookingId, product.id, product.quantity, product.price, product.total_price]
			);
		}

		logger.info(`✅ Sparat ${optionalProducts.length} optional products för bokning ${bookingId}`);
	} catch (error) {
		logger.error('Fel vid sparande av optional products:', error);
		throw error;
	}
}
