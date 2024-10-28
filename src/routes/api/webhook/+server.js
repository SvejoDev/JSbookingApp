import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient.js';
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
		console.log('Stripe event constructed:', event.type);
	} catch (err) {
		console.error(`Webhook Error: ${err.message}`);
		return json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
	}

	if (event.type === 'checkout.session.completed') {
		const session = event.data.object;
		console.log('Checkout session completed:', session.id);

		try {
			// Först spara bokningen i bookings-tabellen
			const { error: bookingError } = await supabase.from('bookings').insert({
				stripe_session_id: session.id,
				customer_email: session.customer_email,
				amount_total: session.amount_total / 100,
				status: 'betald',
				experience_id: session.metadata.experience_id,
				experience: session.metadata.experience,
				startLocation: session.metadata.startLocation,
				start_date: session.metadata.start_date,
				start_time: session.metadata.start_time,
				end_date: session.metadata.end_date,
				end_time: session.metadata.end_time,
				number_of_adults: parseInt(session.metadata.number_of_adults),
				number_of_children: parseInt(session.metadata.number_of_children),
				amount_canoes: parseInt(session.metadata.amount_canoes || 0),
				amount_kayak: parseInt(session.metadata.amount_kayak || 0),
				amount_sup: parseInt(session.metadata.amount_SUP || 0),
				booking_name: session.metadata.booking_name,
				booking_lastname: session.metadata.booking_lastname,
				customer_comment: session.metadata.customer_comment,
				customer_email: session.metadata.customer_email
			});

			if (bookingError) {
				console.error('Error inserting booking:', bookingError);
				return json({ error: 'Error inserting booking' }, { status: 500 });
			}

			// Sedan uppdatera tillgängligheten
			await updateAvailability({
				start_date: session.metadata.start_date,
				start_time: session.metadata.start_time,
				end_date: session.metadata.end_date,
				end_time: session.metadata.end_time,
				amount_canoes: parseInt(session.metadata.amount_canoes || 0),
				amount_kayak: parseInt(session.metadata.amount_kayak || 0),
				amount_sup: parseInt(session.metadata.amount_SUP || 0)
			});

			console.log('Booking and availability updated successfully');
			return json({ received: true });
		} catch (error) {
			console.error('Error processing booking:', error);
			return json({ error: 'Error processing booking' }, { status: 500 });
		}
	}

	return json({ received: true });
}

async function updateAvailability(booking) {
	const timeToIndex = (timeStr) => {
		const [hours, minutes] = timeStr.split(':').map(Number);
		return hours * 4 + Math.floor(minutes / 15);
	};

	async function updateProductAvailability(tableName, quantity) {
		if (quantity <= 0) return;

		const startIndex = timeToIndex(booking.start_time);
		const endIndex = booking.end_date === booking.start_date ? timeToIndex(booking.end_time) : 96;

		// Först hämta befintlig rad om den finns
		const { data: existingRow } = await supabase
			.from(tableName)
			.select('*')
			.eq('date', booking.start_date)
			.single();

		const updates = {};
		for (let i = startIndex; i < endIndex; i++) {
			const columnName = i.toString();
			const existingValue = existingRow ? existingRow[columnName] || 0 : 0;
			updates[columnName] = existingValue - quantity;
		}

		const { error } = await supabase.from(tableName).upsert(
			{
				date: booking.start_date,
				...updates
			},
			{
				onConflict: 'date',
				returning: 'minimal'
			}
		);

		if (error) throw error;

		// Om det är en övernattningsbokning, uppdatera även nästa dag
		if (booking.end_date !== booking.start_date) {
			const nextDayEndIndex = timeToIndex(booking.end_time);

			// Hämta befintlig rad för nästa dag om den finns
			const { data: existingNextDayRow } = await supabase
				.from(tableName)
				.select('*')
				.eq('date', booking.end_date)
				.single();

			const nextDayUpdates = {};
			for (let i = 0; i < nextDayEndIndex; i++) {
				const columnName = i.toString();
				const existingValue = existingNextDayRow ? existingNextDayRow[columnName] || 0 : 0;
				nextDayUpdates[columnName] = existingValue - quantity;
			}

			const { error: nextDayError } = await supabase.from(tableName).upsert(
				{
					date: booking.end_date,
					...nextDayUpdates
				},
				{
					onConflict: 'date',
					returning: 'minimal'
				}
			);

			if (nextDayError) throw nextDayError;
		}
	}

	// Uppdatera alla produkttyper
	await Promise.all([
		updateProductAvailability('canoe_availability', booking.amount_canoes),
		updateProductAvailability('kayak_availability', booking.amount_kayak),
		updateProductAvailability('sup_availability', booking.amount_sup)
	]);
}
