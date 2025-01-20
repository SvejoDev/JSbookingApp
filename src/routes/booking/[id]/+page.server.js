import { query } from '$lib/db.js';

export async function load({ params }) {
	try {
		// hämta upplevelsen med alla dess addons i en enda query
		const experienceResult = await query(
			`
            SELECT 
                e.*,
                json_agg(
                    json_build_object(
                        'id', a.id,
                        'name', a.name,
                        'max_quantity', a.max_quantity,
                        'image_url', a.image_url,
                        'column_name', a.column_name
                    )
                ) as addons
            FROM experiences e
            LEFT JOIN experience_addons ea ON e.id = ea.experience_id
            LEFT JOIN addons a ON ea.addon_id = a.id
            WHERE e.id = $1
            GROUP BY e.id
        `,
			[params.id]
		);

		const experience = experienceResult.rows[0];

		if (!experience) {
			console.error('upplevelsen hittades inte');
			return { error: 'upplevelsen hittades inte' };
		}

		// hämta övrig data som behövs för bokningen
		const [startLocations, bookingLengths, openHours, blockedDates, blockedStartTimes] =
			await Promise.all([
				query('SELECT id, location, price FROM start_locations WHERE experience_id = $1', [
					params.id
				]),
				query('SELECT * FROM booking_lengths'),
				query(
					'SELECT start_date, end_date, open_time, close_time FROM experience_open_dates WHERE experience_id = $1',
					[params.id]
				),
				query('SELECT blocked_date FROM blocked_dates WHERE experience_id = $1', [params.id]),
				query(
					'SELECT blocked_date, blocked_time FROM blocked_start_times WHERE experience_id = $1',
					[params.id]
				)
			]);

		return {
			experience: {
				...experience,
				addons: experience.addons.filter((addon) => addon.id !== null) // filtrera bort null-värden från LEFT JOIN
			},
			startLocations: startLocations.rows,
			bookingLengths: bookingLengths.rows,
			openHours: openHours.rows[0],
			blocked_dates: blockedDates.rows,
			blocked_start_times: blockedStartTimes.rows
		};
	} catch (error) {
		console.error('fel vid hämtning av bokningsdata:', error);
		return {
			error: 'kunde inte ladda bokningsdata'
		};
	}
}
