import { json } from '@sveltejs/kit';
import { query, transaction } from '$lib/db.js';
import { sendInvoiceRequest } from '$lib/email.js';
import { timeToSlot, calculateTotalSlots, timeToMinutes } from '$lib/utils/timeSlots.js';

export async function POST({ request }) {
	try {
		const { bookingData, invoiceData } = await request.json();

		// Validera och säkerställ att alla nödvändiga värden finns
		if (!bookingData.experience_id || !bookingData.selectedStartLocation) {
			throw new Error('Saknar nödvändig bokningsdata');
		}

		console.log('Mottagen invoiceData:', {
			...invoiceData,
			invoiceEmail: invoiceData.invoiceEmail // Kontrollera specifikt detta fält
		});

		// Definiera baskolumnerna för bookings-tabellen
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
			'payment_method',
			'confirmation_sent'
		];

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

		// Säkerställ att alla värden är korrekta typer
		const baseValues = [
			parseInt(bookingData.experience_id),
			bookingData.experience,
			bookingData.start_date,
			bookingData.end_date || bookingData.start_date,
			bookingData.start_time,
			bookingData.end_time,
			parseInt(bookingData.number_of_adults) || 0,
			parseInt(bookingData.number_of_children) || 0,
			parseInt(bookingData.amount_total) || 0,
			bookingData.booking_name,
			bookingData.booking_lastname,
			bookingData.customer_email,
			bookingData.customer_phone,
			bookingData.customer_comment || '',
			'day',
			parseInt(bookingData.selectedStartLocation),
			'pending_payment',
			startSlot,
			endSlot,
			totalSlots,
			'invoice',
			false
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
		const bookingResult = await query(
			`INSERT INTO bookings (${baseColumns.join(', ')}) 
			 VALUES (${baseValues.map((_, i) => `$${i + 1}`).join(', ')})
			 RETURNING *`,
			baseValues
		);

		const bookingId = bookingResult.rows[0].id;

		// Spara tillvalsprodukter om de finns
		if (bookingData.selectedOptionalProducts) {
			for (const [productId, quantity] of Object.entries(bookingData.selectedOptionalProducts)) {
				if (quantity > 0) {
					const product = await query('SELECT price, type FROM optional_products WHERE id = $1', [
						productId
					]);

					if (product.rows[0]) {
						const { price, type } = product.rows[0];
						const totalPrice =
							type === 'per_person'
								? quantity * price
								: (bookingData.number_of_adults + bookingData.number_of_children) * price;

						await query(
							`INSERT INTO booking_optional_products 
							(booking_id, optional_product_id, quantity, price_per_unit, total_price)
							VALUES ($1, $2, $3, $4, $5)`,
							[bookingId, productId, quantity, price, totalPrice]
						);
					}
				}
			}
		}

		// Uppdatera invoice_details hanteringen
		const invoiceColumns = [
			'booking_id',
			'invoice_type',
			'invoice_email', // Flytta detta till huvudlistan
			'gln_peppol_id',
			'marking',
			'organization',
			'address',
			'postal_code',
			'city'
		];

		const invoiceValues = [
			bookingId,
			invoiceData.invoiceType,
			invoiceData.invoiceEmail, // Lägg till detta direkt
			invoiceData.glnPeppolId || '',
			invoiceData.marking || '',
			invoiceData.organization,
			invoiceData.address,
			invoiceData.postalCode,
			invoiceData.city
		];

		console.log('Invoice values som ska sparas:', invoiceValues); // Debugging

		const {
			rows: [invoiceDetails]
		} = await query(
			`INSERT INTO invoice_details (${invoiceColumns.join(', ')})
			 VALUES (${invoiceColumns.map((_, i) => `$${i + 1}`).join(', ')})
			 RETURNING *`,
			invoiceValues
		);

		console.log('Sparad fakturainformation:', invoiceDetails); // Debugging

		// Skicka med de ursprungliga addon-värdena till updateAvailability
		const bookingWithAddons = {
			...bookingResult.rows[0],
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
			bookingId: bookingId || null, // Säkerställ att vi alltid har ett värde
			invoiceDetails: invoiceDetails || null
		});
	} catch (error) {
		console.error('Fel vid hantering av faktura:', error);
		return json({
			success: false,
			error: error.message,
			stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
		});
	}
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
