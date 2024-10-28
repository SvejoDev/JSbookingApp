import { supabase } from '$lib/supabaseClient.js';

export async function load({ params }) {
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

	const { data: startLocations, error: startLocationsError } = await supabase
		.from('start_locations')
		.select('id, location, price')
		.eq('experience_id', params.id);

	if (startLocationsError) {
		console.error('Error fetching start locations:', startLocationsError);
	}

	const { data: bookingLengths, error: bLerror } = await supabase
		.from('booking_lengths')
		.select('*');
	console.log(bookingLengths);

	if (bLerror) {
		console.error('Error fetching bookingLength', bLerror);
	}

	const { data: openHours, error: openHoursError } = await supabase
		.from('experience_open_dates')
		.select('start_date, end_date, open_time, close_time')
		.eq('experience_id', params.id)
		.single();

	if (openHoursError) {
		console.error('Error fetching open dates', openHoursError);
	}

	const { data: blockedDates, error: blockedDatesError } = await supabase
		.from('blocked_dates')
		.select('blocked_date')
		.eq('experience_id', params.id);

	if (blockedDatesError) {
		console.error('Error fetching blocked dates:', blockedDatesError);
	}

	const { data: blockedStartTimes, error: blockedStartTimesError } = await supabase
		.from('blocked_start_times')
		.select('blocked_date, blocked_time')
		.eq('experience_id', params.id);

	if (blockedStartTimesError) {
		console.error('Error fetching blocked start times:', blockedStartTimesError);
	}

	return {
		experience,
		experienceAddons,
		startLocations,
		bookingLengths,
		blocked_dates: blockedDates || [],
		blocked_start_times: blockedStartTimes || [],
		openHours
	};
}
