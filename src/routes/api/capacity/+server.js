import { json } from '@sveltejs/kit';
import { query } from '$lib/db';

export async function GET({ url }) {
	const experienceId = url.searchParams.get('experienceId');
	const date = url.searchParams.get('date');
	const time = url.searchParams.get('time');

	console.log('Kapacitetskontroll:', { experienceId, date, time });

	try {
		console.log('Kapacitetskontroll för:', {
			upplevelse: experienceId,
			datum: date,
			tid: time
		});

		// Hämta max kapacitet
		const {
			rows: [maxCapacity]
		} = await query(
			'SELECT max_participants FROM guided_experience_capacity WHERE experience_id = $1',
			[experienceId]
		);

		// Hämta antal bokade platser för specifikt datum och tid
		const {
			rows: [bookedSlot]
		} = await query(
			`
			SELECT COALESCE(SUM(number_of_adults), 0) as booked_count
			FROM bookings 
			WHERE experience_id = $1 
			AND start_date = $2 
			AND start_time = $3
			AND status != 'cancelled'`,
			[experienceId, date, time]
		);

		console.log('Kapacitetsresultat:', {
			maxKapacitet: maxCapacity?.max_participants,
			bokadePlatser: bookedSlot?.booked_count,
			datum: date,
			tid: time
		});

		const totalBooked = parseInt(bookedSlot?.booked_count || 0);
		const maxAllowed = parseInt(maxCapacity?.max_participants || 0);
		const availableCapacity = maxAllowed - totalBooked;

		console.log('Kapacitetsberäkning:', {
			maxAllowed,
			totalBooked,
			availableCapacity
		});

		return json({ availableCapacity });
	} catch (error) {
		console.error('Fel vid kapacitetskontroll:', error);
		return json({ error: 'Kunde inte hämta kapacitet', availableCapacity: 0 });
	}
}
