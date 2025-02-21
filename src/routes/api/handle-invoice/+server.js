import { json } from '@sveltejs/kit';
import { query } from '$lib/db.js';
import { sendInvoiceRequest } from '$lib/email.js';

export async function POST({ request }) {
	try {
		const { bookingData, invoiceData } = await request.json();

		// Spara addons separat innan vi modifierar bookingData
		const originalAddons = { ...bookingData.addons };

		console.log('📦 Ursprunglig bookingData:', JSON.stringify(bookingData, null, 2));
		console.log('🎁 Sparade addons:', originalAddons);

		// Beräkna slots
		const startSlot = timeToSlot(bookingData.start_time);
		const endSlot = timeToSlot(bookingData.end_time);
		const totalSlots = calculateTotalSlots(
			startSlot,
			endSlot,
			bookingData.booking_type === 'overnight'
		);

		// Definiera baskolumner för bokningen (ta bort selected_start_location)
		const baseColumns = [
			'experience_id',
			'experience',
			'start_date',
			'end_date',
			'start_time',
			'end_time',
			'number_of_adults',
			'number_of_children',
			'amount_total',
			'booking_name',
			'booking_lastname',
			'customer_email',
			'customer_phone',
			'customer_comment',
			'booking_type',
			'startlocation',
			'status',
			'start_slot',
			'end_slot',
			'total_slots',
			'payment_method'
		];

		// Skapa motsvarande värden för baskolumnerna
		const baseValues = [
			bookingData.experience_id,
			bookingData.experience,
			bookingData.start_date,
			bookingData.end_date || bookingData.start_date,
			bookingData.start_time,
			bookingData.end_time,
			bookingData.number_of_adults,
			bookingData.number_of_children,
			bookingData.amount_total,
			bookingData.booking_name,
			bookingData.booking_lastname,
			bookingData.customer_email,
			bookingData.customer_phone,
			bookingData.customer_comment || '',
			'day',
			bookingData.selectedStartLocation,
			'pending_payment',
			startSlot,
			endSlot,
			totalSlots,
			'invoice'
		];

		// Hämta alla addons från databasen
		const { rows: addons } = await query(
			'SELECT id, name, column_name, availability_table_name FROM addons'
		);

		console.log('🔍 Hämtade addons från DB:', addons);

		// Skapa booking-objektet med addons inkluderade
		const allColumns = [...baseColumns, ...addons.map((addon) => addon.column_name)];

		// Använd originalAddons för att sätta värdena
		const allValues = [
			...baseValues,
			...addons.map((addon) => parseInt(originalAddons?.[addon.column_name] || 0))
		];

		console.log('Inserting booking with columns:', allColumns);
		console.log('and values:', allValues);

		// Skapa bokningen i databasen
		const {
			rows: [booking]
		} = await query(
			`INSERT INTO bookings (${allColumns.join(', ')})
			 VALUES (${allColumns.map((_, i) => `$${i + 1}`).join(', ')})
			 RETURNING *`, // Ändrat till RETURNING * för att få all bokningsdata
			allValues
		);

		// Lägg till: Spara fakturainformation
		const invoiceColumns = [
			'booking_id',
			'invoice_type',
			'gln_peppol_id',
			'marking',
			'organization',
			'address',
			'postal_code',
			'city'
		];

		const invoiceValues = [
			booking.id,
			invoiceData.invoiceType,
			invoiceData.glnPeppolId,
			invoiceData.marking,
			invoiceData.organization,
			invoiceData.address,
			invoiceData.postalCode,
			invoiceData.city
		];

		// Lägg till invoice_email endast för PDF-fakturor
		if (invoiceData.invoiceType === 'pdf') {
			invoiceColumns.push('invoice_email');
			invoiceValues.push(invoiceData.invoiceEmail);
		}

		const {
			rows: [invoiceDetails]
		} = await query(
			`INSERT INTO invoice_details (${invoiceColumns.join(', ')})
			 VALUES (${invoiceColumns.map((_, i) => `$${i + 1}`).join(', ')})
			 RETURNING *`,
			invoiceValues
		);

		// Skicka med de ursprungliga addon-värdena till updateAvailability
		const bookingWithAddons = {
			...booking,
			addons: originalAddons,
			invoiceDetails // Lägg till fakturainformationen i svaret
		};

		await updateAvailability(bookingWithAddons);

		// Skicka e-postnotifieringar med korrekta addon-värden
		await sendInvoiceRequest(
			{
				...bookingWithAddons,
				invoice_type: invoiceData.invoiceType
			},
			invoiceData
		);

		return json({
			success: true,
			bookingId: booking.id,
			invoiceDetails // Inkludera fakturainformationen i svaret
		});
	} catch (error) {
		console.error('❌ Error handling invoice request:', error);
		return json({ error: 'Could not process invoice request' }, { status: 500 });
	}
}

// Hjälpfunktion för att beräkna tidsluckor
function calculateTimeSlot(time) {
	const [hours, minutes] = time.split(':').map(Number);
	return Math.floor((hours * 60 + minutes) / 30) + 1;
}

// Uppdaterad updateAvailability funktion
async function updateAvailability(bookingData) {
	try {
		console.log('🎯 Starting updateAvailability with data:', {
			bookingData: JSON.stringify(bookingData, null, 2),
			originalAddons: bookingData.addons // Logga originalvärdena
		});

		const { rows: addons } = await query(
			'SELECT name, availability_table_name, column_name FROM addons'
		);

		for (const addon of addons) {
			// Använd originalvärdet direkt från bookingData.addons
			const amount = parseInt(bookingData.addons?.[addon.column_name] || 0);

			console.log(`🎲 Processing ${addon.name}:`, {
				amount,
				originalValue: bookingData.addons?.[addon.column_name],
				columnName: addon.column_name
			});

			if (amount > 0) {
				const startDate = new Date(bookingData.start_date);
				const endDate = new Date(bookingData.end_date || bookingData.start_date);
				const isOvernight = bookingData.booking_type === 'overnight';

				for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
					const dateStr = date.toISOString().split('T')[0];
					const isFirstDay = date.getTime() === startDate.getTime();
					const isLastDay = date.getTime() === endDate.getTime();
					const isMiddleDay = !isFirstDay && !isLastDay;

					// beräkna start- och sluttider för denna dag
					let startMinutes, endMinutes;

					if (isOvernight) {
						if (isFirstDay) {
							startMinutes = timeToMinutes(bookingData.start_time);
							endMinutes = 1440; // 24:00
						} else if (isMiddleDay) {
							startMinutes = 0;
							endMinutes = 1440;
						} else if (isLastDay) {
							startMinutes = 0;
							endMinutes = timeToMinutes(bookingData.end_time);
						}
					} else {
						startMinutes = timeToMinutes(bookingData.start_time);
						endMinutes = timeToMinutes(bookingData.end_time);
					}

					console.log('Time range:', {
						date: dateStr,
						isFirstDay,
						isMiddleDay,
						isLastDay,
						startMinutes,
						endMinutes
					});

					// skapa rad om den inte finns
					const { rows } = await query(
						`SELECT date FROM ${addon.availability_table_name} WHERE date = $1`,
						[dateStr]
					);

					if (rows.length === 0) {
						await query(`INSERT INTO ${addon.availability_table_name} (date) VALUES ($1)`, [
							dateStr
						]);
					}

					// uppdatera slots för denna dag
					const slots = [];
					for (let minutes = startMinutes; minutes < endMinutes; minutes += 15) {
						const slotMinutes = Math.floor(minutes / 15) * 15;
						slots.push(`"${slotMinutes}" = COALESCE("${slotMinutes}", 0) - ${amount}`);
					}

					if (slots.length > 0) {
						await query(
							`UPDATE ${addon.availability_table_name}
							 SET ${slots.join(', ')}
							 WHERE date = $1`,
							[dateStr]
						);
					}
				}
			}
		}
	} catch (error) {
		console.error('Error in updateAvailability:', error);
		throw error;
	}
}

// hjälpfunktion för att konvertera tid till minuter
function timeToMinutes(time) {
	const [hours, minutes] = time.split(':').map(Number);
	return hours * 60 + minutes;
}

// Lägg till hjälpfunktioner för slots-beräkning
function timeToSlot(time) {
	const [hours, minutes] = time.split(':').map(Number);
	return (hours * 60 + minutes) / 15;
}

function calculateTotalSlots(startSlot, endSlot, isOvernight) {
	if (isOvernight) {
		return 96 - startSlot; // 96 slots per dag (24 timmar * 4 slots per timme)
	}
	return endSlot - startSlot;
}
