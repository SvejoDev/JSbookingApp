import { redirect } from '@sveltejs/kit';
import { query, transaction } from '$lib/db.js';
import { sendBookingConfirmation } from '$lib/email.js';

export const load = async ({ url }) => {
	try {
		const sessionId = url.searchParams.get('session_id');

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
									DISTINCT jsonb_build_object(
										'id', op.id,
										'name', op.name,
										'quantity', bop.quantity,
										'price_per_unit', bop.price_per_unit,
										'total_price', bop.total_price
									)
								) FILTER (WHERE op.id IS NOT NULL), 
								'[]'::json
							) as optional_products
						FROM bookings b
						LEFT JOIN start_locations sl ON b.startlocation = sl.id
						LEFT JOIN booking_addons ba ON b.id = ba.booking_id
						LEFT JOIN addons a ON ba.addon_id = a.id
						LEFT JOIN booking_optional_products bop ON b.id = bop.booking_id
						LEFT JOIN optional_products op ON bop.optional_product_id = op.id
						WHERE b.stripe_session_id = $1 
						AND (b.payment_method = 'card' OR b.payment_method = 'stripe')
						GROUP BY b.id, sl.location, sl.price`,
						[sessionId]
					);

					if (!bookingData) {
						console.log('Försök', i + 1, ': Ingen bokning hittad för session', sessionId);
						throw new Error('Bokning hittades inte');
					}

					return {
						...bookingData,
						subtotal: Math.round(bookingData.amount_total / 1.25),
						vat: Math.round(bookingData.amount_total - bookingData.amount_total / 1.25),
						total: bookingData.amount_total
					};
				});

				return { booking, isInvoiceBooking: false };
			} catch (error) {
				if (i === 4) throw error;
				await new Promise((resolve) => setTimeout(resolve, 2000)); // öka väntetiden
			}
		}
	} catch (error) {
		console.error('Fel vid hämtning av bokning:', error);
		throw redirect(303, '/?error=booking_not_found');
	}
};
