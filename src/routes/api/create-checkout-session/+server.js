import { json } from '@sveltejs/kit';
import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST({ request }) {
	try {
		const {
			amount,
			name,
			experience_id,
			experience,
			startlocation,
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
			success_url: 'http://localhost:5173/success',
			cancel_url: 'http://localhost:5173/cancel',
			metadata: {
				experience_id,
				experience,
				startlocation,
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
		return json({ error: error.message }, { status: 500 });
	}
}
