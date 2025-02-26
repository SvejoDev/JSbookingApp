import { redirect, error } from '@sveltejs/kit';
import { logger } from '$lib/utils/logger';
import { query, transaction } from '$lib/db.js';
import { sendBookingConfirmation } from '$lib/email.js';

export const load = async ({ url }) => {
	const sessionId = url.searchParams.get('session_id');

	if (!sessionId) {
		throw error(400, 'Ingen session ID tillgänglig');
	}

	// Lägg till en kort fördröjning för att säkerställa att bokningen har skapats
	await new Promise((resolve) => setTimeout(resolve, 2000));

	try {
		const booking = await transaction(async (client) => {
			const { rows } = await client.query('SELECT * FROM bookings WHERE stripe_session_id = $1', [
				sessionId
			]);

			if (rows.length === 0) {
				throw new Error('Bokning hittades inte');
			}

			return rows[0];
		});

		return {
			booking
		};
	} catch (err) {
		console.error('Fel vid hämtning av bokning:', err);
		throw error(404, 'Bokning hittades inte');
	}
};
