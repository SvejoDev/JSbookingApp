import { json } from '@sveltejs/kit';
import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST({ request }) {
	try {
		const { amount, name } = await request.json();

		if (!amount || !name) {
			return json({ error: 'Missing required fields: amount or name' }, { status: 400 });
		}

		const session = await stripe.checkout.sessions.create({
			payment_method_types: ['card', 'klarna'],
			line_items: [
				{
					price_data: {
						currency: 'sek',
						product_data: { name },
						unit_amount: Math.round(amount * 100)
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
		return json({ error: error.message }, { status: 500 });
	}
}
