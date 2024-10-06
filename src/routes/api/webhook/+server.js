import { json } from '@sveltejs/kit';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import { supabase } from '$lib/supabaseClient.js';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST({ request }) {
	const payload = await request.text();
	const sig = request.headers.get('stripe-signature');

	let event;

	try {
		event = stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET);
		console.log('Stripe event constructed:');
	} catch (err) {
		console.error(`Webhook Error: ${err.message}`);
		return json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
	}

	if (event.type === 'checkout.session.completed') {
		const session = event.data.object;
		console.log('Checkout session completed:');

		const {
			experience_id,
			experience,
			startLocation,
			start_date,
			start_time,
			end_date,
			end_time,
			number_of_adults,
			number_of_children,
			amount_canoes,
			amount_kayak,
			amount_sup,
			booking_name,
			booking_lastname,
			customer_comment,
			customer_email
		} = session.metadata;

		const { error } = await supabase.from('bookings').insert({
			stripe_session_id: session.id,
			customer_email: session.customer_email,
			amount_total: session.amount_total / 100,
			status: 'betald',
			experience_id,
			experience,
			startLocation,
			start_date,
			start_time,
			end_date,
			end_time,
			number_of_adults,
			number_of_children,
			amount_canoes,
			amount_kayak,
			amount_sup,
			booking_name,
			booking_lastname,
			customer_comment,
			customer_email
		});

		if (error) {
			console.error('Error inserting into Supabase:', error);
			return json({ error: 'Error inserting into Supabase' }, { status: 500 });
		}

		console.log('Booking inserted into Supabase successfully.');
	}

	return json({ received: true }, { status: 200 });
}
