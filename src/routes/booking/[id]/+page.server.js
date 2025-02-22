import { query } from '$lib/db.js';

export async function load({ params }) {
	try {
		// Hämta upplevelsen med alla dess addons i en enda query
		const experienceResult = await query(
			`
            SELECT 
                e.*,
                json_agg(DISTINCT jsonb_build_object(
                    'id', a.id,
                    'name', a.name,
                    'max_quantity', a.max_quantity,
                    'image_url', a.image_url,
                    'column_name', a.column_name
                )) as addons,
                json_agg(DISTINCT jsonb_build_object(
                    'id', op.id,
                    'name', op.name,
                    'description', op.description,
                    'price', op.price,
                    'type', op.type,
                    'image_url', op.image_url
                )) as optional_products
            FROM experiences e
            LEFT JOIN experience_addons ea ON e.id = ea.experience_id
            LEFT JOIN addons a ON ea.addon_id = a.id
            LEFT JOIN experience_optional_products eop ON e.id = eop.experience_id
            LEFT JOIN optional_products op ON eop.optional_product_id = op.id
            WHERE e.id = $1
            GROUP BY e.id
            `,
			[params.id]
		);

		const experience = experienceResult.rows[0];

		if (!experience) {
			return { error: 'Upplevelsen hittades inte' };
		}

		// Filtrera bort null-värden från arrays
		experience.addons = experience.addons.filter((addon) => addon.id !== null);
		experience.optional_products = experience.optional_products.filter(
			(product) => product.id !== null
		);

		// Hämta all nödvändig data för bokningen
		const [
			startLocations,
			bookingLengths,
			periodOpenDates,
			specificDates,
			blockedDates,
			blockedStartTimes,
			capacity
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
			]),
			query('SELECT max_participants FROM guided_experience_capacity WHERE experience_id = $1', [
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
			defaultOpenTimes: [],
			defaultCloseTimes: [],
			isGuided: experience.experience_type === 'guided'
		};

		// För guidade upplevelser, validera och sätt upp öppettider
		if (experience.experience_type === 'guided') {
			// Kontrollera och sätt öppettider i prioritetsordning
			if (specificDates.rows.length > 0) {
				openHours.guidedHours = {
					openTime: specificDates.rows[0].open_time,
					closeTime: specificDates.rows[0].close_time
				};
			} else if (periodOpenDates.rows.length > 0) {
				openHours.guidedHours = {
					openTime: periodOpenDates.rows[0].open_time,
					closeTime: periodOpenDates.rows[0].close_time
				};
			} else {
				// Logga bara om det är en guidad upplevelse och saknar öppettider
				console.error('Varning: Inga öppettider konfigurerade för guidad upplevelse');
			}
		}

		// Lägg till i openHours-objektet
		openHours.maxParticipants = capacity.rows[0]?.max_participants || null;

		return {
			experience: {
				...experience,
				addons: experience.addons,
				optional_products: experience.optional_products
			},
			startLocations: startLocations.rows,
			bookingLengths: bookingLengths.rows,
			openHours,
			blocked_dates: blockedDates.rows,
			blocked_start_times: blockedStartTimes.rows
		};
	} catch (error) {
		throw error;
	}
}

async function getAvailableCapacity(experienceId, date, startTime) {
	const [bookedSlot] = await query(
		`
		SELECT COALESCE(SUM(number_of_adults + number_of_children), 0) as booked_count
		FROM bookings 
		WHERE experience_id = $1 
		AND start_date = $2 
		AND start_time = $3
		AND booking_status != 'cancelled'`,
		[experienceId, date, startTime]
	);

	const [maxCapacity] = await query(
		'SELECT max_participants FROM guided_experience_capacity WHERE experience_id = $1',
		[experienceId]
	);

	const totalBooked = parseInt(bookedSlot.rows[0]?.booked_count || 0);
	const maxAllowed = parseInt(maxCapacity.rows[0]?.max_participants || 0);

	return maxAllowed - totalBooked;
}
