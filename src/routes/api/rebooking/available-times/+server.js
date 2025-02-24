import { checkAvailability } from '$lib/availability.js';

export async function POST({ request }) {
	const { date, bookingId } = await request.json();

	// Hämta ursprunglig bokning för att få addons etc
	const {
		rows: [booking]
	} = await query('SELECT * FROM bookings WHERE id = $1', [bookingId]);

	// Återanvänd befintlig logik för att hitta lediga tider
	return await checkAvailability({
		date,
		bookingLength: booking.booking_type,
		addons: booking.addons,
		experienceId: booking.experience_id
	});
}
