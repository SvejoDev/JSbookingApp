import { json } from '@sveltejs/kit';
import { query } from '$lib/db.js';

export async function POST({ request }) {
	const { bookingId } = await request.json();

	try {
		await query('BEGIN');

		await query('UPDATE bookings SET status = $1 WHERE id = $2', ['started', bookingId]);

		await query('COMMIT');
		return json({ success: true });
	} catch (error) {
		await query('ROLLBACK');
		console.error('Error starting booking:', error);
		return json({ error: 'Failed to start booking' }, { status: 500 });
	}
}
