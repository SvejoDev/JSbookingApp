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

//Kollar om betlaningen har gått igenom i stripe:
export async function POST({ request }) {
	const payload = await request.text();
	const sig = request.headers.get('stripe-signature');

	let event;

	try {
		event = stripe.webhooks.constructEvent(
			payload,
			sig,
			process.env.STRIPE_WEBHOOK_SECRET // Du måste skapa en ny webhook i ditt Stripe Dashboard
		);
	} catch (err) {
		console.error(`Webhook Error: ${err.message}`);
		return json({ error: 'Webhook Error' }, { status: 400 });
	}

	// Hantera olika typer av events
	if (event.type === 'checkout.session.completed') {
		const session = event.data.object;

		// Här skickar du bokningsinformationen till Supabase eller annan databas
		await supabase.from('bookings').insert({
			stripe_session_id: session.id,
			customer_email: session.customer_email,
			amount_total: session.amount_total,
			status: 'betald'
		});

		console.log('Bokning har skapats efter betalning.');
	}

	return json({ received: true }, { status: 200 });
}
