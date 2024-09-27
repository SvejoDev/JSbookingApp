import { json } from '@sveltejs/kit';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST({ request }) {
	const { amount, name } = await request.json();

	try {
		const session = await stripe.checkout.sessions.create({
			payment_method_types: ['card'],
			line_items: [
				{
					price_data: {
						currency: 'sek',
						product_data: {
							name: name
						},
						unit_amount: amount * 100 // Stripe uses cents
					},
					quantity: 1
				}
			],
			mode: 'payment',
			success_url: 'https://stisses.se/',
			cancel_url: 'https://stisses.se/'
		});

		return json({ id: session.id });
	} catch (e) {
		return json({ error: e.message }, { status: 500 });
	}
}
