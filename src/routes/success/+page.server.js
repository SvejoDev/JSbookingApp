import { redirect } from '@sveltejs/kit';
import { query, transaction } from '$lib/db.js';
import { sendBookingConfirmation } from '$lib/email.js';

export const load = async ({ url }) => {
	try {
		const sessionId = url.searchParams.get('session_id');
		const bookingId = url.searchParams.get('booking_id');

		// om vi varken har session_id eller booking_id, redirecta till startsidan
		if (!sessionId && !bookingId) {
			throw new Error('Ingen session_id eller booking_id tillhandahållen');
		}

		// vänta och försök flera gånger
		for (let i = 0; i < 5; i++) {
			try {
				const booking = await transaction(async (client) => {
					const {
						rows: [bookingData]
					} = await client.query(
						`SELECT 
							b.*,
							sl.location as startlocation_name,
							sl.price as adult_price,
							COALESCE(
								json_agg(
									json_build_object(
										'name', a.name,
										'amount', ba.amount
									)
								) FILTER (WHERE a.id IS NOT NULL), 
								'[]'::json
							) as addons,
							COALESCE(
								json_agg(
									json_build_object(
										'id', op.id,
										'name', op.name,
										'quantity', bop.quantity,
										'price', bop.price_per_unit,
										'total_price', bop.total_price
									)
								) FILTER (WHERE op.id IS NOT NULL), 
								'[]'::json
							) as optional_products,
							COALESCE(
								json_build_object(
									'invoice_type', id.invoice_type,
									'invoice_email', id.invoice_email,
									'gln_peppol_id', id.gln_peppol_id,
									'marking', id.marking,
									'organization', id.organization,
									'address', id.address,
									'postal_code', id.postal_code,
									'city', id.city
								),
								'{}'::json
							) as invoice_details
						FROM bookings b
						LEFT JOIN start_locations sl ON b.startlocation = sl.id
						LEFT JOIN booking_addons ba ON b.id = ba.booking_id
						LEFT JOIN addons a ON ba.addon_id = a.id
						LEFT JOIN booking_optional_products bop ON b.id = bop.booking_id
						LEFT JOIN optional_products op ON bop.optional_product_id = op.id
						LEFT JOIN invoice_details id ON b.id = id.booking_id
						WHERE (b.stripe_session_id = $1 AND (b.payment_method = 'card' OR b.payment_method = 'stripe'))
						   OR (b.id = $2)
						GROUP BY b.id, sl.location, sl.price, id.invoice_type, id.invoice_email, id.gln_peppol_id, 
							id.marking, id.organization, id.address, id.postal_code, id.city`,
						[sessionId, bookingId]
					);

					if (!bookingData) {
						console.log(
							'Försök',
							i + 1,
							': Ingen bokning hittad för session',
							sessionId,
							'eller id',
							bookingId
						);
						throw new Error('Bokning hittades inte');
					}

					return bookingData;
				});

				// Formatera bokningsdata för frontend
				const formattedBooking = {
					...booking,
					// Använd endast de nya priskolumnerna
					subtotal: booking.amount_total_exc_vat || 0,
					vat:
						booking.amount_total_inc_vat && booking.amount_total_exc_vat
							? booking.amount_total_inc_vat - booking.amount_total_exc_vat
							: 0,
					total: booking.amount_total_inc_vat || 0,

					// Beräkna totalpris för tillvalsprodukter
					optional_products_total: Array.isArray(booking.optional_products)
						? booking.optional_products.reduce(
								(sum, product) => sum + parseInt(product.total_price || 0),
								0
							)
						: 0
				};

				return {
					booking: formattedBooking
				};
			} catch (error) {
				console.error('Fel vid hämtning av bokning:', error);
				// vänta 1 sekund innan nästa försök
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}

		throw new Error('Kunde inte hitta bokningen efter flera försök');
	} catch (error) {
		console.error('Fel i success-sidan:', error);
		throw redirect(302, '/');
	}
};
