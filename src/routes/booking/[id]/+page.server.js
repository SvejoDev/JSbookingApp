import { supabase } from '$lib/supabaseClient.js';

export async function load({ params }) {
	// Hämta den specifika upplevelsen baserat på ID från URL:en
	const { data: experience, error: experienceError } = await supabase
		.from('experiences')
		.select('*')
		.eq('id', params.id)
		.single(); // Eftersom vi bara vill ha ett enda resultat

	if (experienceError) {
		console.error('Error fetching experience:', experienceError);
	}
	const { data: addons, error: addonsError } = await supabase
		.from('addons')
		.select('*')
		.eq('experience_id', params.id);

	if (addonsError) {
		console.error('Error fetching addins:', addonsError);
	}

	return {
		experience: experience ?? null,
		addons: addons ?? [] // Skicka tillvalen eller en tom array om inget hittas
	};
}
