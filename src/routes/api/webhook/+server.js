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
						// lägg till alla addon-värden från metadata
						...Object.fromEntries(
							Object.entries(session.metadata).filter(([key]) => key.startsWith('amount_'))
						)
					};
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

async function updateAvailabilityForBooking(client, booking) {
	const dates = generateDateRange(booking.start_date, booking.end_date);
	const isMultiDayBooking = booking.booking_type === 'overnight';

	const { rows: addons } = await client.query(
		'SELECT id, name, column_name, availability_table_name FROM addons'
	);

	const addonAmounts = {};
	for (const addon of addons) {
		const amount = parseInt(booking[addon.column_name] || '0');
		addonAmounts[addon.column_name] = amount;
	}

	for (const addon of addons) {
		const amount = addonAmounts[addon.column_name];

		if (amount > 0) {
			for (let i = 0; i < dates.length; i++) {
				const currentDate = dates[i];
				const isFirstDay = i === 0;
				const isLastDay = i === dates.length - 1;
				const isMiddleDay = !isFirstDay && !isLastDay;

				let startIndex, endIndex;

				if (!isMultiDayBooking) {
					// För endagsbokningar använder vi exakt start- och sluttid
					startIndex = timeToIndex(booking.start_time);
					endIndex = timeToIndex(booking.end_time);
				} else {
					// För övernattningsbokningar behåller vi den ursprungliga logiken
					if (isFirstDay) {
						startIndex = timeToIndex(booking.start_time);
						endIndex = 96; // 24:00
					} else if (isMiddleDay) {
						startIndex = 0;
						endIndex = 96;
					} else if (isLastDay) {
						startIndex = 0;
						endIndex = timeToIndex(booking.end_time);
					}
				}

				console.log(`Uppdaterar ${addon.name}:`, {
					date: currentDate,
					startIndex,
					endIndex,
					amount: amount,
					isMultiDayBooking,
					bookingType: booking.booking_type
				});

				// uppdatera varje tidslucka
				for (let slot = startIndex; slot <= endIndex; slot++) {
					const minutes = (slot * 15).toString();
					const updateQuery = `
						INSERT INTO ${addon.availability_table_name} (date, "${minutes}")
						VALUES ($1, $2)
						ON CONFLICT (date) DO UPDATE
						SET "${minutes}" = COALESCE(${addon.availability_table_name}."${minutes}", 0) - $3;
					`;

					await client.query(updateQuery, [currentDate, -amount, amount]);
				}
			}
		}
	}

	// uppdatera bokningen med slot-information
	await client.query(
		`
		UPDATE bookings 
		SET 
			start_slot = $1,
			end_slot = $2,
			total_slots = $3
		WHERE stripe_session_id = $4
	`,
		[
			timeToIndex(booking.start_time),
			timeToIndex(booking.end_time),
			calculateTotalSlots(booking.start_time, booking.end_time),
			booking.stripe_session_id
		]
	);
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
