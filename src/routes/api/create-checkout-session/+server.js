import Stripe from 'stripe';
import dotenv from 'dotenv';
import { json } from '@sveltejs/kit';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST({ request, url }) {
	try {
		const origin = url.origin;
		const requestData = await request.json();

		const session = await stripe.checkout.sessions.create({
			payment_method_types: ['card', 'klarna'],
			customer_email: requestData.customer_email, // Add this line
			line_items: [
				{
					price_data: {
						currency: 'sek',
						product_data: { name: requestData.name },
						unit_amount: Math.round(requestData.amount * 100)
					},
					quantity: 1
				}
			],
			mode: 'payment',
			success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${origin}/cancel`,
			metadata: {
				experience_id: requestData.experience_id,
				experience: requestData.experience,
				startLocation: requestData.startLocation,
				start_date: requestData.start_date,
				start_time: requestData.start_time,
				end_date: requestData.end_date,
				end_time: requestData.end_time,
				number_of_adults: requestData.number_of_adults,
				number_of_children: requestData.number_of_children,
				amount_canoes: requestData.amount_canoes,
				amount_kayak: requestData.amount_kayak,
				amount_SUP: requestData.amount_SUP,
				booking_name: requestData.booking_name,
				booking_lastname: requestData.booking_lastname,
				customer_comment: requestData.customer_comment,
				customer_email: requestData.customer_email
			}
		});

		return json({ id: session.id });
	} catch (error) {
		console.error('Stripe session creation error:', error);
		return json({ error: error.message }, { status: 500 });
	}
}
