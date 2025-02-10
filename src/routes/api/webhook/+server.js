import { json } from '@sveltejs/kit';
import { query, transaction } from '$lib/db.js';
import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST({ request }) {
	const payload = await request.text();
	const sig = request.headers.get('stripe-signature');

	let event;

	try {
		event = stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET);
		console.group('💫 Stripe Webhook Event');
		console.log('🎫 Event Type:', event.type);
	} catch (err) {
		console.error(`webhook fel: ${err.message}`);
		return json({ error: `webhook fel: ${err.message}` }, { status: 400 });
	}

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
						throw new Error('Kunde inte hitta kapacitetsinformation för denna guidade upplevelse');
					}

					const requestedSpots = parseInt(session.metadata.number_of_adults);
					const availableSpots = capacity.max_participants - capacity.current_bookings;

					if (availableSpots < requestedSpots) {
						throw new Error(
							`Inte tillräckligt med lediga platser. Tillgängligt: ${availableSpots}, Efterfrågat: ${requestedSpots}`
						);
					}
				}

				// Skapa bokningen
				const {
					rows: [booking]
				} = await client.query(
					`
					INSERT INTO bookings (
					experience_id,
					experience,
					start_date,
					end_date,
					start_time,
					end_time,
					number_of_adults,
					number_of_children,
					booking_name,
					booking_lastname,
					customer_email,
					customer_phone,
					customer_comment,
					amount_total,
					stripe_session_id,
					status,
					booking_type,
					startLocation,
					amount_canoes,
					start_slot,
					end_slot,
					total_slots
				)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
					RETURNING *
					`,
					[
						session.metadata.experience_id,
						session.metadata.experience,
						session.metadata.start_date,
						session.metadata.end_date,
						session.metadata.start_time,
						session.metadata.end_time,
						parseInt(session.metadata.number_of_adults),
						parseInt(session.metadata.number_of_children),
						session.metadata.booking_name,
						session.metadata.booking_lastname,
						session.metadata.customer_email,
						session.metadata.customer_phone,
						session.metadata.customer_comment,
						Math.round(session.amount_total / 100),
						session.id,
						'betald',
						session.metadata.booking_type,
						parseInt(session.metadata.selectedStartLocation),
						parseInt(session.metadata.amount_canoes),
						parseInt(session.metadata.start_slot),
						parseInt(session.metadata.end_slot),
						parseInt(session.metadata.total_slots)
					]
				);

				// Hantera addons endast för icke-guidade upplevelser
				if (session.metadata.booking_type !== 'guided') {
					const bookingData = {
						start_date: session.metadata.start_date,
						end_date: session.metadata.end_date,
						start_time: session.metadata.start_time,
						end_time: session.metadata.end_time,
						booking_type: session.metadata.booking_type,
						booking_length: parseInt(session.metadata.booking_length) || 0,
						// lägg till alla amount_* värden från metadata
						...Object.fromEntries(
							Object.entries(session.metadata)
								.filter(([key]) => key.startsWith('amount_'))
								.map(([key, value]) => [key, parseInt(value) || 0])
						)
					};

					console.log('Booking data for availability update:', bookingData);
					await updateAvailabilityForBooking(client, bookingData);
				}

				return booking;
			});

			console.log('✅ Booking Complete');
			return json({ received: true, message: 'bokning genomförd' });
		} catch (error) {
			console.error('fel vid bokning:', error);
			return json({ error: 'fel vid bokning', details: error.message }, { status: 500 });
		}
	}

	return json({ received: true });
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
						console.log(`\n=== Dagsbokning (${dateStr}) ===`);
						console.log(
							`Blockerar från ${formatMinutes(startMinutes)} till ${formatMinutes(endMinutes)}`
						);
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
					for (let minutes = startMinutes; minutes <= endMinutes; minutes += 15) {
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

function calculateTotalSlots(startTime, endTime) {
	const startSlot = calculateTimeSlot(startTime);
	const endSlot = calculateTimeSlot(endTime);
	return endSlot - startSlot;
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
