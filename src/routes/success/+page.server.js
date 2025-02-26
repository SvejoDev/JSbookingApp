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
						`
						SELECT 
							b.*, 
							e.name as experience,
							COALESCE(id.invoice_type, '') as invoice_type,
							COALESCE(id.invoice_email, '') as invoice_email,
							COALESCE(id.gln_peppol_id, '') as gln_peppol_id,
							COALESCE(id.marking, '') as marking,
							COALESCE(id.organization, '') as organization,
							COALESCE(id.address, '') as address,
							COALESCE(id.postal_code, '') as postal_code,
							COALESCE(id.city, '') as city
						FROM 
							bookings b
						LEFT JOIN 
							experiences e ON b.experience_id = e.id
						LEFT JOIN 
							invoice_details id ON b.id = id.booking_id
						WHERE 
							${sessionId ? 'b.stripe_session_id = $1' : 'b.id = $1'}
						`,
						[sessionId || bookingId]
					);

					if (!bookingData) {
						throw new Error('Bokning hittades inte');
					}

					// Hämta startplatsnamn om det finns ett startlocation-id
					let startLocationName = null;
					if (bookingData.startlocation) {
						const { rows: startLocationRows } = await client.query(
							'SELECT location FROM start_locations WHERE id = $1',
							[bookingData.startlocation]
						);
						if (startLocationRows.length > 0) {
							startLocationName = startLocationRows[0].location;
						}
					}

					// Hämta tillvalsprodukter
					const { rows: optionalProducts } = await client.query(
						`
						SELECT 
							bop.quantity, 
							bop.price_per_unit as price, 
							bop.total_price, 
							op.name 
						FROM 
							booking_optional_products bop
						JOIN 
							optional_products op ON bop.optional_product_id = op.id
						WHERE 
							bop.booking_id = $1
						`,
						[bookingData.id]
					);

					// Hämta addons
					const { rows: addons } = await client.query(
						`
						SELECT 
							ba.amount, 
							a.name 
						FROM 
							booking_addons ba
						JOIN 
							addons a ON ba.addon_id = a.id
						WHERE 
							ba.booking_id = $1
						`,
						[bookingData.id]
					);

					return {
						...bookingData,
						startLocationName,
						optional_products: optionalProducts,
						addons
					};
				});

				// skicka bokningsbekräftelse om det inte redan är gjort
				if (!booking.confirmation_sent) {
					try {
						await sendBookingConfirmation(booking, booking.payment_method === 'invoice');
						// uppdatera confirmation_sent till true
						await query('UPDATE bookings SET confirmation_sent = true WHERE id = $1', [booking.id]);
					} catch (emailError) {
						console.error('Fel vid skickande av bokningsbekräftelse:', emailError);
					}
				}

				// formatera bokningsdata för frontend
				const isInvoiceBooking = booking.payment_method === 'invoice';

				// Beräkna totaler för tillvalsprodukter
				const optionalProductsTotal = booking.optional_products.reduce(
					(sum, product) => sum + product.total_price,
					0
				);

				// Formatera bokningsdata för frontend
				const formattedBooking = {
					...booking,
					subtotal: booking.amount_total_exc_vat || 0,
					vat: (booking.amount_total_inc_vat || 0) - (booking.amount_total_exc_vat || 0),
					total: booking.amount_total_inc_vat || 0,
					optional_products_total: optionalProductsTotal,
					invoice_details: isInvoiceBooking
						? {
								invoice_type: booking.invoice_type,
								invoice_email: booking.invoice_email,
								gln_peppol_id: booking.gln_peppol_id,
								marking: booking.marking,
								organization: booking.organization,
								address: booking.address,
								postal_code: booking.postal_code,
								city: booking.city
							}
						: {}
				};

				return {
					booking: formattedBooking,
					isInvoiceBooking
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
