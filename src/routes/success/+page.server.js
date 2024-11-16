import { redirect } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabaseAdmin';

export const load = async ({ url }) => {
	const sessionId = url.searchParams.get('session_id');

	if (!sessionId) {
		throw redirect(303, '/');
	}

	try {
		const { data: booking, error } = await supabaseAdmin
			.from('bookings')
			.select('*')
			.eq('stripe_session_id', sessionId)
			.single();

		if (error) throw error;

		return {
			booking
		};
	} catch (error) {
		console.error('Error fetching booking:', error);
		throw redirect(303, '/');
	}
};
