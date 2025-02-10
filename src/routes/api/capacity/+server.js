import { json } from '@sveltejs/kit';
import { query } from '$lib/db';

export async function GET({ url }) {
	const experienceId = url.searchParams.get('experienceId');
	const date = url.searchParams.get('date');
	const time = url.searchParams.get('time');

	// kontrollera att alla nödvändiga parametrar finns
	if (!experienceId || !date || !time) {
		return json(
			{
				error: 'Saknade parametrar',
				availableCapacity: null
			},
			{ status: 400 }
		);
	}

	try {
		// hämta upplevelsens typ och kapacitet
		const {
			rows: [experience]
		} = await query(
			`
			SELECT 
				e.experience_type,
				gec.max_participants
			FROM experiences e
			LEFT JOIN guided_experience_capacity gec ON e.id = gec.experience_id
			WHERE e.id = $1
		`,
			[experienceId]
		);

		// om det inte är en guidad upplevelse, returnera null
		if (experience?.experience_type !== 'guided') {
			return json({ availableCapacity: null });
		}

		// om ingen kapacitet är satt, returnera fel
		if (!experience.max_participants) {
			return json({
				error: 'Ingen kapacitet satt för denna upplevelse',
				availableCapacity: 0
			});
		}

		// hämta antal bokade platser
		const {
			rows: [bookings]
		} = await query(
			`
			SELECT COALESCE(SUM(number_of_adults + number_of_children), 0) as booked_count
			FROM bookings 
			WHERE experience_id = $1 
			AND start_date = $2 
			AND start_time = $3
			AND status NOT IN ('cancelled', 'completed')
		`,
			[experienceId, date, time]
		);

		const availableCapacity = experience.max_participants - (bookings?.booked_count || 0);

		return json({
			availableCapacity,
			maxCapacity: experience.max_participants,
			bookedCount: bookings?.booked_count || 0
		});
	} catch (error) {
		console.error('Fel vid kapacitetskontroll:', error);
		return json(
			{
				error: 'Kunde inte kontrollera kapacitet',
				availableCapacity: 0
			},
			{ status: 500 }
		);
	}
}
