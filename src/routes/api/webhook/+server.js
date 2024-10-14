// src/routes/api/webhook/+server.js

import { json } from '@sveltejs/kit';
import Stripe from 'stripe';
import { supabase } from '$lib/supabaseClient';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET; // Make sure this is set in your .env file

export async function POST({ request }) {
	const payload = await request.text();
	const sig = request.headers.get('stripe-signature');

	let event;

	try {
		event = stripe.webhooks.constructEvent(payload, sig, endpointSecret);
		console.log('Webhook received:', event.type);
	} catch (err) {
		console.error(`Webhook Error: ${err.message}`);
		return json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
	}

	if (event.type === 'checkout.session.completed') {
		const session = event.data.object;
		console.log('Processing checkout.session.completed:', session.id);

		try {
			const { data, error } = await supabase.from('bookings').insert({
				stripe_session_id: session.id,
				experience_id: session.metadata.experience_id,
				experience: session.metadata.experience,
				startLocation: session.metadata.startLocation,
				start_date: session.metadata.start_date,
				start_time: session.metadata.start_time,
				end_date: session.metadata.end_date,
				end_time: session.metadata.end_time,
				number_of_adults: session.metadata.number_of_adults,
				number_of_children: session.metadata.number_of_children,
				amount_canoes: session.metadata.amount_canoes,
				amount_kayak: session.metadata.amount_kayak,
				amount_sup: session.metadata.amount_SUP,
				booking_name: session.metadata.booking_name,
				booking_lastname: session.metadata.booking_lastname,
				customer_comment: session.metadata.customer_comment,
				customer_email: session.customer_email,
				status: 'paid',
				amount_total: session.amount_total / 100
			});

			if (error) throw error;
			console.log('Booking inserted successfully:', data);
		} catch (error) {
			console.error('Error inserting booking:', error);
			return json({ error: 'Error saving booking' }, { status: 500 });
		}
	}

	return json({ received: true });
}
