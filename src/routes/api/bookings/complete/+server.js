import { json } from '@sveltejs/kit';
import { query, transaction } from '$lib/db.js';

function generateDateRange(startDate, endDate) {
	const dates = [];
	let [startYear, startMonth, startDay] = startDate.split('-').map(Number);
	let [endYear, endMonth, endDay] = endDate.split('-').map(Number);

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

async function restoreAvailabilityAfterBooking(client, bookingId) {
	try {
		const {
			rows: [booking]
		} = await client.query(
			`SELECT 
        start_date::text as start_date,
        end_date::text as end_date,
        start_time::text as start_time,
        end_time::text as end_time
      FROM bookings 
      WHERE id = $1`,
			[bookingId]
		);

		if (!booking) {
			throw new Error('Bokning hittades inte');
		}

		console.log('Booking details:', booking);

		const { rows: addons } = await client.query(
			'SELECT name, column_name, availability_table_name FROM addons'
		);

		const addonAmounts = {};
		for (const addon of addons) {
			const {
				rows: [amount]
			} = await client.query(`SELECT ${addon.column_name} FROM bookings WHERE id = $1`, [
				bookingId
			]);
			addonAmounts[addon.column_name] = amount[addon.column_name];
			console.log(`Addon ${addon.name} amount:`, amount[addon.column_name]);
		}

		const dates = generateDateRange(booking.start_date, booking.end_date);
		console.log('Dates to process:', dates);

		for (let i = 0; i < dates.length; i++) {
			const currentDate = dates[i];
			const isFirstDay = i === 0;
			const isLastDay = i === dates.length - 1;
			const isMiddleDay = !isFirstDay && !isLastDay;

			let startIndex, endIndex;

			if (isFirstDay) {
				// Första dagen: Från starttid till midnatt (23:45)
				startIndex = timeToIndex(booking.start_time);
				endIndex = 96; // Ändrad från 95 till 96 för att inkludera sista kolumnen
			} else if (isMiddleDay) {
				// Mellandagar: Hela dagen
				startIndex = 0; // 00:00
				endIndex = 96; // Ändrad från 95 till 96
			} else if (isLastDay) {
				// Sista dagen: Från midnatt till sluttid
				startIndex = 0; // 00:00
				endIndex = timeToIndex(booking.end_time);
			}

			console.log('Processing date:', {
				date: currentDate,
				isFirstDay,
				isMiddleDay,
				isLastDay,
				startIndex,
				endIndex
			});

			for (const addon of addons) {
				const amount = addonAmounts[addon.column_name];
				if (amount > 0) {
					await restoreProductAvailability(
						client,
						addon.availability_table_name,
						currentDate,
						startIndex,
						endIndex,
						amount
					);
				}
			}
		}

		await client.query('UPDATE bookings SET status = $1 WHERE id = $2', ['genomförd', bookingId]);

		return true;
	} catch (error) {
		console.error('Fel vid återställning av tillgänglighet:', error);
		throw error;
	}
}

async function restoreProductAvailability(client, tableName, date, startIndex, endIndex, amount) {
	try {
		console.log('Restoring availability for:', {
			tableName,
			date,
			startIndex,
			endIndex,
			amount
		});

		const updates = [];
		const values = [date];
		let paramIndex = 2;

		// Inkludera alla kolumner från startIndex till och med endIndex
		for (let i = startIndex; i <= endIndex; i++) {
			const minutes = i * 15;
			updates.push(`"${minutes}" = COALESCE("${minutes}", 0) + $${paramIndex}`);
			values.push(amount);
			paramIndex++;
		}

		if (updates.length > 0) {
			const query = `
        UPDATE ${tableName}
        SET ${updates.join(', ')}
        WHERE date = $1
      `;

			console.log(`Updating ${updates.length} columns for ${date}`, {
				startMinutes: startIndex * 15,
				endMinutes: endIndex * 15
			});

			await client.query(query, values);
		}
	} catch (error) {
		console.error(`Fel vid återställning av ${tableName} för ${date}:`, error);
		throw error;
	}
}

export async function POST({ request }) {
	try {
		const { bookingId } = await request.json();

		if (!bookingId) {
			return json(
				{
					success: false,
					error: 'Booking ID saknas'
				},
				{ status: 400 }
			);
		}

		await transaction(async (client) => {
			await restoreAvailabilityAfterBooking(client, bookingId);
		});

		return json({
			success: true,
			message: 'Tillgänglighet har återställts och bokning är markerad som genomförd'
		});
	} catch (error) {
		console.error('Fel vid återställning:', error);
		return json(
			{
				success: false,
				error: 'Kunde inte återställa tillgänglighet',
				details: error.message
			},
			{ status: 500 }
		);
	}
}
