import { redirect } from '@sveltejs/kit';
import { query, transaction } from '$lib/db.js';
import { sendBookingConfirmation } from '$lib/email.js';
import { stripe } from '$lib/stripe.js';

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
				const session = await stripe.checkout.sessions.retrieve(sessionId, {
					expand: ['line_items']
				});

				// hämta priset för denna experience_id (barn är gratis)
				const {
					rows: [locationData]
				} = await client.query(
					'SELECT price FROM start_locations WHERE experience_id = $1 LIMIT 1',
					[session.metadata.experience_id]
				);

				console.log('prislookup:', {
					experience_id: session.metadata.experience_id,
					locationData
				});

				const adultPrice = locationData?.price || 0;
				const adultPriceExclVat = adultPrice / 1.25;

				// beräkna totaler
				const totalAdultsExclVat = session.metadata.number_of_adults * adultPriceExclVat;
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
					[session.metadata.booking_id]
				);

				booking = {
					...session.metadata,
					adultPrice,
					adultPriceExclVat,
					childPrice: 0,
					totalAdultsExclVat,
					totalChildren,
					subtotal,
					vat,
					total,
					addons: bookingAddons,
					customer_email: session.metadata.customer_email, // säkerställ att detta finns med
					confirmation_sent: session.metadata.confirmation_sent
				};

				if (!session.metadata.confirmation_sent) {
					// Uppdatera först
					await client.query('UPDATE bookings SET confirmation_sent = true WHERE id = $1', [
						session.metadata.booking_id
					]);

					// Skicka sedan mejl
					await sendBookingConfirmation(booking, false);
				}

				// Spara tillvalsprodukter om de finns i metadata
				if (session.metadata.optional_products) {
					const optionalProducts = JSON.parse(session.metadata.optional_products);
					if (optionalProducts.length > 0) {
						const optionalProductValues = optionalProducts.map((product) => [
							session.metadata.booking_id,
							product.id,
							product.quantity,
							product.price,
							product.total_price
						]);

						await client.query(
							`INSERT INTO booking_optional_products 
							(booking_id, optional_product_id, quantity, price_per_unit, total_price)
							VALUES ${optionalProductValues
								.map(
									(_, i) =>
										`($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`
								)
								.join(', ')}`,
							optionalProductValues.flat()
						);
					}
				}
			}
		});

		return {
			booking,
			isInvoiceBooking: bookingType === 'invoice'
		};
	} catch (error) {
		console.error('Error in success page load:', error);
		throw redirect(303, '/');
	}
};
