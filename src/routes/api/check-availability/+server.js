import { json } from '@sveltejs/kit';
import { query } from '$lib/db.js';

export async function POST({ request }) {
	try {
		const { date, bookingLength, addons, experienceId } = await request.json();

		console.log('Received booking request:', { date, bookingLength, addons, experienceId });

		// Get experience opening hours and addon data
		const {
			rows: [openDateData]
		} = await query('SELECT * FROM experience_open_dates WHERE experience_id = $1', [experienceId]);

		if (!openDateData) {
			console.error('Could not fetch opening hours');
			return json({ error: 'Could not fetch opening hours for the experience' }, { status: 500 });
		}

		// Validate date is within allowed range
		const selectedDate = new Date(date);
		const startDate = new Date(openDateData.start_date);
		const endDate = new Date(openDateData.end_date);

		if (selectedDate < startDate || selectedDate > endDate) {
			return json({
				error: 'Selected date is outside the season',
				availableStartTimes: []
			});
		}

		// Calculate duration and number of nights
		let durationHours;
		let numberOfNights;

		if (bookingLength.includes('h')) {
			durationHours = parseInt(bookingLength);
			numberOfNights = 0;
		} else if (bookingLength === 'Hela dagen') {
			durationHours = getHoursInDay(openDateData.open_time, openDateData.close_time);
			numberOfNights = 0;
		} else {
			// För övernattningar är formatet t.ex. "1 natt", "2 nätter" etc.
			numberOfNights = parseInt(bookingLength);
			durationHours = numberOfNights * 24;
		}

		console.log('Calculated duration:', { durationHours, numberOfNights });

		// Get all available addons from database
		const { rows: addonsList } = await query(`
			SELECT id, name, max_quantity, availability_table_name, column_name 
			FROM addons
		`);

		// Generate possible start times
		const availableStartTimes = await checkAvailability({
			date,
			durationHours,
			numberOfNights,
			addons,
			addonsList,
			openTime: openDateData.open_time,
			closeTime: openDateData.close_time
		});

		return json({ availableStartTimes });
	} catch (error) {
		console.error('Error checking availability:', error);
		return json({ error: error.message }, { status: 500 });
	}
}

function getHoursInDay(openTime, closeTime) {
	const [openHours, openMinutes] = openTime.split(':').map(Number);
	const [closeHours, closeMinutes] = closeTime.split(':').map(Number);
	const totalOpenMinutes = closeHours * 60 + closeMinutes - (openHours * 60 + openMinutes);
	return Math.floor(totalOpenMinutes / 60);
}

function filterPastTimes(times, bookingDate) {
	const currentDateTime = new Date();
	const today = currentDateTime.toISOString().split('T')[0];

	if (bookingDate !== today) {
		return times;
	}

	const currentHours = currentDateTime.getHours();
	const currentMinutes = currentDateTime.getMinutes();

	return times.filter((time) => {
		const [hours, minutes] = time.split(':').map(Number);
		return hours > currentHours || (hours === currentHours && minutes >= currentMinutes);
	});
}

function generateTimeSlots(openTime, closeTime, durationHours = 0) {
	const times = [];
	let currentTime = new Date(`1970-01-01T${openTime}`);
	const endTime = new Date(`1970-01-01T${closeTime}`);

	// för enkeldagsbokningar, beräkna sista möjliga starttid baserat på bokningslängd
	if (durationHours > 0) {
		const lastPossibleStart = new Date(endTime);
		lastPossibleStart.setHours(lastPossibleStart.getHours() - Math.floor(durationHours));
		lastPossibleStart.setMinutes(lastPossibleStart.getMinutes() - (durationHours % 1) * 60);
		endTime.setTime(lastPossibleStart.getTime());
	}

	while (currentTime <= endTime) {
		times.push(currentTime.toTimeString().slice(0, 5));
		currentTime.setMinutes(currentTime.getMinutes() + 30);
	}

	return times;
}

function timeToMinutes(timeStr) {
	const [hours, minutes] = timeStr.split(':').map(Number);
	return hours * 60 + minutes;
}

function getDateString(date, addDays = 0) {
	const newDate = new Date(date);
	newDate.setDate(newDate.getDate() + addDays);
	return newDate.toISOString().split('T')[0];
}

async function checkAvailability({
	date,
	durationHours,
	numberOfNights,
	addons,
	addonsList,
	openTime,
	closeTime
}) {
	// generera alla möjliga 30-minuters starttider
	// skicka med durationHours endast för enkeldagsbokningar
	const possibleTimes = generateTimeSlots(
		openTime,
		closeTime,
		numberOfNights === 0 ? durationHours : 0
	);
	const validStartTimes = filterPastTimes(possibleTimes, date);

	if (validStartTimes.length === 0) {
		return [];
	}

	const availableTimes = [];

	// Convert times to minute indices for database queries
	const openTimeMinutes = timeToMinutes(openTime);
	const closeTimeMinutes = timeToMinutes(closeTime);

	// Process each potential start time
	for (const startTime of validStartTimes) {
		let isTimeAvailable = true;
		console.log(`\nChecking availability for start time: ${startTime}`);

		// Check each requested addon
		for (const addon of addonsList) {
			const addonKey = `amount${addon.name.replace(/\s+/g, '')}s`;
			const requestedAmount = addons[addonKey] || 0;

			if (requestedAmount > 0) {
				const isAvailable = await checkAddonAvailability({
					addonId: addon.id,
					amount: requestedAmount,
					maxQuantity: addon.max_quantity,
					startDate: date,
					startTime,
					numberOfNights,
					durationHours,
					openTime,
					closeTime
				});

				if (!isAvailable) {
					isTimeAvailable = false;
					break;
				}
			}
		}

		if (isTimeAvailable) {
			console.log(`Time ${startTime} is AVAILABLE for booking`);
			availableTimes.push(startTime);
		} else {
			console.log(`Time ${startTime} is NOT available for booking`);
		}
	}

	return availableTimes;
}

async function checkAddonAvailability({
	addonId,
	amount,
	maxQuantity,
	startDate,
	startTime,
	numberOfNights,
	durationHours,
	openTime,
	closeTime
}) {
	const {
		rows: [addon]
	} = await query('SELECT availability_table_name FROM addons WHERE id = $1', [addonId]);

	if (!addon) {
		throw new Error(`Addon with id ${addonId} not found`);
	}

	console.log(`\nChecking availability for ${addon.name} (${amount} requested)`);
	console.log('Checking dates from', startDate, 'for', numberOfNights, 'nights');

	const startTimeMinutes = timeToMinutes(startTime);
	const dates = Array.from({ length: numberOfNights + 1 }, (_, i) => getDateString(startDate, i));

	console.log('Checking dates:', dates);

	// Check availability for each affected date
	for (const [index, currentDate] of dates.entries()) {
		const isFirstDay = index === 0;
		const isLastDay = index === dates.length - 1;

		const dayStartMinutes = isFirstDay ? startTimeMinutes : timeToMinutes(openTime);
		const dayEndMinutes =
			isLastDay && numberOfNights === 0
				? startTimeMinutes + durationHours * 60
				: timeToMinutes(closeTime);

		// Get availability data for current date using the correct table name
		const {
			rows: [availabilityData]
		} = await query(`SELECT * FROM ${addon.availability_table_name} WHERE date = $1`, [
			currentDate
		]);

		if (availabilityData) {
			for (let minutes = dayStartMinutes; minutes <= dayEndMinutes; minutes += 15) {
				const slotIndex = Math.floor(minutes / 15).toString();
				const bookedAmount = Math.abs(availabilityData[slotIndex] || 0);
				const availableSlots = maxQuantity - bookedAmount;

				if (amount > availableSlots) {
					console.log(
						`Cannot book: Insufficient capacity at ${currentDate} ${Math.floor(minutes / 60)}:${(minutes % 60).toString().padStart(2, '0')}`
					);
					return false;
				}
			}
		}
	}

	return true;
}
