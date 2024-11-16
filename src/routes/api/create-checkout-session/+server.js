import { json } from '@sveltejs/kit';
import Stripe from 'stripe';
import { STRIPE_SECRET_KEY } from '$env/static/private';

const stripe = new Stripe(STRIPE_SECRET_KEY);

export async function POST({ request, url }) {
	try {
		// Använd URL från request-objektet
		const origin = url.origin;
		console.log('Request origin URL:', origin);

		const {
			amount,
			name,
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
			amount_SUP,
			booking_name,
			booking_lastname,
			customer_comment,
			customer_email
		} = await request.json();

		if (!amount || !name) {
			return json({ error: 'Missing required fields: amount or name' }, { status: 400 });
		}

		const successUrl = `${origin}/success?session_id={CHECKOUT_SESSION_ID}`;
		const cancelUrl = `${origin}/cancel`;

		console.log('Generated success URL:', successUrl);
		console.log('Generated cancel URL:', cancelUrl);

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
			success_url: successUrl,
			cancel_url: cancelUrl,
			metadata: {
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
				amount_SUP,
				booking_name,
				booking_lastname,
				customer_comment,
				customer_email
			}
		});

		return json({ id: session.id });
	} catch (error) {
		console.error('Stripe session creation error:', error);
		console.error('Error details:', {
			message: error.message,
			type: error.type,
			raw: error.raw
		});
		return json({ error: error.message }, { status: 500 });
	}
}
