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
				if (session.metadata.booking_type === 'guided') {
					// Kapacitetskontroll först
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

					const requestedSpots = parseInt(session.metadata.number_of_adults);
					const availableSpots = capacity.max_participants - capacity.current_bookings;

					if (availableSpots < requestedSpots) {
						throw new Error(
							`Inte tillräckligt med lediga platser. Tillgängligt: ${availableSpots}, Efterfrågat: ${requestedSpots}`
						);
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
							booking_type
						)
						VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
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
							'guided'
						]
					);

					// För guidade upplevelser, hoppa över addons-hantering
					if (session.metadata.booking_type === 'guided') {
						return booking;
					}

					// Resten av koden för icke-guidade upplevelser
					const bookingData = {
						start_date: session.metadata.start_date,
						end_date: session.metadata.end_date,
						start_time: session.metadata.start_time,
						end_time: session.metadata.end_time,
						booking_type: session.metadata.booking_type,
						booking_length: parseInt(session.metadata.booking_length) || 0
					};

					await updateAvailabilityForBooking(client, bookingData);
					return booking;
				}
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
	console.log('Starting availability update with booking data:', booking);

	const { rows: addons } = await client.query(
		'SELECT id, name, column_name, availability_table_name FROM addons'
	);
	console.log('Found addons:', addons);

	// generera alla datum mellan start och slut
	const dates = generateDateRange(booking.start_date, booking.end_date);
	console.log('Generated date range:', dates);

	const isMultiDayBooking = booking.booking_type === 'overnight';

	for (const addon of addons) {
		const amount = parseInt(booking[addon.column_name] || '0');

		if (amount > 0) {
			for (let i = 0; i < dates.length; i++) {
				const currentDate = dates[i];
				const isFirstDay = i === 0;
				const isLastDay = i === dates.length - 1;

				// beräkna start- och slutindex för varje dag
				let startIndex, endIndex;

				if (isFirstDay) {
					// första dagen: från starttid till midnatt
					startIndex = timeToIndex(booking.start_time);
					endIndex = 96; // 24:00
				} else if (isLastDay) {
					// sista dagen: från midnatt till sluttid
					startIndex = 0; // 00:00
					endIndex = timeToIndex(booking.end_time);
				} else {
					// mellandagar: hela dagen
					startIndex = 0;
					endIndex = 96;
				}

				console.log(`Updating availability for ${addon.name}:`, {
					table: addon.availability_table_name,
					date: currentDate,
					startIndex,
					endIndex,
					amount
				});

				await updateProductAvailability(
					client,
					addon.availability_table_name,
					currentDate,
					startIndex,
					endIndex,
					amount,
					isMultiDayBooking
				);
			}
		}
	}
}

async function updateProductAvailability(
	client,
	tableName,
	date,
	startIndex,
	endIndex,
	amount,
	isMultiDayBooking
) {
	try {
		const { rows } = await client.query(`SELECT * FROM ${tableName} WHERE date = $1`, [date]);

		if (rows.length === 0) {
			// skapa ny rad med alla tidsluckor blockerade
			const columns = ['date'];
			const values = [date];
			const placeholders = ['$1'];
			let paramIndex = 2;

			for (let i = 0; i <= 1440; i += 15) {
				columns.push(`"${i}"`);
				const shouldBlock = i >= startIndex * 15 && i <= endIndex * 15;
				values.push(shouldBlock ? -amount : 0);
				placeholders.push(`$${paramIndex}`);
				paramIndex++;
			}

			const query = `
                INSERT INTO ${tableName} (${columns.join(', ')})
                VALUES (${placeholders.join(', ')})
            `;

			await client.query(query, values);
		} else {
			// uppdatera existerande rad
			const updates = [];
			const values = [date];
			let paramIndex = 2;

			for (let i = startIndex * 15; i <= endIndex * 15; i += 15) {
				updates.push(`"${i}" = COALESCE("${i}", 0) - $${paramIndex}`);
				values.push(amount);
				paramIndex++;
			}

			if (updates.length > 0) {
				const query = `
                    UPDATE ${tableName}
                    SET ${updates.join(', ')}
                    WHERE date = $1
                `;

				await client.query(query, values);
			}
		}

		console.log('📊 Availability Update:', {
			table: tableName,
			date: date,
			timeRange: `${startIndex * 15}-${endIndex * 15}`,
			amount: amount
		});
	} catch (error) {
		console.error(`Error updating ${tableName} for ${date}:`, error);
		throw error;
	}
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
