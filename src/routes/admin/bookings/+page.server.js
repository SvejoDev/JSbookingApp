import { query } from '$lib/db.js';

export const load = async ({ url }) => {
	// get date from url params or use today's date
	const selectedDate = url.searchParams.get('date') || new Date().toISOString().split('T')[0];

	try {
		const { rows: bookings } = await query(
			`SELECT 
                id, experience_id, start_date, start_time, 
                end_date, end_time, number_of_adults, 
                number_of_children, amount_total, startlocation,
                customer_comment, amount_canoes, amount_kayak,
                amount_sup, booking_name, booking_lastname,
                customer_email, status, experience,
                date_time_created
            FROM bookings 
            WHERE start_date = $1
            ORDER BY start_time ASC`,
			[selectedDate]
		);

		return {
			bookings,
			selectedDate
		};
	} catch (error) {
		console.error('Error fetching bookings:', error);
		return {
			bookings: [],
			selectedDate,
			error: 'Could not fetch bookings'
		};
	}
};
