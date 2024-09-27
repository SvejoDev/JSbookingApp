import { json } from '@sveltejs/kit';
import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST({ request }) {
	try {
		const { amount, name } = await request.json();

		console.log('Received request:', { amount, name });

		if (!amount || !name) {
			return json({ error: 'Missing required fields: amount or name' }, { status: 400 });
		}

		console.log('Creating Stripe session...');
		const session = await stripe.checkout.sessions.create({
			payment_method_types: ['card', 'klarna',],
			line_items: [
				{
					price_data: {
						currency: 'sek',
						product_data: {
							name: name
						},
						unit_amount: Math.round(amount * 100) // Stripe uses cents, ensure it's an integer
					},
					quantity: 1
				}
			],
			mode: 'payment',
			success_url: 'http://localhost:5173/success',
			cancel_url: 'http://localhost:5173/cancel'
		});

		return json({ id: session.id });
	} catch (error) {
		console.error('Error in create-checkout-session:', error);
		return json({ error: error.message }, { status: 500 });
	}
}
