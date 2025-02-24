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
						unit_amount: totalPrice * 100 // Stripe använder minsta valutaenhet (öre)
					},
					quantity: 1
				}
			],
			mode: 'payment',
			success_url: `${data.domain}/success?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${data.domain}/booking/${data.experience_id}`,
			metadata: {
				experience_id: data.experience_id,
				experience: data.experience,
				start_date: data.start_date,
				end_date: data.end_date || data.start_date,
				start_time: data.start_time,
				end_time: data.end_time,
				number_of_adults: data.number_of_adults,
				number_of_children: data.number_of_children,
				booking_name: data.booking_name,
				booking_lastname: data.booking_lastname,
				customer_email: data.customer_email,
				customer_phone: data.customer_phone,
				customer_comment: data.customer_comment || '',
				startlocation: data.selectedStartLocation,
				amount_canoes: data.addons?.amount_canoes || 0,
				amount_kayak: data.addons?.amount_kayak || 0,
				amount_sup: data.addons?.amount_sup || 0,
				optional_products: JSON.stringify(data.optional_products || [])
			}
		});

		return json({ url: session.url });
	} catch (error) {
		console.error('Error creating checkout session:', error);
		return json({ error: error.message }, { status: 400 });
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
