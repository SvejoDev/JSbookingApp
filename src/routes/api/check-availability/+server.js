import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient.js';

export async function POST({ request }) {
	try {
		const { date, bookingLength, addons } = await request.json();

		// Convert hours from bookingLength string to number
		const durationHours = bookingLength.includes('h')
			? parseInt(bookingLength)
			: bookingLength === 'Hela dagen'
				? 7 // 10:00 to 17:00
				: 24; // Overnight booking

		const availableStartTimes = await checkAvailability(date, durationHours, addons);
		return json({ availableStartTimes });
	} catch (error) {
		console.error('Error checking availability:', error);
		return json({ error: error.message }, { status: 500 });
	}
}

async function checkAvailability(date, durationHours, addons) {
	// Start with all possible 30-minute slots between opening and closing
	const openTime = '10:00';
	const closeTime = '17:00';
	const possibleTimes = [];
	let currentTime = new Date(`${date}T${openTime}`);
	const endTime = new Date(`${date}T${closeTime}`);

	// Generate possible start times at 30-minute intervals
	while (currentTime < endTime) {
		possibleTimes.push(currentTime.toTimeString().slice(0, 5));
		currentTime.setMinutes(currentTime.getMinutes() + 30);
	}

	// Check each addon type if requested
	const availableTimes = [];
	for (const time of possibleTimes) {
		let isTimeAvailable = true;

		// Convert time to interval index (0-95)
		const timeToIndex = (timeStr) => {
			const [hours, minutes] = timeStr.split(':').map(Number);
			return hours * 4 + Math.floor(minutes / 15);
		};

		const startIndex = timeToIndex(time);
		const intervalsNeeded = durationHours * 4; // 4 fifteen-minute intervals per hour

		// Check canoes if requested
		if (addons.amountCanoes > 0) {
			const { data: canoeAvail } = await supabase
				.from('canoe_availability')
				.select('*')
				.eq('date', date)
				.single();

			if (canoeAvail) {
				// Check each 15-minute interval
				for (let i = 0; i < intervalsNeeded; i++) {
					const columnName = (startIndex + i).toString();
					const booked = Math.abs(canoeAvail[columnName] || 0);
					if (booked + addons.amountCanoes > 5) {
						// 5 is max from addons table
						isTimeAvailable = false;
						break;
					}
				}
			}
		}

		// Check kayaks if requested
		if (isTimeAvailable && addons.amountKayaks > 0) {
			const { data: kayakAvail } = await supabase
				.from('kayak_availability')
				.select('*')
				.eq('date', date)
				.single();

			if (kayakAvail) {
				for (let i = 0; i < intervalsNeeded; i++) {
					const columnName = (startIndex + i).toString();
					const booked = Math.abs(kayakAvail[columnName] || 0);
					if (booked + addons.amountKayaks > 2) {
						// 2 is max from addons table
						isTimeAvailable = false;
						break;
					}
				}
			}
		}

		// Check SUPs if requested
		if (isTimeAvailable && addons.amountSUPs > 0) {
			const { data: supAvail } = await supabase
				.from('sup_availability')
				.select('*')
				.eq('date', date)
				.single();

			if (supAvail) {
				for (let i = 0; i < intervalsNeeded; i++) {
					const columnName = (startIndex + i).toString();
					const booked = Math.abs(supAvail[columnName] || 0);
					if (booked + addons.amountSUPs > 2) {
						// 2 is max from addons table
						isTimeAvailable = false;
						break;
					}
				}
			}
		}

		if (isTimeAvailable) {
			availableTimes.push(time);
		}
	}

	return availableTimes;
}
