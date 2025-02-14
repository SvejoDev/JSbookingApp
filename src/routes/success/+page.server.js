import { redirect } from '@sveltejs/kit';
import { query } from '$lib/db.js';
import { sendBookingConfirmation } from '$lib/email.js';

export const load = async ({ url }) => {
	const sessionId = url.searchParams.get('session_id');

	if (!sessionId) {
		throw redirect(303, '/');
	}

	try {
		// hämta bokningen
		const {
			rows: [booking]
		} = await query('SELECT * FROM bookings WHERE stripe_session_id = $1', [sessionId]);

		if (!booking) {
			console.error('ingen bokning hittades för session:', sessionId);
			throw redirect(303, '/');
		}

		// hämta priset för denna experience_id (barn är gratis)
		const {
			rows: [locationData]
		} = await query('SELECT price FROM start_locations WHERE experience_id = $1 LIMIT 1', [
			booking.experience_id
		]);

		console.log('prislookup:', {
			experience_id: booking.experience_id,
			locationData
		});

		const adultPrice = locationData?.price || 0;
		const adultPriceExclVat = adultPrice / 1.25;

		// beräkna totaler
		const totalAdultsExclVat = booking.number_of_adults * adultPriceExclVat;
		const totalChildren = 0; // barn är gratis
		const subtotal = totalAdultsExclVat; // räkna bara vuxna, exkl. moms
		const vat = subtotal * 0.25;
		const total = subtotal + vat; // detta blir adultPrice * number_of_adults

		// hämta addons för denna bokning
		const { rows: bookingAddons } = await query(
			`SELECT a.name, a.column_name, ba.amount 
			 FROM booking_addons ba 
			 JOIN addons a ON ba.addon_id = a.id 
			 WHERE ba.booking_id = $1`,
			[booking.id]
		);

		// skicka bokningsbekräftelse via e-post
		await sendBookingConfirmation({
			...booking,
			adultPrice,
			adultPriceExclVat,
			childPrice: 0,
			totalAdultsExclVat,
			totalChildren,
			subtotal,
			vat,
			total,
			addons: bookingAddons
		});

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
				total,
				addons: bookingAddons
			}
		};
	} catch (error) {
		console.error('fel vid hämtning av bokning:', error);
		throw redirect(303, '/');
	}
};
