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
			experience_id: requestData.experience_id.toString(),
			experience: requestData.experience,
			startLocation: requestData.startLocation,
			start_date: requestData.start_date,
			start_time: requestData.start_time,
			end_date: requestData.end_date,
			end_time: requestData.end_time,
			number_of_adults: requestData.number_of_adults.toString(),
			number_of_children: requestData.number_of_children?.toString() || '0',
			booking_name: requestData.booking_name,
			booking_lastname: requestData.booking_lastname,
			customer_comment: requestData.customer_comment || '',
			customer_email: requestData.customer_email
		};

		// Lägg till addon-metadata
		const addonMetadata = Object.fromEntries(
			addons.map((addon) => [
				`amount_${addon.column_name}`,
				requestData[`amount_${addon.name.toLowerCase()}`]?.toString() || '0'
			])
		);

		const session = await stripe.checkout.sessions.create({
			payment_method_types: ['card'],
			line_items: [
				{
					price_data: {
						currency: 'sek',
						product_data: {
							name: requestData.name
						},
						unit_amount: requestData.amount
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

		return json(session);
	} catch (error) {
		console.error('Stripe session creation error:', error);
		return json({ error: error.message }, { status: 500 });
	}
}
