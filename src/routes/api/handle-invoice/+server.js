import { json } from '@sveltejs/kit';
import { query } from '$lib/db.js';
import { sendInvoiceRequest } from '$lib/email.js';

export async function POST({ request }) {
	try {
		const { bookingData, invoiceData } = await request.json();

		// Beräkna slots baserat på start och sluttid
		const startSlot = calculateTimeSlot(bookingData.start_time);
		const endSlot = calculateTimeSlot(bookingData.end_time);
		const totalSlots = endSlot - startSlot + 1;

		// spara bokningen i databasen med alla nödvändiga fält
		const {
			rows: [booking]
		} = await query(
			`INSERT INTO bookings (
                experience_id, experience, start_date, start_time, 
                end_date, end_time, number_of_adults, number_of_children,
                booking_name, booking_lastname, customer_email, 
                customer_phone, customer_comment, startlocation,
                status, amount_total, amount_canoes, amount_kayak, 
                amount_sup, start_slot, end_slot, total_slots, booking_type
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
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
				bookingData.amount_total,
				bookingData.amount_canoes || 0,
				bookingData.amount_kayak || 0,
				bookingData.amount_sup || 0,
				startSlot,
				endSlot,
				totalSlots,
				'invoice'
			]
		);

		// spara faktureringsinformation med korrekt fakturatyp
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

		// Uppdatera tillgänglighet på samma sätt som för betalda bokningar
		await updateAvailability(bookingData.start_date, bookingData.end_date, startSlot, endSlot);

		// skicka e-postnotifieringar med korrekt fakturatyp
		await sendInvoiceRequest(
			{
				...bookingData,
				id: booking.id,
				invoice_type: invoiceData.invoiceType
			},
			invoiceData
		);

		return json({ success: true, bookingId: booking.id });
	} catch (error) {
		console.error('Error handling invoice request:', error);
		return json({ error: 'Could not process invoice request' }, { status: 500 });
	}
}

// Hjälpfunktion för att beräkna tidsluckor
function calculateTimeSlot(time) {
	const [hours, minutes] = time.split(':').map(Number);
	return Math.floor((hours * 60 + minutes) / 30) + 1;
}

// Funktion för att uppdatera tillgänglighet
async function updateAvailability(startDate, endDate, startSlot, endSlot) {
	try {
		await query(
			`INSERT INTO availability (date, slot, is_booked) 
             VALUES ($1, $2, true) 
             ON CONFLICT (date, slot) 
             DO UPDATE SET is_booked = true`,
			[startDate, startSlot]
		);
		// Uppdatera alla slots mellan start och slut
		// Implementera logiken här baserat på din befintliga tillgänglighetshantering
	} catch (error) {
		console.error('Error updating availability:', error);
		throw error;
	}
}
