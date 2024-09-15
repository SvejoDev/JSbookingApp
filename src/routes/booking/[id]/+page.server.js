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
	console.log(experienceAddons);
	const addons = experienceAddons.map((ea) => ea.addons);

	return {
		experience: experience ?? null,
		addons: addons ?? []
	};
}
