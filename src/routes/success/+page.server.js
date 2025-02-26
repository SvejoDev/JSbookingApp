import { redirect, error } from '@sveltejs/kit';
import { logger } from '$lib/utils/logger';
import { query, transaction } from '$lib/db.js';
import { sendBookingConfirmation } from '$lib/email.js';

export const load = async ({ url }) => {
	const sessionId = url.searchParams.get('session_id');
	const bookingId = url.searchParams.get('booking_id');

	// kontrollera om vi har antingen session_id eller booking_id
	if (!sessionId && !bookingId) {
		throw error(400, 'Ingen session ID eller booking ID tillgänglig');
	}

	// lägg till en kort fördröjning för att säkerställa att bokningen har skapats
	await new Promise((resolve) => setTimeout(resolve, 2000));

	try {
		const booking = await transaction(async (client) => {
			let query = '';
			let params = [];

			if (sessionId) {
				// om vi har session_id, hämta bokning via stripe_session_id
				query = 'SELECT * FROM bookings WHERE stripe_session_id = $1';
				params = [sessionId];
			} else {
				// annars hämta via booking_id
				query = 'SELECT * FROM bookings WHERE id = $1';
				params = [bookingId];
			}

			const { rows } = await client.query(query, params);

			if (rows.length === 0) {
				throw new Error('Bokning hittades inte');
			}

			// hämta eventuella fakturauppgifter
			if (rows[0].payment_method === 'invoice') {
				const { rows: invoiceRows } = await client.query(
					'SELECT * FROM invoice_details WHERE booking_id = $1',
					[rows[0].id]
				);

				if (invoiceRows.length > 0) {
					rows[0].invoice_details = invoiceRows[0];
				}
			}

			// hämta eventuella tillvalsprodukter
			const { rows: optionalProducts } = await client.query(
				`SELECT bop.*, op.name 
				 FROM booking_optional_products bop
				 JOIN optional_products op ON bop.optional_product_id = op.id
				 WHERE bop.booking_id = $1`,
				[rows[0].id]
			);

			if (optionalProducts.length > 0) {
				rows[0].optional_products = optionalProducts;
				rows[0].optional_products_total = optionalProducts.reduce(
					(sum, product) => sum + parseInt(product.total_price || 0),
					0
				);
			}

			return rows[0];
		});

		// beräkna ytterligare information för visning
		const isInvoiceBooking = booking.payment_method === 'invoice';

		return {
			booking,
			isInvoiceBooking
		};
	} catch (err) {
		logger.error('Fel vid hämtning av bokning:', err);
		throw error(404, 'Bokning hittades inte');
	}
};
