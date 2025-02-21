import { json } from '@sveltejs/kit';
import { query } from '$lib/db.js';
import { sendInvoiceRequest } from '$lib/email.js';

export async function POST({ request }) {
	try {
		const { bookingData, invoiceData } = await request.json();

		// spara bokningen i databasen
		const {
			rows: [booking]
		} = await query(
			`INSERT INTO bookings (
                experience_id, experience, start_date, start_time, 
                end_date, end_time, number_of_adults, number_of_children,
                booking_name, booking_lastname, customer_email, 
                customer_phone, customer_comment, startlocation,
                status, amount_total
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING id`,
			[
				bookingData.experience_id,
				bookingData.experience,
				bookingData.start_date,
				bookingData.start_time,
				bookingData.end_date,
				bookingData.end_time,
				bookingData.number_of_adults,
				bookingData.number_of_children,
				bookingData.booking_name,
				bookingData.booking_lastname,
				bookingData.customer_email,
				bookingData.customer_phone,
				bookingData.customer_comment,
				bookingData.selectedStartLocation,
				'pending_invoice',
				bookingData.amount_total
			]
		);

		// spara faktureringsinformation
		await query(
			`INSERT INTO invoice_details (
                booking_id, invoice_type, invoice_email, 
                gln_peppol_id, marking, organization,
                address, postal_code, city
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			[
				booking.id,
				invoiceData.invoiceType,
				invoiceData.invoiceEmail,
				invoiceData.glnPeppolId,
				invoiceData.marking,
				invoiceData.organization,
				invoiceData.address,
				invoiceData.postalCode,
				invoiceData.city
			]
		);

		// skicka e-postnotifieringar
		await sendInvoiceRequest({ ...bookingData, id: booking.id }, invoiceData);

		return json({ success: true, bookingId: booking.id });
	} catch (error) {
		console.error('Error handling invoice request:', error);
		return json({ error: 'Could not process invoice request' }, { status: 500 });
	}
}
