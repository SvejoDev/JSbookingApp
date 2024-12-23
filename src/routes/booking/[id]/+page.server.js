import { query } from '$lib/db.js';

export async function load({ params }) {
	try {
		// hämta upplevelsen
		const experienceResult = await query('SELECT * FROM experiences WHERE id = $1', [params.id]);
		const experience = experienceResult.rows[0];

		if (!experience) {
			console.error('upplevelsen hittades inte');
			return { error: 'upplevelsen hittades inte' };
		}

		// hämta tilläggsprodukter för upplevelsen
		const addonsResult = await query(
			`SELECT ea.experience_id, ea.addon_id, a.* 
             FROM experience_addons ea 
             JOIN addons a ON ea.addon_id = a.id 
             WHERE ea.experience_id = $1`,
			[params.id]
		);
		const experienceAddons = addonsResult.rows;

		// hämta startplatser
		const startLocationsResult = await query(
			'SELECT id, location, price FROM start_locations WHERE experience_id = $1',
			[params.id]
		);
		const startLocations = startLocationsResult.rows;

		// hämta bokningslängder
		const bookingLengthsResult = await query('SELECT * FROM booking_lengths');
		const bookingLengths = bookingLengthsResult.rows;

		// hämta öppettider
		const openHoursResult = await query(
			'SELECT start_date, end_date, open_time, close_time FROM experience_open_dates WHERE experience_id = $1',
			[params.id]
		);
		const openHours = openHoursResult.rows[0];

		// hämta blockerade datum
		const blockedDatesResult = await query(
			'SELECT blocked_date FROM blocked_dates WHERE experience_id = $1',
			[params.id]
		);
		const blockedDates = blockedDatesResult.rows;

		// hämta blockerade starttider
		const blockedStartTimesResult = await query(
			'SELECT blocked_date, blocked_time FROM blocked_start_times WHERE experience_id = $1',
			[params.id]
		);
		const blockedStartTimes = blockedStartTimesResult.rows;

		return {
			experience,
			experienceAddons,
			startLocations,
			bookingLengths,
			blocked_dates: blockedDates,
			blocked_start_times: blockedStartTimes,
			openHours
		};
	} catch (error) {
		console.error('fel vid hämtning av bokningsdata:', error);
		return {
			error: 'kunde inte ladda bokningsdata'
		};
	}
}
