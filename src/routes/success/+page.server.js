import { redirect } from '@sveltejs/kit';
import { query, transaction } from '$lib/db.js';
import { sendBookingConfirmation } from '$lib/email.js';

export const load = async ({ url }) => {
	try {
		let booking;
		const bookingId = url.searchParams.get('booking_id');
		const sessionId = url.searchParams.get('session_id');

		if (!bookingId && !sessionId) {
			console.error('Ingen booking_id eller session_id tillhandahållen');
			throw redirect(303, '/?error=missing_booking_id');
		}

		await transaction(async (client) => {
			// Modifiera SQL-frågan för att hantera både booking_id och stripe_session_id
			const {
				rows: [bookingData]
			} = await client.query(
				`WITH booking_base AS (
					SELECT b.* 
					FROM bookings b 
					WHERE ${bookingId ? 'b.id = $1' : 'b.stripe_session_id = $1'}
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
						json_agg(
							DISTINCT jsonb_build_object(
								'name', op.name,
								'quantity', bop.quantity,
								'price', op.price,
								'total_price', bop.total_price
							)
						) FILTER (WHERE op.id IS NOT NULL),
						'[]'
					) as optional_products,
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
				LEFT JOIN invoice_details id ON b.id = id.booking_id
				LEFT JOIN booking_optional_products bop ON b.id = bop.booking_id
				LEFT JOIN optional_products op ON bop.optional_product_id = op.id
				GROUP BY 
					b.id, 
					b.experience_id,
					b.experience,
					b.start_date,
					b.start_time,
					b.end_date,
					b.end_time,
					b.number_of_adults,
					b.number_of_children,
					b.amount_total,
					b.startlocation,
					b.customer_comment,
					b.amount_canoes,
					b.amount_kayak,
					b.amount_sup,
					b.booking_name,
					b.booking_lastname,
					b.customer_email,
					b.status,
					b.stripe_session_id,
					b.date_time_created,
					b.booking_status,
					b.start_slot,
					b.end_slot,
					b.total_slots,
					b.booking_type,
					b.payment_method,
					b.customer_phone,
					b.confirmation_sent,
					sl.location,
					sl.price,
					id.invoice_type,
					id.invoice_email,
					id.gln_peppol_id,
					id.marking,
					id.organization,
					id.address,
					id.postal_code,
					id.city,
					id.id,
					id.booking_id,
					id.created_at,
					id.updated_at`,
				[bookingId || sessionId]
			);

			if (!bookingData) {
				console.error(
					`Ingen bokning hittad med ${bookingId ? 'ID' : 'session ID'}: ${bookingId || sessionId}`
				);
				throw redirect(303, '/?error=booking_not_found');
			}

			// Beräkna priser
			const adultPrice = bookingData.adult_price || 0;
			const adultPriceExclVat = Math.round(adultPrice / 1.25);
			const totalAdultsExclVat = adultPriceExclVat * bookingData.number_of_adults;

			// Beräkna totalpris för tillvalsprodukter
			const optionalProductsTotal = bookingData.optional_products.reduce(
				(sum, product) => sum + (product.total_price || 0),
				0
			);

			// Beräkna totaler
			const subtotal = Math.round(totalAdultsExclVat + optionalProductsTotal / 1.25);
			const vat = Math.round(subtotal * 0.25);
			const total = subtotal + vat;

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
				startLocationName: bookingData.startlocation_name,
				adultPrice,
				adultPriceExclVat,
				totalAdultsExclVat,
				subtotal,
				vat,
				total,
				addons: bookingData.addons_info || [],
				optional_products: bookingData.optional_products || [],
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
					bookingId || sessionId
				]);

				// Skicka sedan mejl
				await sendBookingConfirmation(booking, true);
			}
		});

		return {
			booking,
			isInvoiceBooking: booking.payment_method === 'invoice'
		};
	} catch (error) {
		if (error instanceof redirect) throw error;
		console.error('Fel vid hämtning av bokning:', error);
		throw redirect(303, '/?error=booking_error');
	}
};
