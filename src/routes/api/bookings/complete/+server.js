import { json } from '@sveltejs/kit';
import { query } from '$lib/db.js';

export async function POST({ request }) {
	const { bookingId, endTime } = await request.json();

	try {
		await query('BEGIN');

		// Get booking details and available addons
		const [
			{
				rows: [booking]
			},
			{ rows: addons }
		] = await Promise.all([
			query('SELECT * FROM bookings WHERE id = $1', [bookingId]),
			query('SELECT name FROM addons')
		]);

		if (!booking) {
			throw new Error('Booking not found');
		}

		// Update booking status and end time
		await query('UPDATE bookings SET status = $1, end_time = $2 WHERE id = $3', [
			'completed',
			endTime,
			bookingId
		]);

		// Release equipment for each addon type
		for (const addon of addons) {
			const addonKey = `amount_${addon.name.toLowerCase()}`;
			const amount = booking[addonKey];

			if (amount > 0) {
				await releaseEquipment(addon.name.toLowerCase(), booking, endTime);
			}
		}

		await query('COMMIT');
		return json({ success: true });
	} catch (error) {
		await query('ROLLBACK');
		console.error('Error completing booking:', error);
		return json({ error: 'Failed to complete booking' }, { status: 500 });
	}
}

async function releaseEquipment(type, booking, newEndTime) {
	const dates = generateDateRange(booking.start_date, booking.end_date);

	for (let i = 0; i < dates.length; i++) {
		const currentDate = dates[i];
		const isFirstDay = i === 0;
		const isLastDay = i === dates.length - 1;

		let startSlot, endSlot;

		if (isFirstDay) {
			startSlot = timeToMinutes(booking.start_time) / 15;
			endSlot = isLastDay ? timeToMinutes(newEndTime) / 15 : 96; // 96 slots in a day (24h * 4)
		} else if (isLastDay) {
			startSlot = 0;
			endSlot = timeToMinutes(newEndTime) / 15;
		} else {
			startSlot = 0;
			endSlot = 96;
		}

		const updates = [];
		for (let slot = Math.floor(startSlot); slot <= Math.floor(endSlot); slot++) {
			updates.push(`"${slot}" = COALESCE("${slot}", 0) + ${booking[`amount_${type}`]}`);
		}

		if (updates.length > 0) {
			const tableName = `${type}_availability`.toLowerCase();
			await query(
				`UPDATE ${tableName}
                SET ${updates.join(', ')} 
                WHERE date = $1`,
				[currentDate]
			);
		}
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

function timeToMinutes(timeStr) {
	const [hours, minutes] = timeStr.split(':').map(Number);
	return hours * 60 + minutes;
}


