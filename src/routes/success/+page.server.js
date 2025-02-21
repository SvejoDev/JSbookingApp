import { redirect } from '@sveltejs/kit';
import { query, transaction } from '$lib/db.js';
import { sendBookingConfirmation } from '$lib/email.js';

export const load = async ({ url }) => {
	try {
		let booking;
		const bookingType = url.searchParams.get('booking_type');
		const bookingId = url.searchParams.get('booking_id');
		const sessionId = url.searchParams.get('session_id');

		if (!bookingType && !sessionId && !bookingId) {
			throw redirect(303, '/');
		}

		await transaction(async (client) => {
			if (bookingType === 'invoice') {
				// Hämta bokning först
				const {
					rows: [bookingData]
				} = await client.query(
					`WITH booking_base AS (
						SELECT b.* 
						FROM bookings b 
						WHERE b.id = $1 
						FOR UPDATE
					)
					SELECT 
						b.*,
						b.confirmation_sent,
						sl.location as startlocation_name,
						sl.price as adult_price,
						id.invoice_type,
						id.invoice_email,
						id.gln_peppol_id,
						id.marking,
						id.organization,
						id.address,
						id.postal_code,
						id.city,
						COALESCE(
							(
								SELECT json_agg(
									json_build_object(
										'name', a.name,
										'amount', CASE 
											WHEN a.column_name = 'amount_canoes' THEN b.amount_canoes
											WHEN a.column_name = 'amount_kayak' THEN b.amount_kayak
											WHEN a.column_name = 'amount_sup' THEN b.amount_sup
											ELSE 0
										END
									)
								)
								FROM addons a
								WHERE CASE 
									WHEN a.column_name = 'amount_canoes' THEN b.amount_canoes > 0
									WHEN a.column_name = 'amount_kayak' THEN b.amount_kayak > 0
									WHEN a.column_name = 'amount_sup' THEN b.amount_sup > 0
									ELSE false
								END
							),
							'[]'::json
						) as addons_info
					FROM booking_base b
					LEFT JOIN start_locations sl ON b.startlocation = sl.id
					LEFT JOIN invoice_details id ON b.id = id.booking_id`,
					[bookingId]
				);

				if (!bookingData) {
					throw redirect(303, '/');
				}

				// Beräkna priser
				const adultPrice = bookingData.adult_price || 0;
				const adultPriceExclVat = adultPrice / 1.25;
				const totalAdultsExclVat = bookingData.number_of_adults * adultPriceExclVat;
				const totalChildren = 0; // barn är gratis
				const subtotal = totalAdultsExclVat;
				const vat = subtotal * 0.25;
				const total = subtotal + vat;

				// Hämta addons för denna bokning
				const { rows: bookingAddons } = await client.query(
					`SELECT a.name, a.column_name, ba.amount 
					 FROM booking_addons ba 
					 JOIN addons a ON ba.addon_id = a.id 
					 WHERE ba.booking_id = $1`,
					[bookingData.id]
				);

				booking = {
					...bookingData,
					invoiceType: bookingData.invoice_type,
					invoiceEmail: bookingData.invoice_email || '',
					glnPeppolId: bookingData.gln_peppol_id || '',
					marking: bookingData.marking || '',
					organization: bookingData.organization || '',
					address: bookingData.address || '',
					postalCode: bookingData.postal_code || '',
					city: bookingData.city || '',
					startLocationName: bookingData.startlocation_name || 'Ej angiven',
					adultPrice,
					adultPriceExclVat,
					childPrice: 0,
					totalAdultsExclVat,
					totalChildren,
					subtotal,
					vat,
					total,
					addons: bookingData.addons_info || [],
					customer_email: bookingData.customer_email,
					confirmation_sent: bookingData.confirmation_sent
				};

				console.log('Debug - Invoice Email:', {
					raw: bookingData.invoice_email,
					processed: booking.invoiceEmail
				});

				if (!bookingData.confirmation_sent) {
					// Uppdatera först
					await client.query('UPDATE bookings SET confirmation_sent = true WHERE id = $1', [
						bookingId
					]);

					// Skicka sedan mejl
					await sendBookingConfirmation(booking, true);
				}
			} else {
				// För stripe-bokningar
				const {
					rows: [stripeBooking]
				} = await client.query(
					`SELECT b.* 
					 FROM bookings b 
					 WHERE b.stripe_session_id = $1 
					 FOR UPDATE`,
					[sessionId]
				);

				if (!stripeBooking) {
					throw redirect(303, '/');
				}

				// hämta priset för denna experience_id (barn är gratis)
				const {
					rows: [locationData]
				} = await client.query(
					'SELECT price FROM start_locations WHERE experience_id = $1 LIMIT 1',
					[stripeBooking.experience_id]
				);

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
				const { rows: bookingAddons } = await client.query(
					`SELECT a.name, a.column_name, ba.amount 
					 FROM booking_addons ba 
					 JOIN addons a ON ba.addon_id = a.id 
					 WHERE ba.booking_id = $1`,
					[stripeBooking.id]
				);

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
					addons: bookingAddons,
					customer_email: stripeBooking.customer_email, // säkerställ att detta finns med
					confirmation_sent: stripeBooking.confirmation_sent
				};

				if (!stripeBooking.confirmation_sent) {
					// Uppdatera först
					await client.query('UPDATE bookings SET confirmation_sent = true WHERE id = $1', [
						stripeBooking.id
					]);

					// Skicka sedan mejl
					await sendBookingConfirmation(booking, false);
				}
			}
		});

		return {
			booking,
			isInvoiceBooking: bookingType === 'invoice'
		};
	} catch (error) {
		console.error('Fel vid hämtning av bokning:', error);
		throw redirect(303, '/');
	}
};
