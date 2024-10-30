import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabaseAdmin.js';
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
		console.log('Session metadata:', session.metadata);

		try {
			const bookingData = {
				stripe_session_id: session.id,
				customer_email: session.metadata.customer_email,
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
				number_of_children: parseInt(session.metadata.number_of_children || 0),
				amount_canoes: parseInt(session.metadata.amount_canoes || 0),
				amount_kayak: parseInt(session.metadata.amount_kayak || 0),
				amount_sup: parseInt(session.metadata.amount_SUP || 0),
				booking_name: session.metadata.booking_name,
				booking_lastname: session.metadata.booking_lastname,
				customer_comment: session.metadata.customer_comment || ''
			};

			console.log('Booking data to insert:', bookingData);

			const { data, error: bookingError } = await supabaseAdmin
				.from('bookings')
				.insert([bookingData])
				.select();

			if (bookingError) {
				console.error('Error inserting booking:', bookingError);
				return json({ error: 'Error inserting booking' }, { status: 500 });
			}

			console.log('Booking inserted successfully:', data);

			if (data?.[0]) {
				await updateAvailability({
					start_date: session.metadata.start_date,
					start_time: session.metadata.start_time,
					end_date: session.metadata.end_date,
					end_time: session.metadata.end_time,
					amount_canoes: parseInt(session.metadata.amount_canoes || 0),
					amount_kayak: parseInt(session.metadata.amount_kayak || 0),
					amount_sup: parseInt(session.metadata.amount_SUP || 0)
				});

				console.log('Availability updated successfully');
			} else {
				console.error('No booking data returned after insert');
			}

			return json({
				received: true,
				bookingId: data?.[0]?.id,
				message: 'Booking processed successfully'
			});
		} catch (error) {
			console.error('Error processing booking:', error);
			return json({ error: 'Error processing booking', details: error.message }, { status: 500 });
		}
	} else {
		console.log('Received non-checkout event:', event.type);
	}

	return json({ received: true });
}

async function updateAvailability(booking) {
	const timeToIndex = (timeStr) => {
		const [hours, minutes] = timeStr.split(':').map(Number);
		return hours * 4 + Math.floor(minutes / 15);
	};

	const startIndex = timeToIndex(booking.start_time);
	const endIndex = booking.end_date === booking.start_date ? timeToIndex(booking.end_time) : 96;

	// Uppdatera canoe availability
	if (booking.amount_canoes > 0) {
		const canoeUpdates = {};
		for (let i = startIndex; i < endIndex; i++) {
			canoeUpdates[i.toString()] = -booking.amount_canoes;
		}

		const { error: canoeError } = await supabaseAdmin.from('canoe_availability').upsert(
			{
				date: booking.start_date,
				...canoeUpdates
			},
			{
				onConflict: 'date'
			}
		);

		if (canoeError) {
			console.error('Error updating canoe availability:', canoeError);
			throw canoeError;
		}
	}

	// Uppdatera kayak availability
	if (booking.amount_kayak > 0) {
		const kayakUpdates = {};
		for (let i = startIndex; i < endIndex; i++) {
			kayakUpdates[i.toString()] = -booking.amount_kayak;
		}

		const { error: kayakError } = await supabaseAdmin.from('kayak_availability').upsert(
			{
				date: booking.start_date,
				...kayakUpdates
			},
			{
				onConflict: 'date'
			}
		);

		if (kayakError) {
			console.error('Error updating kayak availability:', kayakError);
			throw kayakError;
		}
	}

	// Uppdatera SUP availability
	if (booking.amount_sup > 0) {
		const supUpdates = {};
		for (let i = startIndex; i < endIndex; i++) {
			supUpdates[i.toString()] = -booking.amount_sup;
		}

		const { error: supError } = await supabaseAdmin.from('sup_availability').upsert(
			{
				date: booking.start_date,
				...supUpdates
			},
			{
				onConflict: 'date'
			}
		);

		if (supError) {
			console.error('Error updating SUP availability:', supError);
			throw supError;
		}
	}

	// Om det är en övernattningsbokning, uppdatera även nästa dag
	if (booking.end_date !== booking.start_date) {
		const nextDayEndIndex = timeToIndex(booking.end_time);

		// Uppdatera canoe availability för nästa dag
		if (booking.amount_canoes > 0) {
			const nextDayCanoeUpdates = {};
			for (let i = 0; i < nextDayEndIndex; i++) {
				nextDayCanoeUpdates[i.toString()] = -booking.amount_canoes;
			}

			const { error: canoeError } = await supabaseAdmin.from('canoe_availability').upsert(
				{
					date: booking.end_date,
					...nextDayCanoeUpdates
				},
				{
					onConflict: 'date'
				}
			);

			if (canoeError) {
				console.error('Error updating next day canoe availability:', canoeError);
				throw canoeError;
			}
		}

		// Uppdatera kayak availability för nästa dag
		if (booking.amount_kayak > 0) {
			const nextDayKayakUpdates = {};
			for (let i = 0; i < nextDayEndIndex; i++) {
				nextDayKayakUpdates[i.toString()] = -booking.amount_kayak;
			}

			const { error: kayakError } = await supabaseAdmin.from('kayak_availability').upsert(
				{
					date: booking.end_date,
					...nextDayKayakUpdates
				},
				{
					onConflict: 'date'
				}
			);

			if (kayakError) {
				console.error('Error updating next day kayak availability:', kayakError);
				throw kayakError;
			}
		}

		// Uppdatera SUP availability för nästa dag
		if (booking.amount_sup > 0) {
			const nextDaySupUpdates = {};
			for (let i = 0; i < nextDayEndIndex; i++) {
				nextDaySupUpdates[i.toString()] = -booking.amount_sup;
			}

			const { error: supError } = await supabaseAdmin.from('sup_availability').upsert(
				{
					date: booking.end_date,
					...nextDaySupUpdates
				},
				{
					onConflict: 'date'
				}
			);

			if (supError) {
				console.error('Error updating next day SUP availability:', supError);
				throw supError;
			}
		}
	}
}
