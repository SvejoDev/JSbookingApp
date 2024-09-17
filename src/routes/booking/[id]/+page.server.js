import { supabase } from '$lib/supabaseClient.js';

export async function load({ params }) {
	// Hämta den specifika upplevelsen baserat på ID från URL:en
	const { data: experience, error: experienceError } = await supabase
		.from('experiences')
		.select('*')
		.eq('id', params.id)
		.single();

	if (experienceError) {
		console.error('Error fetching experience:', experienceError);
	}

	const { data: experienceAddons, error: eaError } = await supabase
		.from('experience_addons')
		.select('experience_id,addon_id,addons(*)')
		.eq('experience_id', params.id);

	if (eaError) {
		console.error('Error fetching experience addons:', eaError);
	}

	const addons = experienceAddons.map((ea) => ea.addons);

	const { data: startLocations, error: startLocationsError } = await supabase
		.from('start_locations')
		.select('id, location, "price"')
		.eq('experience_id', params.id);

	if (startLocationsError) {
		console.error('Error fetching start locations:', startLocationsError);
	}

	const { data: bookingLengths, error: bLerror } = await supabase
		.from('booking_lengths')
		.select('*')
		.eq('experience_id', params.id);

	// Hämta blockerade datum från Supabase
	const { data: blockedDates, error: blockedDatesError } = await supabase
		.from('blocked_dates')
		.select('blocked_date')
		.eq('experience_id', params.id);

	if (blockedDatesError) {
		console.error('Error fetching blocked dates:', blockedDatesError);
	}
	console.log(blockedDates);

	return {
		experience,
		addons,
		startLocations,
		bookingLengths,
		blocked_dates: blockedDates
	};
}
