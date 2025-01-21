// src/routes/api/handle-invoice/+server.js
import { json } from '@sveltejs/kit';
import { query, transaction } from '$lib/db.js';
import { Resend } from 'resend';


const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST({ request }) {
	try {
		const data = await request.json();

		// Create booking record
		const booking = await transaction(async (client) => {
			// Insert booking
			const bookingResult = await client.query(
				`INSERT INTO bookings (
                    experience_id, start_date, start_time, end_date, end_time,
                    number_of_adults, number_of_children, amount_total,
                    startlocation, customer_comment, booking_name,
                    booking_lastname, customer_email, status,
                    payment_method, start_slot, end_slot,
                    booking_type, total_slots
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
                RETURNING id`,
				[
					data.experience_id,
					data.start_date,
					data.start_time,
					data.end_date,
					data.end_time,
					data.number_of_adults,
					data.number_of_children,
					data.amount_total,
					data.startLocation,
					data.customer_comment,
					data.booking_name,
					data.booking_lastname,
					data.customer_email,
					'pending', // Status for invoice bookings starts as pending
					'invoice',
					data.start_slot,
					data.end_slot,
					data.booking_type,
					data.total_slots
				]
			);

			const bookingId = bookingResult.rows[0].id;

			// Insert invoice details
			await client.query(
				`INSERT INTO invoice_details (
                    booking_id, invoice_type, invoice_email,
                    gln_peppol_id, marking, organization,
                    address, postal_code, city
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
				[
					bookingId,
					data.invoiceType,
					data.invoiceEmail,
					data.glnPeppolId,
					data.marking,
					data.organization,
					data.address,
					data.postalCode,
					data.city
				]
			);

			return bookingResult.rows[0];
		});

		// Send email notification
		await resend.emails.send({
			from: 'noreply@yourdomain.com',
			to: 'your-admin-email@yourdomain.com',
			subject: 'New Invoice Booking Request',
			html: `
                <h1>New Invoice Booking Request</h1>
                <p>Booking details:</p>
                <ul>
                    <li>Organization: ${data.organization}</li>
                    <li>Contact: ${data.booking_name} ${data.booking_lastname}</li>
                    <li>Email: ${data.customer_email}</li>
                    <li>Invoice Type: ${data.invoiceType}</li>
                    <li>Amount: ${data.amount_total}</li>
                    <li>Start Date: ${data.start_date}</li>
                    <li>Start Time: ${data.start_time}</li>
                </ul>
            `
		});

		return json({ success: true, booking });
	} catch (error) {
		console.error('Error handling invoice booking:', error);
		return json({ error: error.message }, { status: 500 });
	}
}
