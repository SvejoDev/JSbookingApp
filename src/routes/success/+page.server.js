import { redirect } from '@sveltejs/kit';
import { query } from '$lib/db.js';

export const load = async ({ url }) => {
	const sessionId = url.searchParams.get('session_id');

	if (!sessionId) {
		console.log('Inget session_id tillgängligt');
		throw redirect(303, '/');
	}

	try {
		// Lägg till felsökning
		console.log('Söker bokning med session_id:', sessionId);

		// Vänta lite för att säkerställa att webhook har hunnit spara bokningen
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// hämta bokningen
		const {
			rows: [booking]
		} = await query(
			`SELECT b.*, sl.price 
             FROM bookings b 
             LEFT JOIN start_locations sl ON sl.experience_id = b.experience_id 
             WHERE b.stripe_session_id = $1`,
			[sessionId]
		);

		console.log('Hittad bokning:', booking);

		if (!booking) {
			console.error('Ingen bokning hittades för session:', sessionId);
			throw redirect(303, '/');
		}

		// Beräkna priser
		const adultPrice = booking.price || 0;
		const adultPriceExclVat = adultPrice / 1.25;
		const totalAdultsExclVat = booking.number_of_adults * adultPriceExclVat;
		const totalChildren = 0; // barn är gratis
		const subtotal = totalAdultsExclVat;
		const vat = subtotal * 0.25;
		const total = subtotal + vat;

		return {
			booking: {
				...booking,
				adultPrice,
				adultPriceExclVat,
				childPrice: 0,
				totalAdultsExclVat,
				totalChildren,
				subtotal,
				vat,
				total
			}
		};
	} catch (error) {
		console.error('Fel vid hämtning av bokning:', error);
		// Istället för att redirecta direkt, visa ett felmeddelande
		return {
			error: 'Det gick inte att hitta din bokning just nu. Kontakta oss om problemet kvarstår.',
			booking: null
		};
	}
};
