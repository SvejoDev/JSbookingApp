import { redirect } from '@sveltejs/kit';
import { query } from '$lib/db.js';
import { sendBookingConfirmation } from '$lib/email.js';

export const load = async ({ url }) => {
	const bookingType = url.searchParams.get('booking_type');
	const bookingId = url.searchParams.get('booking_id');
	const sessionId = url.searchParams.get('session_id');

	if (!bookingType && !sessionId && !bookingId) {
		throw redirect(303, '/');
	}

	try {
		let booking;

		if (bookingType === 'invoice') {
			// Hämta fakturabokningar
			const {
				rows: [invoiceBooking]
			} = await query(
				`
				SELECT 
					b.*,
					i.invoice_type,
					i.organization,
					sl.location as startlocation_name,
					sl.price as adult_price
				FROM bookings b
				LEFT JOIN invoice_details i ON b.id = i.booking_id
				LEFT JOIN start_locations sl ON b.startlocation = sl.id
				WHERE b.id = $1
			`,
				[bookingId]
			);

			if (!invoiceBooking) {
				throw redirect(303, '/');
			}

			const adultPrice = invoiceBooking.adult_price || 0;
			const adultPriceExclVat = adultPrice / 1.25;
			const totalAdultsExclVat = invoiceBooking.number_of_adults * adultPriceExclVat;
			const subtotal = totalAdultsExclVat;
			const vat = subtotal * 0.25;
			const total = subtotal + vat;

			booking = {
				...invoiceBooking,
				adultPrice,
				adultPriceExclVat,
				totalAdultsExclVat,
				subtotal,
				vat,
				total
			};
		} else {
			// Befintlig logik för stripe-bokningar
			const {
				rows: [stripeBooking]
			} = await query('SELECT * FROM bookings WHERE stripe_session_id = $1', [sessionId]);

			if (!stripeBooking) {
				console.error('ingen bokning hittades för session:', sessionId);
				throw redirect(303, '/');
			}

			// hämta priset för denna experience_id (barn är gratis)
			const {
				rows: [locationData]
			} = await query('SELECT price FROM start_locations WHERE experience_id = $1 LIMIT 1', [
				stripeBooking.experience_id
			]);

			console.log('prislookup:', {
				experience_id: stripeBooking.experience_id,
				locationData
			});

			const adultPrice = locationData?.price || 0;
			const adultPriceExclVat = adultPrice / 1.25;

			// beräkna totaler
			const totalAdultsExclVat = stripeBooking.number_of_adults * adultPriceExclVat;
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
				[stripeBooking.id]
			);

			// skicka bokningsbekräftelse via e-post
			await sendBookingConfirmation({
				...stripeBooking,
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

			booking = {
				...stripeBooking,
				adultPrice,
				adultPriceExclVat,
				childPrice: 0,
				totalAdultsExclVat,
				totalChildren,
				subtotal,
				vat,
				total,
				addons: bookingAddons
			};
		}

		return {
			booking,
			isInvoiceBooking: bookingType === 'invoice'
		};
	} catch (error) {
		console.error('Fel vid hämtning av bokning:', error);
		throw redirect(303, '/');
	}
};
