import { json } from '@sveltejs/kit';
import { query } from '$lib/db.js';

export async function POST({ request }) {
	try {
		const { date, bookingLength, addons, experienceId } = await request.json();

		console.log('Received booking request:', { date, bookingLength, addons, experienceId });

		// Get all available time slots for the specific date
		const { rows: specificTimeSlots } = await query(
			`SELECT open_time, close_time 
             FROM experience_available_dates 
             WHERE experience_id = $1 
             AND available_date = $2
             ORDER BY open_time`,
			[experienceId, date]
		);

		// If no specific time slots found, check period-based dates
		let availableTimeSlots = [];
		if (specificTimeSlots.length > 0) {
			availableTimeSlots = specificTimeSlots;
		} else {
			const { rows: periodData } = await query(
				'SELECT open_time, close_time FROM experience_open_dates WHERE experience_id = $1',
				[experienceId]
			);

			if (periodData.length > 0) {
				availableTimeSlots = periodData;
			}
		}

		if (availableTimeSlots.length === 0) {
			return json({
				error: 'No available time slots found for this date',
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
			// Use the full span of the first available time slot
			durationHours = getHoursInDay(
				availableTimeSlots[0].open_time,
				availableTimeSlots[0].close_time
			);
			numberOfNights = 0;
		} else {
			numberOfNights = parseInt(bookingLength);
			durationHours = numberOfNights * 24;
		}

		// Get all available addons from database
		const { rows: addonsList } = await query(`
            SELECT id, name, max_quantity, availability_table_name, column_name 
            FROM addons
        `);

		// Generate available times for each time slot
		let allAvailableTimes = [];
		for (const slot of availableTimeSlots) {
			const timesForSlot = generateTimeSlots(
				slot.open_time,
				slot.close_time,
				numberOfNights === 0 ? durationHours : 0
			);
			allAvailableTimes = [...allAvailableTimes, ...timesForSlot];
		}

		// Sort and remove duplicates
		allAvailableTimes = [...new Set(allAvailableTimes)].sort();

		// Filter times considering foresight
		const availableTimes = await filterPastTimes(allAvailableTimes, date, experienceId);

		if (availableTimes.length === 0) {
			return json({
				error: 'No available times found for this date due to booking foresight requirements',
				availableStartTimes: []
			});
		}

		return json({ availableStartTimes: availableTimes });
	} catch (error) {
		console.error('Error checking availability:', error);
		return json({ error: 'Internal server error', availableStartTimes: [] });
	}
}

function getHoursInDay(openTime, closeTime) {
	const [openHours, openMinutes] = openTime.split(':').map(Number);
	const [closeHours, closeMinutes] = closeTime.split(':').map(Number);
	const totalOpenMinutes = closeHours * 60 + closeMinutes - (openHours * 60 + openMinutes);
	return Math.floor(totalOpenMinutes / 60);
}

async function filterPastTimes(times, bookingDate, experienceId) {
	const {
		rows: [experience]
	} = await query('SELECT booking_foresight_hours FROM experiences WHERE id = $1', [experienceId]);

	const foresightHours = experience?.booking_foresight_hours || 0;

	// Calculate the earliest possible booking time
	const currentDateTime = new Date();
	const earliestPossibleTime = new Date(
		currentDateTime.getTime() + foresightHours * 60 * 60 * 1000
	);
	const bookingDateTime = new Date(bookingDate);

	// Convert times to minutes for precise comparison
	const earliestMinutesSinceMidnight =
		earliestPossibleTime.getHours() * 60 + earliestPossibleTime.getMinutes();

	return times.filter((time) => {
		const [hours, minutes] = time.split(':').map(Number);
		const timeInMinutes = hours * 60 + minutes;

		// Compare full dates (year, month, day)
		const bookingTime = new Date(bookingDateTime);
		bookingTime.setHours(hours, minutes, 0, 0);

		// If booking time is after earliest possible time, include it
		if (bookingTime > earliestPossibleTime) {
			return true;
		}

		// For same day bookings, compare minutes
		if (bookingTime.toDateString() === earliestPossibleTime.toDateString()) {
			return timeInMinutes >= earliestMinutesSinceMidnight;
		}

		return false;
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
	console.log('\n=== Starting Availability Check ===');
	console.log('Requested addons:', addons);

	// Filter addonsList to only include requested addons
	const requestedAddons = addonsList.filter((addon) => addons[addon.column_name] > 0);
	console.log(
		'Checking only these addons:',
		requestedAddons.map((a) => a.name)
	);

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

	// Process each potential start time
	for (const startTime of validStartTimes) {
		let isTimeAvailable = true;
		console.log(`\n--- Checking start time: ${startTime} ---`);

		// Only check requested addons
		for (const addon of requestedAddons) {
			const requestedAmount = addons[addon.column_name];
			console.log(`\nChecking ${addon.name} (${addon.column_name})`);
			console.log(`Requested amount: ${requestedAmount}`);
			console.log(`Max quantity: ${addon.max_quantity}`);

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

			console.log(
				`${addon.name} availability result: ${isAvailable ? 'AVAILABLE' : 'NOT AVAILABLE'}`
			);

			if (!isAvailable) {
				isTimeAvailable = false;
				console.log(`Time ${startTime} is blocked due to ${addon.name} unavailability`);
				break;
			}
		}

		if (isTimeAvailable) {
			console.log(`\n✅ Time ${startTime} is AVAILABLE for booking (all addons available)`);
			availableTimes.push(startTime);
		} else {
			console.log(`\n❌ Time ${startTime} is NOT available for booking`);
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
	// hämta information om tillägget (addon) från databasen
	const {
		rows: [addon]
	} = await query('SELECT availability_table_name, name FROM addons WHERE id = $1', [addonId]);

	if (!addon) {
		throw new Error(`Addon with id ${addonId} not found`);
	}

	console.log(`\nChecking availability for ${addon.name} (${amount} requested)`);
	console.log('Checking dates from', startDate, 'for', numberOfNights, 'nights');

	// skapa en array med alla datum som ska kontrolleras
	const dates = Array.from({ length: numberOfNights + 1 }, (_, i) => getDateString(startDate, i));
	console.log('Checking dates:', dates);

	// kontrollera tillgänglighet för varje datum
	for (const [index, currentDate] of dates.entries()) {
		// bestäm vilken typ av dag det är (första, mellan eller sista dagen)
		const isFirstDay = index === 0;
		const isLastDay = index === dates.length - 1;
		const isMiddleDay = !isFirstDay && !isLastDay;

		console.log(`\nProcessing date: ${currentDate}`);
		console.log(`Day type: ${isFirstDay ? 'First day' : isMiddleDay ? 'Middle day' : 'Last day'}`);

		let dayStartMinutes, dayEndMinutes;

		// sätt start- och sluttider baserat på bokningstyp (övernattning eller dagsbokning)
		if (numberOfNights > 0) {
			// logik för övernattningsbokningar
			if (isFirstDay) {
				// första dagen: från starttid till midnatt
				dayStartMinutes = timeToMinutes(startTime);
				dayEndMinutes = timeToMinutes('23:59');
			} else if (isMiddleDay) {
				// mellandagar: hela dagen
				dayStartMinutes = timeToMinutes('00:00');
				dayEndMinutes = timeToMinutes('23:59');
			} else if (isLastDay) {
				// sista dagen: från midnatt till sluttid
				dayStartMinutes = timeToMinutes('00:00');
				dayEndMinutes = timeToMinutes(closeTime);
			}
		} else {
			// logik för dagsbokningar
			dayStartMinutes = timeToMinutes(startTime);
			dayEndMinutes = dayStartMinutes + durationHours * 60;
		}

		console.log(
			`Checking time range: ${Math.floor(dayStartMinutes / 60)}:${(dayStartMinutes % 60).toString().padStart(2, '0')} to ${Math.floor(dayEndMinutes / 60)}:${(dayEndMinutes % 60).toString().padStart(2, '0')}`
		);

		// hämta tillgänglighetsdata från databasen för aktuellt datum
		const {
			rows: [availabilityData]
		} = await query(`SELECT * FROM ${addon.availability_table_name} WHERE date = $1`, [
			currentDate
		]);

		if (availabilityData) {
			// kontrollera varje 15-minuters intervall
			for (let minutes = dayStartMinutes; minutes < dayEndMinutes; minutes += 15) {
				// beräkna kolumnnamnet i databasen (varje kolumn representerar en 15-minuters period)
				const columnName = (Math.floor(minutes / 15) * 15).toString();
				// hämta antalet bokade enheter (negativt tal i databasen)
				const bookedAmount = parseInt(availabilityData[columnName] || '0');
				// beräkna tillgängliga platser (maxQuantity + bookedAmount eftersom bookedAmount är negativt)
				const availableSlots = maxQuantity + bookedAmount;

				console.log(
					`Checking ${currentDate} at ${Math.floor(minutes / 60)}:${(minutes % 60).toString().padStart(2, '0')} - Column: "${columnName}", Booked: ${bookedAmount}, Available: ${availableSlots}`
				);

				// om det begärda antalet är större än tillgängliga platser, returnera false
				if (amount > availableSlots) {
					console.log(
						`Cannot book: Insufficient capacity at ${currentDate} ${Math.floor(minutes / 60)}:${(minutes % 60).toString().padStart(2, '0')}. ` +
							`Available: ${availableSlots}, Requested: ${amount}`
					);
					return false;
				}
			}
		}
	}

	// om vi kommer hit finns tillräckligt med tillgängliga platser för hela bokningen
	return true;
}
