import Stripe from 'stripe';
import dotenv from 'dotenv';
import { json } from '@sveltejs/kit';
import { query } from '$lib/db';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST({ request }) {
	try {
		const requestData = await request.json();
		console.log('Checkout Request Data:', requestData);

		// Hämta addons från databasen
		const { rows: addons } = await query('SELECT name, column_name FROM addons');

		// Skapa baseMetadata först
		const baseMetadata = {
			experience_id: requestData.experienceId?.toString() || '0',
			experience: requestData.name || '',
			startLocation: requestData.selectedStartLocation?.toString() || '0',
			start_date: requestData.startDate || '',
			start_time: requestData.startTime || '',
			end_date: requestData.returnDate || '',
			end_time: requestData.returnTime || '',
			start_slot: (requestData.start_slot || 0).toString(),
			end_slot: (requestData.end_slot || 0).toString(),
			booking_type: requestData.booking_type || 'custom',
			total_slots: (requestData.total_slots || 0).toString(),
			number_of_adults: (requestData.numAdults || 0).toString(),
			number_of_children: (requestData.numChildren || 0).toString(),
			booking_name: requestData.userName || '',
			booking_lastname: requestData.userLastname || '',
			customer_comment: requestData.userComment || '',
			customer_email: requestData.userEmail || ''
		};

		// Lägg till addon-metadata
		const addonMetadata = Object.fromEntries(
			addons.map((addon) => [addon.column_name, requestData[addon.column_name]?.toString() || '0'])
		);

		// Konvertera priset till ören (cents)
		const unitAmount = Math.round(requestData.amount * 100);

		// Försök upp till 3 gånger med en sekunds mellanrum
		for (let attempt = 1; attempt <= 3; attempt++) {
			try {
				const session = await stripe.checkout.sessions.create({
					payment_method_types: ['card'],
					customer_email: requestData.userEmail,
					line_items: [
						{
							price_data: {
								currency: 'sek',
								product_data: {
									name: requestData.name
								},
								unit_amount: unitAmount
							},
							quantity: 1
						}
					],
					mode: 'payment',
					success_url: `${request.headers.get('origin')}/success?session_id={CHECKOUT_SESSION_ID}`,
					cancel_url: `${request.headers.get('origin')}/cancel`,
					metadata: {
						...baseMetadata,
						...addonMetadata
					}
				});
				return json({ sessionId: session.id });
			} catch (error) {
				if (attempt === 3 || error.type !== 'StripeConnectionError') {
					throw error;
				}
				console.log(`Försök ${attempt} misslyckades, försöker igen...`);
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		}
	} catch (error) {
		console.error('Stripe session creation error:', error);
		return json(
			{ error: 'Kunde inte skapa checkout-session' },
			{ status: 500 }
		);
	}
}
