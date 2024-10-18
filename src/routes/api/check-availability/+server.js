// I din server-fil (t.ex. api/index.js eller liknande)
import { createClient } from '@supabase/supabase-js';

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '$env/static/private';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

app.post('/api/check-availability', async (req, res) => {
	const { date, bookingLength, canoes, kayaks, sups } = req.body;

	try {
		// Konvertera bookingLength till ett intervall
		let duration;
		if (bookingLength.includes('h')) {
			duration = `${parseInt(bookingLength)}:00:00`;
		} else if (bookingLength === 'Hela dagen') {
			duration = '12:00:00'; // Anta att hela dagen är 12 timmar
		} else {
			// Hantera övernattningsbokningar
			duration = `${24 * parseInt(bookingLength.split(' ')[0])}:00:00`;
		}

		const { data, error } = await supabase.rpc('get_available_start_times', {
			check_date: date,
			duration: duration,
			canoes_needed: canoes,
			kayaks_needed: kayaks,
			sups_needed: sups
		});

		if (error) throw error;

		res.json({ availableStartTimes: data.map((row) => row.available_start_time) });
	} catch (error) {
		console.error('Error checking availability:', error);
		res.status(500).json({ error: 'An error occurred while checking availability' });
	}
});
