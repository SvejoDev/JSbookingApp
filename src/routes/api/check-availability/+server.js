import { json } from '@sveltejs/kit';
import { query } from '$lib/db.js';

export async function POST({ request }) {
	try {
		const { date, bookingLength, addons, experienceId } = await request.json();
		// Get experience data
		const {
			rows: [experience]
		} = await query('SELECT * FROM experiences WHERE id = $1', [experienceId]);

		// Get addons data
		const { rows: addonsList } = await query(
			`
			SELECT addons.* 
			FROM addons 
			JOIN experience_addons ON addons.id = experience_addons.addon_id 
			WHERE experience_addons.experience_id = $1`,
			[experienceId]
		);

		// Parse booking length
		const { durationHours, numberOfNights } = parseBookingLength(bookingLength);

		// Get time slots from experience_available_dates or experience_open_dates
		const { rows: specificTimeSlots } = await query(
			`SELECT open_time, close_time 
			 FROM experience_available_dates 
			 WHERE experience_id = $1 
			 AND available_date = $2`,
			[experienceId, date]
		);

		let openTime, closeTime;

		if (specificTimeSlots.length > 0) {
			// Use specific time slots if available
			openTime = specificTimeSlots[0].open_time;
			closeTime = specificTimeSlots[0].close_time;
		} else {
			// Otherwise use default period times
			const {
				rows: [periodTimes]
			} = await query(
				'SELECT open_time, close_time FROM experience_open_dates WHERE experience_id = $1',
				[experienceId]
			);

			if (!periodTimes) {
				return json({ error: 'No available time slots found', availableStartTimes: [] });
			}

			openTime = periodTimes.open_time;
			closeTime = periodTimes.close_time;
		}

		// Check availability
		const availableTimes = await checkAvailability({
			date,
			durationHours,
			numberOfNights,
			addons,
			addonsList,
			openTime,
			closeTime,
			experienceId
		});

		return json({ availableStartTimes: availableTimes });
	} catch (error) {
		return json({ error: 'Internal server error', availableStartTimes: [] });
	}
}

function parseBookingLength(bookingLength) {
	if (bookingLength === 'Hela dagen') {
		return { durationHours: 7, numberOfNights: 0 };
	}
	if (bookingLength.includes('övernattning')) {
		const nights = parseInt(bookingLength) || 1;
		return { durationHours: 0, numberOfNights: nights };
	}
	if (bookingLength.includes('h')) {
		const hours = parseInt(bookingLength);
		return { durationHours: hours, numberOfNights: 0 };
	}
	return { durationHours: 0, numberOfNights: 0 };
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
	const currentDateTime = new Date();
	const earliestPossibleTime = new Date(
		currentDateTime.getTime() + foresightHours * 60 * 60 * 1000
	);

	const [year, month, day] = bookingDate.split('-').map(Number);
	return times.filter((time) => {
		const [hours, minutes] = time.split(':').map(Number);
		const bookingDateTime = new Date(year, month - 1, day, hours, minutes);
		return bookingDateTime > earliestPossibleTime;
	});
}

function generateTimeSlots(openTime, closeTime, durationHours = 0) {
	const times = [];
	let currentTime = new Date(`1970-01-01T${openTime}`);
	const endTime = new Date(`1970-01-01T${closeTime}`);

	const lastPossibleStart = new Date(endTime);
	if (durationHours === 0) {
		const [closeHour, closeMinute] = closeTime.split(':').map(Number);
		lastPossibleStart.setHours(closeHour, closeMinute, 0);
	} else {
		lastPossibleStart.setHours(lastPossibleStart.getHours() - Math.floor(durationHours));
		lastPossibleStart.setMinutes(lastPossibleStart.getMinutes() - (durationHours % 1) * 60);
	}
	endTime.setTime(lastPossibleStart.getTime());

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
	const baseDate = date instanceof Date ? date : new Date(date);
	const newDate = new Date(baseDate);
	newDate.setDate(baseDate.getDate() + addDays);
	return newDate.toISOString().split('T')[0];
}

async function checkAvailability({
	date,
	durationHours,
	numberOfNights,
	addons,
	addonsList,
	openTime,
	closeTime,
	experienceId
}) {
	const requestedAddons = addonsList.filter((addon) => addons[addon.column_name] > 0);

	const possibleTimes = generateTimeSlots(
		openTime,
		closeTime,
		numberOfNights === 0 ? durationHours : 0
	);
	const validStartTimes = await filterPastTimes(possibleTimes, date, experienceId);

	if (validStartTimes.length === 0) {
		return [];
	}

	const availableTimes = new Set();

	for (const startTime of validStartTimes) {
		let allAddonsAvailable = true;

		for (const addon of requestedAddons) {
			const isAvailable = await checkAddonAvailability({
				addonId: addon.id,
				amount: addons[addon.column_name],
				maxQuantity: addon.max_quantity,
				startDate: date,
				startTime,
				numberOfNights,
				durationHours,
				openTime,
				closeTime
			});

			if (!isAvailable) {
				allAddonsAvailable = false;
				break;
			}
		}

		if (allAddonsAvailable) {
			availableTimes.add(startTime);
		}
	}

	return Array.from(availableTimes);
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
	// hämtar information om tillägget
	const {
		rows: [addon]
	} = await query('SELECT availability_table_name, name FROM addons WHERE id = $1', [addonId]);

	if (!addon) {
		throw new Error(`tillägg med id ${addonId} hittades inte`);
	}

	// beräkna antalet dagar inklusive start- och slutdatum
	const totalDays = numberOfNights + 1;
	const dates = Array.from({ length: totalDays }, (_, i) => getDateString(startDate, i));

	// kontrollera varje datum i perioden
	for (const [index, currentDate] of dates.entries()) {
		const isFirstDay = index === 0;
		const isLastDay = index === dates.length - 1;

		// beräkna dagens start- och sluttid
		let dayStartMinutes = isFirstDay ? timeToMinutes(startTime) : timeToMinutes('00:00');
		let dayEndMinutes = isLastDay ? timeToMinutes(closeTime) : timeToMinutes('23:59');

		// hämta tillgänglighetsdata
		const {
			rows: [availabilityData]
		} = await query(`SELECT * FROM ${addon.availability_table_name} WHERE date = $1`, [
			currentDate
		]);

		if (availabilityData) {
			// kontrollera varje kvart
			for (let minutes = dayStartMinutes; minutes < dayEndMinutes; minutes += 15) {
				const columnName = (Math.floor(minutes / 15) * 15).toString();
				const bookedAmount = parseInt(availabilityData[columnName] || '0');
				const availableSlots = maxQuantity + bookedAmount;

				if (amount > availableSlots) {
					return false;
				}
			}
		} else {
		}
	}

	return true;
}
