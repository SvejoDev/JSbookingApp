import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient.js';

export async function POST({ request }) {
	const { experienceId, date, bookingLength, selectedEquipment } = await request.json();

	try {
		const availableStartTimes = await checkAvailability(
			supabase,
			experienceId,
			date,
			bookingLength,
			selectedEquipment
		);
		return json({ availableStartTimes });
	} catch (error) {
		console.error('Error checking availability:', error);
		return json({ error: 'Error checking availability' }, { status: 500 });
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

	const totalEquipment = {
		canoes: 0,
		kayaks: 0,
		sups: 0
	};

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

	console.log('Fetching bookings for date:', date);
	const { data: bookings, error: bookingsError } = await supabase
		.from('bookings')
		.select('*')
		.eq('experience_id', experienceId)
		.or(`start_date.eq.${date},end_date.eq.${date}`)
		.or(`and(start_date.lt.${date},end_date.gt.${date})`);

	if (bookingsError) {
		console.error('Error fetching bookings:', bookingsError);
		throw new Error('Error fetching bookings data');
	}

	console.log('Fetched bookings:', JSON.stringify(bookings, null, 2));
	console.log('Query parameters:', { experienceId, date });
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

	console.log('Open hours:', openHours);

	// Parse booking length
	let bookingDurationHours;
	if (bookingLength.includes('övernattning')) {
		bookingDurationHours = 24 * parseInt(bookingLength.split(' ')[0]);
	} else if (bookingLength === 'Hela dagen') {
		bookingDurationHours = 24;
	} else {
		bookingDurationHours = parseInt(bookingLength);
	}

	console.log('Booking duration in hours:', bookingDurationHours);

	// Generate all possible start times
	const startTimes = [];
	let currentTime = new Date(`${date}T${openHours.open_time}`);
	const closeTime = new Date(`${date}T${openHours.close_time}`);
	while (currentTime <= closeTime) {
		startTimes.push(currentTime.toTimeString().slice(0, 5));
		currentTime.setMinutes(currentTime.getMinutes() + 30);
	}

	console.log('All possible start times:', startTimes);

	// Check availability for each start time
	const availableStartTimes = startTimes.filter((startTime) => {
		const bookingStart = new Date(`${date}T${startTime}`);
		const bookingEnd = new Date(bookingStart.getTime() + bookingDurationHours * 60 * 60 * 1000);

		console.log(`Checking availability for start time: ${startTime}`);

		// Check if the booking end time exceeds closing time
		if (bookingEnd > closeTime && !bookingLength.includes('övernattning')) {
			console.log(`${startTime} is unavailable due to exceeding closing time`);
			return false;
		}

		// Check for overlap with existing bookings
		for (const booking of bookings) {
			const existingBookingStart = new Date(`${booking.start_date}T${booking.start_time}`);
			const existingBookingEnd = new Date(`${booking.end_date}T${booking.end_time}`);

			console.log(`Comparing with existing booking: ${booking.start_time} - ${booking.end_time}`);

			if (
				(bookingStart < existingBookingEnd && bookingEnd > existingBookingStart) ||
				(bookingStart >= existingBookingStart && bookingStart < existingBookingEnd) ||
				(bookingEnd > existingBookingStart && bookingEnd <= existingBookingEnd)
			) {
				console.log(`Overlap detected with booking: ${booking.id}`);
				// There's an overlap, check if there's enough equipment
				const availableCanoes = totalEquipment.canoes - booking.amount_canoes;
				const availableKayaks = totalEquipment.kayaks - booking.amount_kayak;
				const availableSUPs = totalEquipment.sups - booking.amount_sup;

				console.log(
					`Available equipment after considering overlap: Canoes: ${availableCanoes}, Kayaks: ${availableKayaks}, SUPs: ${availableSUPs}`
				);

				if (
					availableCanoes < selectedEquipment.canoes ||
					availableKayaks < selectedEquipment.kayaks ||
					availableSUPs < selectedEquipment.sups
				) {
					console.log(`Not enough equipment available for ${startTime}`);
					return false; // Not enough equipment available
				}
			}
		}

		console.log(`${startTime} is available`);
		return true; // This start time is available
	});

	console.log('Final available start times:', availableStartTimes);
	return availableStartTimes;
}
