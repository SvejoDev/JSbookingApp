import { query } from '$lib/db.js';

export async function load({ params }) {
	try {
		// Lägg till console.group i början av funktionen
		console.group('📋 Laddar bokningssida');
		console.log('Experience ID:', params.id);

		// Hämta upplevelsen med alla dess addons i en enda query
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
			console.error('Upplevelsen hittades inte');
			return { error: 'Upplevelsen hittades inte' };
		}

		// Hämta all nödvändig data för bokningen
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
				'SELECT available_date, open_time, close_time FROM experience_available_dates WHERE experience_id = $1 ORDER BY available_date, open_time',
				[params.id]
			),
			query('SELECT blocked_date FROM blocked_dates WHERE experience_id = $1', [params.id]),
			query('SELECT blocked_date, blocked_time FROM blocked_start_times WHERE experience_id = $1', [
				params.id
			])
		]);

		// Gruppera specifika datum med deras tidsintervall
		const groupedSpecificDates = specificDates.rows.reduce((acc, curr) => {
			// Convert the date string to YYYY-MM-DD format without timezone conversion
			const dateStr = new Date(curr.available_date).toLocaleDateString('sv-SE'); // Uses Swedish locale for YYYY-MM-DD format
			if (!acc[dateStr]) {
				acc[dateStr] = {
					date: dateStr,
					timeSlots: []
				};
			}
			acc[dateStr].timeSlots.push({
				open_time: curr.open_time,
				close_time: curr.close_time
			});
			return acc;
		}, {});

		// Strukturera öppettider-datan
		const openHours = {
			periods: periodOpenDates.rows,
			specificDates: Object.values(groupedSpecificDates),
			defaultOpenTimes: specificDates.rows.map(row => row.open_time) || [periodOpenDates.rows[0]?.open_time] || [''],
			defaultCloseTimes: specificDates.rows.map(row => row.close_time) || [periodOpenDates.rows[0]?.close_time] || ['']
		};

		// Logga relevant data innan vi returnerar
		console.log('📅 Öppettider:', {
			periodDates: periodOpenDates.rows.length,
			specificDates: specificDates.rows.length,
			blockedDates: blockedDates.rows.length
		});

		console.log('🎯 Experience Data:', {
			name: experience.name,
			type: experience.experience_type,
			addons: experience.addons.length
		});

		console.groupEnd();

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
		console.error('❌ Fel vid laddning av bokningssida:', error);
		throw error;
	}
}
