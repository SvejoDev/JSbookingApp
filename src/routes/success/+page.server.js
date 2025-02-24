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
			const {
				rows: [bookingData]
			} = await client.query(
				`WITH booking_base AS (
					SELECT b.*, e.name as experience_name 
					FROM bookings b 
					LEFT JOIN experiences e ON b.experience_id = e.id
					WHERE ${bookingId ? 'b.id = $1' : 'b.stripe_session_id = $1'}
				)
				SELECT 
					b.*,
					b.experience_name,
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
								'id', op.id,
								'name', op.name,
								'quantity', bop.quantity,
								'price', bop.price_per_unit,
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
					b.experience_name,
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
					id.booking_id`,
				[bookingId || sessionId]
			);

			if (!bookingData) {
				console.error('Bokning hittades inte');
				throw redirect(303, '/?error=booking_not_found');
			}

			// Beräkna totaler inklusive optional products
			const optionalProductsTotal = (bookingData.optional_products || []).reduce(
				(sum, product) => sum + (product.total_price || 0),
				0
			);

			const total = (bookingData.amount_total || 0) + optionalProductsTotal;
			const subtotal = Math.round(total / 1.25);
			const vat = total - subtotal;

			booking = {
				...bookingData,
				experience: bookingData.experience_name,
				id: bookingData.id,
				customer_email: bookingData.customer_email,
				payment_method: 'stripe',
				invoiceType: bookingData.invoice_type,
				invoiceEmail: bookingData.invoice_email || '',
				glnPeppolId: bookingData.gln_peppol_id || '',
				marking: bookingData.marking || '',
				organization: bookingData.organization || '',
				address: bookingData.address || '',
				postalCode: bookingData.postal_code || '',
				city: bookingData.city || '',
				startLocationName: bookingData.startlocation_name,
				adultPrice: bookingData.adult_price,
				adultPriceExclVat: Math.round(bookingData.adult_price / 1.25),
				totalAdultsExclVat: subtotal,
				subtotal,
				vat,
				total,
				optional_products: bookingData.optional_products || [],
				addons: bookingData.addons_info || [],
				confirmation_sent: bookingData.confirmation_sent
			};

			console.log('Debug - Invoice Email:', {
				raw: bookingData.invoice_email,
				processed: booking.invoiceEmail
			});

			console.log('Start location debug:', {
				id: bookingData.startlocation,
				name: bookingData.startlocation_name
			});

			if (!bookingData.confirmation_sent) {
				await client.query('UPDATE bookings SET confirmation_sent = true WHERE id = $1', [
					bookingData.id
				]);

				console.log('Skickar bokningsbekräftelse med data:', booking);

				await sendBookingConfirmation(booking, false);
			}
		});

		return {
			booking,
			isInvoiceBooking: false
		};
	} catch (error) {
		if (error instanceof redirect) throw error;
		console.error('Fel i success-sidan:', error);
	}
};
