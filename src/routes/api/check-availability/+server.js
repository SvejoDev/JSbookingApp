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

	// Calculate total booked equipment for the day
	let totalBookedCanoes = 0;
	let totalBookedKayaks = 0;
	let totalBookedSups = 0;

	bookings.forEach((booking) => {
		totalBookedCanoes += booking.amount_canoes;
		totalBookedKayaks += booking.amount_kayak;
		totalBookedSups += booking.amount_sup;
	});

	// Check if there's enough equipment available for the whole day
	if (
		totalBookedCanoes + selectedEquipment.canoes > totalEquipment.canoes ||
		totalBookedKayaks + selectedEquipment.kayaks > totalEquipment.kayaks ||
		totalBookedSups + selectedEquipment.sups > totalEquipment.sups
	) {
		return []; // No available times if there's not enough equipment
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

		// Check for time conflicts with existing bookings
		for (const booking of bookings) {
			const bookingStartTime = new Date(`${booking.start_date}T${booking.start_time}`);
			const bookingEndTime = new Date(`${booking.end_date}T${booking.end_time}`);

			if (
				(bookingStart >= bookingStartTime && bookingStart < bookingEndTime) ||
				(bookingEnd > bookingStartTime && bookingEnd <= bookingEndTime) ||
				(bookingStart <= bookingStartTime && bookingEnd >= bookingEndTime)
			) {
				return false; // Time conflict, this start time is not available
			}
		}

		return true; // This start time is available
	});

	return availableStartTimes;
}
