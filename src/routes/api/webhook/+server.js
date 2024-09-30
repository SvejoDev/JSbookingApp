// src/routes/api/webhook/+server.js
import { json } from '@sveltejs/kit';
import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST({ request }) {
	const payload = await request.text();
	const sig = request.headers.get('stripe-signature');

	let event;

	try {
		event = stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET);
	} catch (err) {
		console.error(`Webhook Error: ${err.message}`);
		return json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
	}

	// Hantera olika typer av events från Stripe
	if (event.type === 'checkout.session.completed') {
		const session = event.data.object;

		// Skapa bokning i Supabase eller annan databas
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
