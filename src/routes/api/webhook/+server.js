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
		console.log('stripe event mottagen:', event.type);
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
				// Uppdatera addon-hämtningen (runt rad 32)
				const { rows: addons } = await client.query(
					'SELECT name, column_name, availability_table_name FROM addons'
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
					session.amount_total / 100,
					'betald',
					session.metadata.experience_id,
					session.metadata.experience,
					session.metadata.startLocation,
					session.metadata.start_date,
					session.metadata.start_time,
					session.metadata.end_date,
					session.metadata.end_time,
					parseInt(session.metadata.number_of_adults),
					parseInt(session.metadata.number_of_children || '0'),
					session.metadata.booking_name,
					session.metadata.booking_lastname,
					session.metadata.customer_comment || ''
				];

				// Uppdatera addonValues skapandet (runt rad 87-91)
				const addonValues = addons.map((addon) => {
					const metadataKey = `amount_${addon.column_name}`;
					const value = parseInt(session.metadata[metadataKey] || '0');
					console.log(`Processing addon ${addon.name}: metadataKey=${metadataKey}, value=${value}, metadata:`, session.metadata);
					return value;
				});

				console.log(
					'Addon metadata:',
					addons.map((addon) => ({
						name: addon.name,
						metadataKey: `amount_${addon.name.toLowerCase()}`,
						value: session.metadata[`amount_${addon.name.toLowerCase()}`]
					}))
				);

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
					start_time: session.metadata.start_time,
					end_date: session.metadata.end_date,
					end_time: session.metadata.end_time,
					openTime: openHours.open_time,
					closeTime: openHours.close_time
				};

				// lägg till addon-mängder dynamiskt
				for (const addon of addons) {
					const metadataKey = `amount_${addon.column_name}`;
					const value = parseInt(session.metadata[metadataKey] || '0');
					bookingData[addon.column_name] = value;
				}

				await updateAvailabilityForBooking(client, bookingData);

				return booking;
			});

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
		'SELECT name, column_name, availability_table_name FROM addons'
	);
	console.log('Found addons:', addons);

	const dates = generateDateRange(booking.start_date, booking.end_date);
	console.log('Generated date range:', dates);

	const numberOfDays = dates.length;

	for (let i = 0; i < numberOfDays; i++) {
		const currentDate = dates[i];
		const isFirstDay = i === 0;
		const isLastDay = i === numberOfDays - 1;
		const isMiddleDay = !isFirstDay && !isLastDay;

		let startIndex = isFirstDay ? timeToIndex(booking.start_time) : timeToIndex(booking.openTime);
		let endIndex = isLastDay ? timeToIndex(booking.end_time) : timeToIndex(booking.closeTime);

		const productUpdates = [];

		// hantera varje addon-typ dynamiskt
		for (const addon of addons) {
			const addonKey = addon.column_name;
			const amount = booking[addonKey];

			if (amount > 0) {
				console.log(
					`Updating availability for ${addon.name}: table=${addon.availability_table_name}, amount=${amount}`
				);

				productUpdates.push(
					updateProductAvailability(
						client,
						addon.availability_table_name,
						currentDate,
						startIndex,
						endIndex,
						amount,
						isMiddleDay
					)
				);
			}
		}

		await Promise.all(productUpdates);
	}
}

async function updateProductAvailability(
	client,
	productType,
	date,
	startIndex,
	endIndex,
	amount,
	isMiddleDay
) {
	try {
		// Konvertera timindex till kvartindex
		const quarterStartIndex = startIndex * 4;
		const quarterEndIndex = endIndex * 4;

		const { rows } = await client.query(
			`SELECT * FROM ${productType}_availability WHERE date = $1`,
			[date]
		);

		if (rows.length === 0) {
			// Skapa ny rad med 1440 minuter (24h * 60min) / 15min = 96 kvartar
			const values = [date];
			const columnsList = ['date'];
			const valuePlaceholders = ['$1'];
			let paramCounter = 2;

			// Loopa genom alla kvartar (0-95)
			for (let i = 0; i < 96; i++) {
				columnsList.push(`"${i * 15}"`);
				valuePlaceholders.push(`$${paramCounter}`);

				if (isMiddleDay || (i >= quarterStartIndex && i <= quarterEndIndex)) {
					values.push(-amount);
				} else {
					values.push(0);
				}
				paramCounter++;
			}

			const query = `
                INSERT INTO ${productType}_availability (${columnsList.join(', ')})
                VALUES (${valuePlaceholders.join(', ')})
            `;
			await client.query(query, values);
		} else {
			// Uppdatera befintlig rad
			const updates = [];
			for (let i = 0; i < 96; i++) {
				if (isMiddleDay || (i >= quarterStartIndex && i <= quarterEndIndex)) {
					updates.push(`"${i * 15}" = COALESCE("${i * 15}", 0) - ${amount}`);
				}
			}

			if (updates.length > 0) {
				const query = `
                    UPDATE ${productType}_availability 
                    SET ${updates.join(', ')}
                    WHERE date = $1
                `;
				await client.query(query, [date]);
			}
		}
	} catch (error) {
		console.error(`Fel vid uppdatering av ${productType} tillgänglighet:`, error);
		throw error;
	}
}

function generateDateRange(startDate, endDate) {
	const dates = [];
	let currentDate = new Date(startDate);
	const lastDate = new Date(endDate);

	while (currentDate <= lastDate) {
		dates.push(currentDate.toISOString().split('T')[0]);
		currentDate.setDate(currentDate.getDate() + 1);
	}

	return dates;
}

function timeToIndex(time) {
	const [hours, minutes] = time.split(':').map(Number);
	return Math.floor((hours * 60 + minutes) / 15);
}
