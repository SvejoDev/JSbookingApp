import { query } from '$lib/db.js';

export async function load({ url }) {
	const selectedDate = url.searchParams.get('date') || new Date().toISOString().split('T')[0];

	const { rows: bookings } = await query(
		`SELECT 
      b.*,
      CASE 
        WHEN b.status = 'confirmed' THEN 'betald'
        ELSE b.status 
      END as status,
      array_agg(DISTINCT a.name) as addon_names,
      array_agg(DISTINCT a.column_name) as addon_columns,
      sl.location as startlocation_name
    FROM bookings b
    LEFT JOIN addons a ON true
    LEFT JOIN start_locations sl ON b.startlocation = sl.id
    WHERE b.start_date <= $1 AND b.end_date >= $1
    GROUP BY b.id, sl.location
    ORDER BY b.start_time ASC`,
		[selectedDate]
	);

	const { rows: addons } = await query('SELECT name, column_name FROM addons');

	return {
		bookings,
		addons,
		selectedDate
	};
}
