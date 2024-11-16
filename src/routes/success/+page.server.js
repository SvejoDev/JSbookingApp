import { redirect } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabaseAdmin';

export const load = async ({ url }) => {
	const sessionId = url.searchParams.get('session_id');

	if (!sessionId) {
		throw redirect(303, '/');
	}

	try {
		// First get the booking
		const { data: booking, error: bookingError } = await supabaseAdmin
			.from('bookings')
			.select('*')
			.eq('stripe_session_id', sessionId)
			.single();

		if (bookingError) throw bookingError;

		// Get the price for this experience_id (children are free)
		const { data: locationData, error: locationError } = await supabaseAdmin
			.from('start_locations')
			.select('price')
			.eq('experience_id', booking.experience_id)
			.limit(1)
			.single();

		console.log('Price lookup:', {
			experience_id: booking.experience_id,
			locationData,
			locationError
		});

		const adultPrice = locationData?.price || 0;
		const adultPriceExclVat = adultPrice / 1.25;

		// Calculate totals
		const totalAdultsExclVat = booking.number_of_adults * adultPriceExclVat;
		const totalChildren = 0; // Children are free
		const subtotal = totalAdultsExclVat; // Only count adults, excluding VAT
		const vat = subtotal * 0.25;
		const total = subtotal + vat; // This will equal adultPrice * number_of_adults

		return {
			booking: {
				...booking,
				adultPrice,
				adultPriceExclVat,
				childPrice: 0, // Children are free
				totalAdultsExclVat,
				totalChildren, // Will be 0
				subtotal,
				vat,
				total
			}
		};
	} catch (error) {
		console.error('Error fetching booking:', error);
		throw redirect(303, '/');
	}
};
