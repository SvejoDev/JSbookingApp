import { json } from '@sveltejs/kit';
import { query } from '$lib/db.js';
import { sendInvoiceRequest, sendBookingConfirmation } from '$lib/email.js';
import { timeToSlot, calculateTotalSlots, timeToMinutes } from '$lib/utils/timeSlots.js';

export async function POST({ request }) {
	try {
		const { bookingData, invoiceData } = await request.json();
		console.log('Mottagen invoiceData:', {
			...invoiceData,
			invoiceEmail: invoiceData.invoiceEmail // Kontrollera specifikt detta fält
		});

		// Spara addons och optional products separat
		const originalAddons = { ...bookingData.addons };
		const optionalProducts = bookingData.optional_products || [];

		console.log('📦 Ursprunglig bookingData:', JSON.stringify(bookingData, null, 2));
		console.log('🎁 Sparade addons:', originalAddons);
		console.log('Received optional products:', optionalProducts);

		// Beräkna slots med säker konvertering
		const startSlot = parseInt(timeToSlot(bookingData.start_time)) || 0;
		const endSlot = parseInt(timeToSlot(bookingData.end_time)) || 0;
		const totalSlots =
			parseInt(calculateTotalSlots(startSlot, endSlot, bookingData.booking_type === 'overnight')) ||
			0;

		// Säkerställ att selectedStartLocation är ett nummer
		const startLocation = parseInt(bookingData.selectedStartLocation) || null;

		// Beräkna totalpris inklusive tillvalsprodukter
		const optionalProductsTotal = optionalProducts.reduce(
			(sum, product) => sum + (parseInt(product.total_price) || 0),
			0
		);

		const totalPrice = parseInt(bookingData.amount_total) + optionalProductsTotal;

		// Säkerställ att alla numeriska värden är giltiga
		const safeBookingData = {
			...bookingData,
			number_of_adults: parseInt(bookingData.number_of_adults) || 0,
			number_of_children: parseInt(bookingData.number_of_children) || 0,
			amount_total: parseInt(bookingData.amount_total) || 0,
			start_slot: parseInt(startSlot) || 0,
			end_slot: parseInt(endSlot) || 0,
			total_slots: parseInt(totalSlots) || 0,
			startlocation: parseInt(bookingData.selectedStartLocation) || null
		};

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
			'payment_method',
			'confirmation_sent',
			'amount_canoes',
			'amount_kayak',
			'amount_sup'
		];

		// Skapa motsvarande värden för baskolumnerna
		const baseValues = [
			safeBookingData.experience_id,
			safeBookingData.experience,
			safeBookingData.start_date,
			safeBookingData.end_date || safeBookingData.start_date,
			safeBookingData.start_time,
			safeBookingData.end_time,
			safeBookingData.number_of_adults,
			safeBookingData.number_of_children,
			safeBookingData.amount_total,
			safeBookingData.booking_name,
			safeBookingData.booking_lastname,
			safeBookingData.customer_email,
			safeBookingData.customer_phone,
			safeBookingData.customer_comment || '',
			'day',
			safeBookingData.selectedStartLocation,
			'pending_payment',
			safeBookingData.start_slot,
			safeBookingData.end_slot,
			safeBookingData.total_slots,
			safeBookingData.payment_method,
			false,
			parseInt(originalAddons.amount_canoes) || 0,
			parseInt(originalAddons.amount_kayak) || 0,
			parseInt(originalAddons.amount_sup) || 0
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

		// Spara bokningen med säkra värden
		const bookingResult = await query(
			`INSERT INTO bookings (
				experience_id, experience, start_date, end_date,
				start_time, end_time, number_of_adults, number_of_children,
				amount_total, booking_name, booking_lastname, customer_email,
				customer_phone, customer_comment, booking_type, startlocation,
				status, start_slot, end_slot, total_slots, payment_method,
				confirmation_sent, amount_canoes, amount_kayak, amount_sup
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
			RETURNING id`,
			[
				parseInt(safeBookingData.experience_id) || null,
				safeBookingData.experience,
				safeBookingData.start_date,
				safeBookingData.end_date || safeBookingData.start_date,
				safeBookingData.start_time,
				safeBookingData.end_time,
				safeBookingData.number_of_adults,
				safeBookingData.number_of_children,
				totalPrice,
				safeBookingData.booking_name,
				safeBookingData.booking_lastname,
				safeBookingData.customer_email,
				safeBookingData.customer_phone,
				safeBookingData.customer_comment,
				'day',
				startLocation,
				'pending_payment',
				safeBookingData.start_slot,
				safeBookingData.end_slot,
				safeBookingData.total_slots,
				safeBookingData.payment_method,
				false,
				parseInt(originalAddons.amount_canoes) || 0,
				parseInt(originalAddons.amount_kayak) || 0,
				parseInt(originalAddons.amount_sup) || 0
			]
		);

		const bookingId = bookingResult.rows[0].id;

		// Spara tillvalsprodukter
		if (optionalProducts.length > 0) {
			console.log('Saving optional products:', optionalProducts);

			for (const product of optionalProducts) {
				await query(
					`INSERT INTO booking_optional_products 
					(booking_id, optional_product_id, quantity, price_per_unit, total_price)
					VALUES ($1, $2, $3, $4, $5)`,
					[
						bookingId,
						parseInt(product.id),
						parseInt(product.quantity) || 0,
						parseInt(product.price) || 0,
						parseInt(product.total_price) || 0
					]
				);
			}
		}

		// Spara fakturainformation om det är en fakturabetaling
		if (safeBookingData.payment_method === 'invoice') {
			await query(
				`INSERT INTO invoice_details (
					booking_id, invoice_type, invoice_email, gln_peppol_id,
					marking, organization, address, postal_code, city
				) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
				[
					bookingId,
					invoiceData.invoiceType,
					invoiceData.invoiceEmail,
					invoiceData.glnPeppolId || '',
					invoiceData.marking || '',
					invoiceData.organization,
					invoiceData.address,
					invoiceData.postalCode,
					invoiceData.city
				]
			);
		}

		// Lägg till extra loggning före e-postutskick
		console.log('Preparing to send invoice request with data:', {
			bookingId,
			invoiceType: invoiceData.invoiceType,
			invoiceEmail: invoiceData.invoiceEmail
		});

		// Skicka både fakturabegäran och bokningsbekräftelse
		try {
			await sendInvoiceRequest(safeBookingData, invoiceData);
			console.log('✅ Fakturabegäran skickad framgångsrikt');

			await sendBookingConfirmation(safeBookingData, true);
			console.log('✅ Bokningsbekräftelse skickad framgångsrikt');

			// Uppdatera endast confirmation_sent
			await query(
				`UPDATE bookings 
				 SET confirmation_sent = true
				 WHERE id = $1`,
				[bookingId]
			);

			return json({
				success: true,
				bookingId,
				url: `/success?booking_id=${bookingId}&type=invoice`
			});
		} catch (emailError) {
			console.error('❌ Fel vid skickande av e-post:', {
				error: emailError.message,
				details: emailError.response?.body
			});
			throw emailError;
		}
	} catch (error) {
		console.error('Error in handle-invoice:', error);
		return json(
			{
				error: 'Ett fel uppstod vid hantering av fakturan',
				details: error.message
			},
			{ status: 500 }
		);
	}
}

function calculateBasePrice(bookingData) {
	let total = 0;

	// Grundpris för bokningen
	total += bookingData.base_price * bookingData.number_of_adults;

	// Lägg till pris för tillvalsprodukter
	if (bookingData.optional_products) {
		for (const product of bookingData.optional_products) {
			if (product.type === 'per_person') {
				total += product.price * bookingData.number_of_adults;
			} else {
				total += product.price * product.quantity;
			}
		}
	}

	return total;
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
