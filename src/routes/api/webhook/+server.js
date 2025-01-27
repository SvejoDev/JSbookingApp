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
				// hämta alla addons från databasen för dynamisk hantering
				const { rows: addons } = await client.query(
					'SELECT id, name, column_name, availability_table_name FROM addons'
				);

				// hämta öppettider för korrekt hantering av tidsperioder
				const {
					rows: [openHours]
				} = await client.query(
					'SELECT open_time, close_time FROM experience_open_dates WHERE experience_id = $1',
					[session.metadata.experience_id]
				);

				// skapa dynamiska kolumner och värden för INSERT-frågan
				const baseColumns = [
					'stripe_session_id',
					'customer_email',
					'amount_total',
					'status',
					'experience_id',
					'experience',
					'startlocation',
					'start_date',
					'start_time',
					'end_date',
					'end_time',
					'start_slot',
					'end_slot',
					'booking_type',
					'total_slots',
					'number_of_adults',
					'number_of_children',
					'booking_name',
					'booking_lastname',
					'customer_comment'
				];

				const addonColumns = addons.map((addon) => addon.column_name);
				const allColumns = [...baseColumns, ...addonColumns, 'date_time_created'];

				const baseValues = [
					session.id,
					session.metadata.customer_email,
					Math.round(session.amount_total / 100),
					'betald',
					session.metadata.experience_id,
					session.metadata.experience,
					session.metadata.startLocation,
					session.metadata.start_date,
					session.metadata.start_time,
					session.metadata.end_date,
					session.metadata.end_time,
					parseInt(session.metadata.start_slot),
					parseInt(session.metadata.end_slot),
					session.metadata.booking_type,
					parseInt(session.metadata.total_slots),
					parseInt(session.metadata.number_of_adults),
					parseInt(session.metadata.number_of_children || '0'),
					session.metadata.booking_name,
					session.metadata.booking_lastname,
					session.metadata.customer_comment || ''
				];

				const addonValues = addons.map((addon) => {
					const value = parseInt(session.metadata[addon.column_name] || '0');
					console.log(
						`Processing addon ${addon.name}: column=${addon.column_name}, value=${value}`
					);
					return value;
				});

				const placeholders = Array(allColumns.length - 1)
					.fill(0)
					.map((_, i) => `$${i + 1}`)
					.concat('NOW()');

				const insertQuery = `
                    INSERT INTO bookings (${allColumns.filter((col) => col !== 'id').join(', ')})
                    VALUES (${placeholders.join(', ')})
                    RETURNING *
                `;

				const {
					rows: [booking]
				} = await client.query(insertQuery, [...baseValues, ...addonValues]);

				// skapa dynamiskt bokningsobjekt för tillgänglighetsuppdatering
				const bookingData = {
					start_date: session.metadata.start_date,
					end_date: session.metadata.end_date,
					start_time: session.metadata.start_time,
					end_time: session.metadata.end_time,
					booking_type: session.metadata.booking_type,
					...Object.fromEntries(
						addons.map(addon => [
							addon.column_name,
							parseInt(session.metadata[addon.column_name] || '0')
						])
					)
				};

				await updateAvailabilityForBooking(client, bookingData);

				console.log('📝 Booking Data:', {
					sessionId: session.id,
					experience: session.metadata.experience,
					startDate: session.metadata.start_date,
					startTime: session.metadata.start_time,
					participants: {
						adults: session.metadata.number_of_adults,
						children: session.metadata.number_of_children
					},
					amount: Math.round(session.amount_total / 100)
				});

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
	console.log('Starting availability update with booking data:', booking);

	// Hämta alla addons från databasen
	const { rows: addons } = await client.query(
		'SELECT id, name, column_name, availability_table_name FROM addons'
	);
	console.log('Found addons:', addons);

	// Generera datumintervall
	const dates = generateDateRange(booking.start_date, booking.end_date);
	console.log('Generated date range:', dates);

	const isMultiDayBooking = booking.booking_type === 'overnight';

	for (let i = 0; i < dates.length; i++) {
		const currentDate = dates[i];
		const isFirstDay = i === 0;
		const isLastDay = i === dates.length - 1;
		const isMiddleDay = !isFirstDay && !isLastDay;

		let startIndex = timeToIndex(isFirstDay ? booking.start_time : '00:00');
		let endIndex = timeToIndex(isLastDay ? booking.end_time : '23:59');

		// Uppdatera tillgänglighet för varje addon
		for (const addon of addons) {
			const amount = parseInt(booking[addon.column_name] || '0');
			
			if (amount > 0) {
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

				console.log('📊 Availability Update:', {
					table: addon.availability_table_name,
					date: currentDate,
					timeRange: `${startIndex * 15}-${endIndex * 15}`,
					amount: amount
				});
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

		// Beräkna start- och slutindex för blockering
		let startQuarter, endQuarter;

		if (isMultiDayBooking) {
			// Overnight booking logic
			startQuarter = startIndex * 15;
			endQuarter = endIndex * 15;
		} else {
			// Single day booking logic
			startQuarter = startIndex * 15;
			endQuarter = endIndex * 15;
		}

		if (rows.length === 0) {
			// Om ingen rad finns för datumet, skapa en ny
			const columns = ['date'];
			const values = [date];
			const placeholders = ['$1'];
			let paramIndex = 2;

			for (let i = 0; i <= 1440; i += 15) {
				columns.push(`"${i}"`);
				values.push(i >= startQuarter && i <= endQuarter ? -amount : 0);
				placeholders.push(`$${paramIndex}`);
				paramIndex++;
			}

			const query = `
                INSERT INTO ${tableName} (${columns.join(', ')})
                VALUES (${placeholders.join(', ')})
            `;

			await client.query(query, values);
		} else {
			// Uppdatera existerande rad
			const updates = [];
			const values = [date];
			let paramIndex = 2;

			for (let i = 0; i <= 1440; i += 15) {
				if (i >= startQuarter && i <= endQuarter) {
					updates.push(`"${i}" = COALESCE("${i}", 0) - $${paramIndex}`);
					values.push(amount);
					paramIndex++;
				}
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

	while (currentDate <= lastDate) {
		dates.push(
			`${currentDate.getUTCFullYear()}-${String(currentDate.getUTCMonth() + 1).padStart(2, '0')}-${String(currentDate.getUTCDate()).padStart(2, '0')}`
		);
		currentDate.setUTCDate(currentDate.getUTCDate() + 1);
	}

	return dates;
}

function timeToIndex(time) {
	const [hours, minutes] = time.split(':').map(Number);
	return Math.floor((hours * 60 + minutes) / 15);
}
