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
		console.log('bokning genomförd:', session.id);

		try {
			await transaction(async (client) => {
				// skapa bokningen
				const {
					rows: [booking]
				} = await client.query(
					`INSERT INTO bookings (
                        stripe_session_id, customer_email, amount_total, status,
                        experience_id, experience, startLocation, start_date,
                        start_time, end_date, end_time, number_of_adults,
                        number_of_children, amount_canoes, amount_kayak,
                        amount_sup, booking_name, booking_lastname,
                        customer_comment, date_time_created
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW())
                    RETURNING *`,
					[
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
						parseInt(session.metadata.amount_canoes || '0'),
						parseInt(session.metadata.amount_kayak || '0'),
						parseInt(session.metadata.amount_sup || '0'),
						session.metadata.booking_name,
						session.metadata.booking_lastname,
						session.metadata.customer_comment || ''
					]
				);

				// hämta öppettider för korrekt hantering av tidsperioder
				const {
					rows: [openHours]
				} = await client.query(
					'SELECT open_time, close_time FROM experience_open_dates WHERE experience_id = $1',
					[session.metadata.experience_id]
				);

				// uppdatera tillgänglighet för alla dagar i bokningen
				await updateAvailabilityForBooking(client, {
					start_date: session.metadata.start_date,
					start_time: session.metadata.start_time,
					end_date: session.metadata.end_date,
					end_time: session.metadata.end_time,
					amount_canoes: parseInt(session.metadata.amount_canoes || '0'),
					amount_kayak: parseInt(session.metadata.amount_kayak || '0'),
					amount_sup: parseInt(session.metadata.amount_sup || '0'),
					openTime: openHours.open_time,
					closeTime: openHours.close_time
				});

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
	const dates = generateDateRange(booking.start_date, booking.end_date);
	const numberOfDays = dates.length;

	for (let i = 0; i < numberOfDays; i++) {
		const currentDate = dates[i];
		const isFirstDay = i === 0;
		const isLastDay = i === numberOfDays - 1;
		const isMiddleDay = !isFirstDay && !isLastDay;

		let startIndex, endIndex;

		if (isFirstDay) {
			startIndex = timeToIndex(booking.start_time);
			endIndex = timeToIndex(booking.closeTime);
		} else if (isLastDay) {
			startIndex = timeToIndex(booking.openTime);
			endIndex = timeToIndex(booking.end_time);
		} else {
			startIndex = timeToIndex(booking.openTime);
			endIndex = timeToIndex(booking.closeTime);
		}

		const productUpdates = [];

		// uppdatera kanottillgänglighet
		if (booking.amount_canoes > 0) {
			productUpdates.push(
				updateProductAvailability(
					client,
					'canoe',
					currentDate,
					startIndex,
					endIndex,
					booking.amount_canoes,
					isMiddleDay
				)
			);
		}

		// uppdatera kajaktillgänglighet
		if (booking.amount_kayak > 0) {
			productUpdates.push(
				updateProductAvailability(
					client,
					'kayak',
					currentDate,
					startIndex,
					endIndex,
					booking.amount_kayak,
					isMiddleDay
				)
			);
		}

		// uppdatera SUP-tillgänglighet
		if (booking.amount_sup > 0) {
			productUpdates.push(
				updateProductAvailability(
					client,
					'sup',
					currentDate,
					startIndex,
					endIndex,
					booking.amount_sup,
					isMiddleDay
				)
			);
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
		// kontrollera om det redan finns en rad för detta datum
		const { rows } = await client.query(
			`SELECT * FROM ${productType}_availability WHERE date = $1`,
			[date]
		);

		// först, hämta kolumnerna från databasen för att säkerställa att de finns
		const { rows: columnInfo } = await client.query(
			`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = $1 
            AND column_name != 'date'
            ORDER BY column_name::integer
        `,
			[`${productType}_availability`]
		);

		// skapa kolumnnamn array från faktisk databasstruktur
		const timeColumns = columnInfo.map((col) => `"${col.column_name}"`);

		if (rows.length === 0) {
			// förbered alla värden som ska införas
			const values = [date]; // börja med datum
			const columnsList = ['date']; // lista över kolumner att inkludera
			const valuePlaceholders = ['$1']; // börja med första platshållaren
			let paramCounter = 2;

			// lägg till värden för varje tidskolumn som faktiskt finns
			timeColumns.forEach((column, index) => {
				const colNum = parseInt(column.replace(/"/g, '')); // ta bort citattecken och konvertera till nummer
				columnsList.push(column);
				valuePlaceholders.push(`$${paramCounter}`);

				if (isMiddleDay || (colNum >= startIndex && colNum <= endIndex)) {
					values.push(-amount);
				} else {
					values.push(0);
				}
				paramCounter++;
			});

			const query = `
                INSERT INTO ${productType}_availability (${columnsList.join(', ')})
                VALUES (${valuePlaceholders.join(', ')})
            `;

			await client.query(query, values);
			console.log(`skapat ny rad i ${productType}_availability för ${date}`);
		} else {
			// uppdatera befintlig rad
			const updates = [];

			timeColumns.forEach((column) => {
				const colNum = parseInt(column.replace(/"/g, '')); // ta bort citattecken och konvertera till nummer
				if (isMiddleDay || (colNum >= startIndex && colNum <= endIndex)) {
					updates.push(`${column} = COALESCE(${column}, 0) - ${amount}`);
				}
			});

			if (updates.length > 0) {
				const query = `
                    UPDATE ${productType}_availability 
                    SET ${updates.join(', ')}
                    WHERE date = $1
                `;
				await client.query(query, [date]);
				console.log(`uppdaterat befintlig rad i ${productType}_availability för ${date}`);
			}
		}
	} catch (error) {
		console.error(`fel vid uppdatering av ${productType} tillgänglighet för ${date}:`, error);
		console.error('detaljer:', error.detail || 'inga ytterligare detaljer');
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

function timeToIndex(timeStr) {
	const [hours, minutes] = timeStr.split(':').map(Number);
	return Math.floor((hours * 60 + minutes) / 15);
}
