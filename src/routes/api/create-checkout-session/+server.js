import Stripe from 'stripe';
import { logger } from '$lib/utils/logger';
import dotenv from 'dotenv';
import { json } from '@sveltejs/kit';
import { query } from '$lib/db';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST({ request }) {
	try {
		const data = await request.json();
		logger.info('Checkout Request Data:', data);

		// hämta startlocation pris
		const {
			rows: [location]
		} = await query('SELECT price FROM start_locations WHERE id = $1', [
			data.selectedStartLocation
		]);

		// säkerställ att base_price kommer från location
		const basePrice = location?.price || 0;
		const numberOfAdults = parseInt(data.number_of_adults) || 0;
		const baseTotalPrice = basePrice * numberOfAdults;

		// skapa metadata för addons dynamiskt
		const addonMetadata = {};
		const { rows: addons } = await query('SELECT id, name, column_name FROM addons');

		for (const addon of addons) {
			const amount = parseInt(data.addons?.[addon.column_name]) || 0;
			addonMetadata[addon.column_name] = amount.toString();
		}

		// beräkna optional products total
		const optionalProductsTotal = (data.optional_products || []).reduce(
			(sum, product) => sum + (parseInt(product.total_price) || 0),
			0
		);

		// beräkna totalpris exklusive moms
		const totalPriceExcVat = baseTotalPrice + optionalProductsTotal;

		if (isNaN(totalPriceExcVat)) {
			logger.error('Prisberäkningsfel:', {
				basePrice,
				numberOfAdults,
				optionalProductsTotal
			});
			throw new Error('Ogiltigt totalpris beräknat');
		}

		// beräkna pris inklusive moms
		const totalPriceIncVat = Math.round(totalPriceExcVat * 0.8);

		const session = await stripe.checkout.sessions.create({
			payment_method_types: ['card'],
			line_items: [
				{
					price_data: {
						currency: 'sek',
						product_data: {
							name: `${data.experience} - ${numberOfAdults} vuxna`,
							description: `Datum: ${data.start_date}, Tid: ${data.start_time}`
						},
						unit_amount: totalPriceIncVat * 100
					},
					quantity: 1
				}
			],
			mode: 'payment',
			success_url: `${data.domain}/success?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${data.domain}/booking/${data.experience_id}`,
			metadata: {
				...addonMetadata,
				experience_id: data.experience_id,
				experience: data.experience,
				start_date: data.start_date,
				end_date: data.end_date,
				start_time: data.start_time,
				end_time: data.end_time,
				number_of_adults: numberOfAdults.toString(),
				number_of_children: (parseInt(data.number_of_children) || 0).toString(),
				amount_total_exc_vat: totalPriceExcVat.toString(),
				amount_total_inc_vat: totalPriceIncVat.toString(),
				adult_price: basePrice.toString(),
				startlocation: data.selectedStartLocation,
				startlocation_name: data.startlocation_name,
				booking_name: data.booking_name, // Lägg till dessa
				booking_lastname: data.booking_lastname, // Lägg till dessa
				customer_email: data.customer_email, // Lägg till dessa
				customer_phone: data.customer_phone, // Lägg till denna
				customer_comment: data.customer_comment || '',
				optional_products: JSON.stringify(data.optional_products || [])
			}
		});

		return json({ url: session.url });
	} catch (error) {
		logger.error('Error creating checkout session:', error);
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
