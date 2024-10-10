import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient.js';

export async function POST({ request }) {
	try {
		const { experienceId, date, bookingLength, selectedEquipment } = await request.json();

		const availableStartTimes = await checkAvailability(
			supabase,
			experienceId,
			date,
			bookingLength,
			selectedEquipment
		);

		return json({ availableStartTimes });
	} catch (error) {
		console.error('Server error:', error);
		return json({ error: error.message }, { status: 500 });
	}
}

async function checkAvailability(supabase, experienceId, date, bookingLength, selectedEquipment) {
	console.log('Checking availability with:', {
		experienceId,
		date,
		bookingLength,
		selectedEquipment
	});

	// Fetch total equipment available for this experience
	const { data: experienceAddons, error: addonsError } = await supabase
		.from('experience_addons')
		.select(
			`
            addon_id,
            addons (
                id,
                name,
                max_quantity
            )
        `
		)
		.eq('experience_id', experienceId);

	if (addonsError) {
		console.error('Error fetching equipment:', addonsError);
		throw new Error('Error fetching equipment data');
	}

	// Create an object to store the total equipment
	const totalEquipment = {
		canoes: 0,
		kayaks: 0,
		sups: 0
	};

	// Map the addon names to the equipment types
	experienceAddons.forEach((addon) => {
		if (addon.addons.name.toLowerCase().includes('kanot')) {
			totalEquipment.canoes = addon.addons.max_quantity;
		} else if (addon.addons.name.toLowerCase().includes('kajak')) {
			totalEquipment.kayaks = addon.addons.max_quantity;
		} else if (addon.addons.name.toLowerCase().includes('sup')) {
			totalEquipment.sups = addon.addons.max_quantity;
		}
	});

	console.log('Total equipment:', totalEquipment);

	// Fetch all bookings for the selected date
	const { data: bookings, error: bookingsError } = await supabase
		.from('bookings')
		.select('*')
		.eq('experience_id', experienceId)
		.eq('start_date', date);

	if (bookingsError) {
		console.error('Error fetching bookings:', bookingsError);
		throw new Error('Error fetching bookings data');
	}

	// Fetch opening hours for the experience
	const { data: openHours, error: openHoursError } = await supabase
		.from('experience_open_dates')
		.select('open_time, close_time')
		.eq('experience_id', experienceId)
		.single();

	if (openHoursError) {
		console.error('Error fetching open hours:', openHoursError);
		throw new Error('Error fetching open hours data');
	}

	// Generate all possible start times
	const startTimes = [];
	let currentTime = new Date(`${date}T${openHours.open_time}`);
	const closeTime = new Date(`${date}T${openHours.close_time}`);
	while (currentTime <= closeTime) {
		startTimes.push(currentTime.toTimeString().slice(0, 5));
		currentTime.setMinutes(currentTime.getMinutes() + 30);
	}

	// Check availability for each start time
	const availableStartTimes = startTimes.filter((startTime) => {
		const bookingStart = new Date(`${date}T${startTime}`);
		let bookingEnd;

		if (bookingLength.includes('övernattning')) {
			const nights = parseInt(bookingLength.split(' ')[0]);
			bookingEnd = new Date(closeTime);
			bookingEnd.setDate(bookingEnd.getDate() + nights);
		} else if (bookingLength === 'Hela dagen') {
			bookingEnd = new Date(closeTime);
		} else {
			const hours = parseInt(bookingLength);
			bookingEnd = new Date(bookingStart.getTime() + hours * 60 * 60 * 1000);
		}

		// Check if the booking end time exceeds closing time
		if (bookingEnd > closeTime && !bookingLength.includes('övernattning')) {
			return false;
		}

		// Check availability against existing bookings
		let availableCanoes = totalEquipment.canoes;
		let availableKayaks = totalEquipment.kayaks;
		let availableSups = totalEquipment.sups;

		for (const booking of bookings) {
			const bookingStartTime = new Date(`${booking.start_date}T${booking.start_time}`);
			const bookingEndTime = new Date(`${booking.end_date}T${booking.end_time}`);

			if (
				(bookingStart >= bookingStartTime && bookingStart < bookingEndTime) ||
				(bookingEnd > bookingStartTime && bookingEnd <= bookingEndTime) ||
				(bookingStart <= bookingStartTime && bookingEnd >= bookingEndTime)
			) {
				availableCanoes -= booking.amount_canoes;
				availableKayaks -= booking.amount_kayak;
				availableSups -= booking.amount_sup;
			}
		}

		return (
			availableCanoes >= selectedEquipment.canoes &&
			availableKayaks >= selectedEquipment.kayaks &&
			availableSups >= selectedEquipment.sups
		);
	});

	return availableStartTimes;
}
