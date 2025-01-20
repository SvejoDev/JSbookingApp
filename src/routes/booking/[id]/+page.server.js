// src/routes/booking/[id]/+page.server.js
import { query } from '$lib/db.js';

export async function load({ params }) {
	try {
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
			console.error('Experience not found');
			return { error: 'Experience not found' };
		}

		// Fetch all necessary data for booking
		const [
			startLocations,
			bookingLengths,
			periodOpenDates,
			specificDates,
			blockedDates,
			blockedStartTimes
		] = await Promise.all([
			query('SELECT id, location, price FROM start_locations WHERE experience_id = $1', [
				params.id
			]),
			query('SELECT * FROM booking_lengths'),
			query(
				'SELECT start_date, end_date, open_time, close_time FROM experience_open_dates WHERE experience_id = $1',
				[params.id]
			),
			query(
				'SELECT available_date, open_time, close_time FROM experience_available_dates WHERE experience_id = $1',
				[params.id]
			),
			query('SELECT blocked_date FROM blocked_dates WHERE experience_id = $1', [params.id]),
			query('SELECT blocked_date, blocked_time FROM blocked_start_times WHERE experience_id = $1', [
				params.id
			])
		]);

		// Structure the opening hours data
		const openHours = {
			periods: periodOpenDates.rows,
			specificDates: specificDates.rows,
			defaultOpenTime: specificDates.rows[0]?.open_time || periodOpenDates.rows[0]?.open_time,
			defaultCloseTime: specificDates.rows[0]?.close_time || periodOpenDates.rows[0]?.close_time
		};

		return {
			experience: {
				...experience,
				addons: experience.addons.filter((addon) => addon.id !== null)
			},
			startLocations: startLocations.rows,
			bookingLengths: bookingLengths.rows,
			openHours,
			blocked_dates: blockedDates.rows,
			blocked_start_times: blockedStartTimes.rows
		};
	} catch (error) {
		console.error('Error fetching booking data:', error);
		return {
			error: 'Could not load booking data'
		};
	}
}
