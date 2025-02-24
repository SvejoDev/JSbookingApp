import Stripe from 'stripe';
import dotenv from 'dotenv';
import { json } from '@sveltejs/kit';
import { query } from '$lib/db';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST({ request }) {
	try {
		const data = await request.json();
		console.log('Checkout Request Data:', data);

		// Beräkna totalpris inklusive tillvalsprodukter
		const optionalProductsTotal = (data.optional_products || []).reduce(
			(sum, product) => sum + (parseInt(product.total_price) || 0),
			0
		);

		const totalPrice = parseInt(data.amount_total) + optionalProductsTotal;

		// Konvertera addons-objektet till en JSON-sträng
		const metadata = {
			...data,
			addons: JSON.stringify(data.addons),
			optional_products: JSON.stringify(data.optional_products || [])
		};

		// Skapa Stripe checkout session
		const session = await stripe.checkout.sessions.create({
			payment_method_types: ['card'],
			line_items: [
				{
					price_data: {
						currency: 'sek',
						product_data: {
							name: `${data.experience} - ${data.number_of_adults} vuxna`,
							description: `Datum: ${data.start_date}, Tid: ${data.start_time}`
						},
						unit_amount: totalPrice * 100
					},
					quantity: 1
				}
			],
			mode: 'payment',
			success_url: `${data.domain}/success?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${data.domain}/booking/${data.experience_id}`,
			metadata
		});

		return json({ url: session.url });
	} catch (error) {
		console.error('Fel vid skapande av checkout session:', error);
		return json({ error: error.message }, { status: 500 });
	}
}

function calculateEndDate(startDate, nights) {
	if (!nights || nights <= 0) return startDate;

	const date = new Date(startDate);
	date.setDate(date.getDate() + nights);
	return date.toISOString().split('T')[0];
}

function calculateTimeSlot(time) {
	const [hours, minutes] = time.split(':').map(Number);
	return (hours * 60 + minutes) / 15;
}

function calculateTotalSlots(startTime, endTime) {
	const startSlot = calculateTimeSlot(startTime);
	const endSlot = calculateTimeSlot(endTime);
	return endSlot - startSlot;
}
