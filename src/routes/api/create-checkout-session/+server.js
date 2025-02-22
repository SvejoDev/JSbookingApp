import Stripe from 'stripe';
import dotenv from 'dotenv';
import { json } from '@sveltejs/kit';
import { query } from '$lib/db';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST({ request }) {
	try {
		const data = await request.json();
		console.log('Checkout Request Data:', data);

		// Hämta addons från databasen
		const { rows: addons } = await query('SELECT name, column_name FROM addons');

		// sätt standardvärden för saknade fält
		const metadata = {
			experience_id: data.experienceId?.toString() || '',
			experience: data.name || '',
			start_date: data.startDate || '',
			end_date: data.endDate || data.startDate || '',
			start_time: data.startTime || '',
			end_time: data.returnTime || '',
			booking_type: data.is_overnight ? 'overnight' : 'day',
			booking_length: (data.booking_length || '3h').toString(),
			is_overnight: (data.is_overnight || false).toString(),
			number_of_adults: (data.numAdults || 0).toString(),
			number_of_children: (data.numChildren || 0).toString(),
			booking_name: data.userName || '',
			booking_lastname: data.userLastname || '',
			customer_email: data.userEmail || '',
			customer_phone: data.userPhone || '',
			customer_comment: data.userComment || '',
			selectedStartLocation: data.selectedStartLocation?.toString() || '',
			optional_products: JSON.stringify(data.optional_products || [])
		};

		// Lägg till addon-metadata
		const addonMetadata = Object.fromEntries(
			addons.map((addon) => [addon.column_name, data[addon.column_name]?.toString() || '0'])
		);

		// Konvertera priset till ören (cents)
		const unitAmount = Math.round(data.amount * 100);

		// Lägg till tillvalsprodukter i line items
		const lineItems = [
			{
				price_data: {
					currency: 'sek',
					product_data: {
						name: data.name
					},
					unit_amount: unitAmount
				},
				quantity: 1
			}
		];

		if (data.optional_products && data.optional_products.length > 0) {
			data.optional_products.forEach((product) => {
				lineItems.push({
					price_data: {
						currency: 'sek',
						product_data: {
							name: product.name,
							description: product.description || ''
						},
						unit_amount: product.price * 100 // Konvertera till öre
					},
					quantity: product.type === 'per_person' ? data.numAdults : product.quantity
				});
			});
		}

		// Försök upp till 3 gånger med en sekunds mellanrum
		for (let attempt = 1; attempt <= 3; attempt++) {
			try {
				const session = await stripe.checkout.sessions.create({
					payment_method_types: ['card'],
					customer_email: data.userEmail,
					line_items: lineItems,
					mode: 'payment',
					success_url: `${request.headers.get('origin')}/success?session_id={CHECKOUT_SESSION_ID}`,
					cancel_url: `${request.headers.get('origin')}/cancel`,
					metadata: {
						...metadata,
						...addonMetadata
					}
				});
				return json({ url: session.url });
			} catch (error) {
				if (attempt === 3 || error.type !== 'StripeConnectionError') {
					throw error;
				}
				console.log(`Försök ${attempt} misslyckades, försöker igen...`);
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		}
	} catch (error) {
		console.error('Detaljerat checkout fel:', error);
		return json(
			{
				error: 'Kunde inte skapa checkout-session',
				details: error.message
			},
			{
				status: 500
			}
		);
	}
}

function calculateEndDate(startDate, nights) {
	if (!nights || nights <= 0) return startDate;

	const date = new Date(startDate);
	date.setDate(date.getDate() + nights);
	return date.toISOString().split('T')[0];
}

function calculateTimeSlot(time) {
	const [hours, minutes] = time.split(':').map(Number);
	return (hours * 60 + minutes) / 15;
}

function calculateTotalSlots(startTime, endTime) {
	const startSlot = calculateTimeSlot(startTime);
	const endSlot = calculateTimeSlot(endTime);
	return endSlot - startSlot;
}
