import { json } from '@sveltejs/kit';
import { query } from '$lib/db.js';

export async function POST({ request }) {
	try {
		const { date, bookingLength, addons, experienceId } = await request.json();

		// hämta upplevelsens data
		const {
			rows: [experience]
		} = await query(
			`
			SELECT e.*, 
				   eod.open_time as default_open_time,
				   eod.close_time as default_close_time
			FROM experiences e
			LEFT JOIN experience_open_dates eod ON e.id = eod.experience_id
			AND CURRENT_DATE BETWEEN eod.start_date AND eod.end_date
			WHERE e.id = $1`,
			[experienceId]
		);

		if (!experience?.default_open_time || !experience?.default_close_time) {
			return json({
				error: 'Öppettider saknas för denna upplevelse',
				availableStartTimes: []
			});
		}

		// hämta addons data
		const { rows: addonsList } = await query(
			`
			SELECT addons.* 
			FROM addons 
			JOIN experience_addons ON addons.id = experience_addons.addon_id 
			WHERE experience_addons.experience_id = $1`,
			[experienceId]
		);

		// hantera både public och business_school på samma sätt
		if (
			experience.experience_type === 'public' ||
			experience.experience_type === 'business_school'
		) {
			// hämta specifika tidsslots eller standardtider
			const { rows: specificTimeSlots } = await query(
				`SELECT open_time, close_time 
				 FROM experience_available_dates 
				 WHERE experience_id = $1 
				 AND available_date = $2`,
				[experienceId, date]
			);

			// hämta öppettider från specifika datum eller standardtider
			let openTime, closeTime;

			if (specificTimeSlots.length > 0) {
				openTime = specificTimeSlots[0].open_time;
				closeTime = specificTimeSlots[0].close_time;
			} else {
				openTime = experience.default_open_time;
				closeTime = experience.default_close_time;
			}

			// parsa bokningslängd med öppettider
			const { durationHours, numberOfNights } = parseBookingLength(
				bookingLength,
				openTime,
				closeTime
			);

			// generera tider med hänsyn till bokningstyp
			const possibleTimes = generateTimeSlots(openTime, closeTime, durationHours, bookingLength);

			// kontrollera tillgänglighet för addons
			const availableTimes = await checkAvailability({
				date,
				durationHours,
				numberOfNights,
				addons,
				addonsList,
				openTime,
				closeTime,
				experienceId,
				bookingLength
			});

			return json({ availableStartTimes: availableTimes });
		}

		return json({ availableStartTimes: [] });
	} catch (error) {
		console.error('Fel vid kontroll av tillgänglighet:', error);
		return json({ error: 'Internt serverfel', availableStartTimes: [] });
	}
}

function parseBookingLength(bookingLength, openTime, closeTime) {
	// hantera övernattningar
	if (bookingLength.includes('övernattning')) {
		const nights = parseInt(bookingLength) || 1;
		return { durationHours: 0, numberOfNights: nights };
	}

	// hantera timmar
	if (bookingLength.includes('h')) {
		const hours = parseInt(bookingLength);
		return { durationHours: hours, numberOfNights: 0 };
	}

	// hantera hela dagen
	if (bookingLength === 'Hela dagen') {
		// kontrollera att öppettider finns
		if (!openTime || !closeTime) {
			throw new Error('Öppettider saknas för denna upplevelse');
		}

		// beräkna längden mellan öppning och stängning
		const [openHours, openMinutes] = openTime.split(':').map(Number);
		const [closeHours, closeMinutes] = closeTime.split(':').map(Number);

		const totalMinutes = closeHours * 60 + closeMinutes - (openHours * 60 + openMinutes);
		const totalHours = totalMinutes / 60;

		return { durationHours: totalHours, numberOfNights: 0 };
	}

	// standardvärde
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

function generateTimeSlots(openTime, closeTime, durationHours = 0, bookingType = '') {
	const times = [];

	// om det är en hela dagen-bokning, returnera endast öppningstiden
	if (bookingType === 'Hela dagen') {
		return [openTime];
	}

	let currentTime = new Date(`1970-01-01T${openTime}`);
	const endTime = new Date(`1970-01-01T${closeTime}`);

	// För övernattningar, använd hela dagen
	if (durationHours === 0) {
		while (currentTime <= endTime) {
			times.push(currentTime.toTimeString().slice(0, 5));
			currentTime.setMinutes(currentTime.getMinutes() + 30);
		}
	} else {
		// För dagsbokningar, ta hänsyn till bokningslängden
		const lastPossibleStart = new Date(endTime);
		lastPossibleStart.setHours(lastPossibleStart.getHours() - Math.floor(durationHours));
		lastPossibleStart.setMinutes(lastPossibleStart.getMinutes() - (durationHours % 1) * 60);

		while (currentTime <= lastPossibleStart) {
			times.push(currentTime.toTimeString().slice(0, 5));
			currentTime.setMinutes(currentTime.getMinutes() + 30);
		}
	}

	return times;
}

function timeToMinutes(time) {
	const [hours, minutes] = time.split(':').map(Number);
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
	experienceId,
	bookingLength
}) {
	// generera möjliga tider
	const possibleTimes = generateTimeSlots(
		openTime,
		closeTime,
		numberOfNights === 0 ? durationHours : 0,
		bookingLength
	);

	// filtrera tider som är i det förflutna
	const validStartTimes = await filterPastTimes(possibleTimes, date, experienceId);

	if (validStartTimes.length === 0) {
		return [];
	}

	const availableTimes = new Set();

	for (const startTime of validStartTimes) {
		let allAddonsAvailable = true;

		for (const addon of addonsList) {
			const isAvailable = await checkAddonAvailability({
				addonId: addon.id,
				amount: addons[addon.column_name],
				maxQuantity: addon.max_quantity,
				startDate: date,
				startTime,
				numberOfNights,
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
	openTime,
	closeTime
}) {
	if (!amount || amount <= 0) return true;

	// hämta addon-information
	const {
		rows: [addon]
	} = await query('SELECT availability_table_name, name FROM addons WHERE id = $1', [addonId]);

	if (!addon) {
		throw new Error(`tillägg med id ${addonId} hittades inte`);
	}

	// beräkna antalet dagar inklusive start- och slutdatum
	const totalDays = numberOfNights + 1;
	const dates = Array.from({ length: totalDays }, (_, i) => {
		const date = new Date(startDate);
		date.setDate(date.getDate() + i);
		return date.toISOString().split('T')[0];
	});

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
				const bookedAmount = Math.abs(parseInt(availabilityData[columnName] || '0'));
				const availableSlots = maxQuantity - bookedAmount;

				if (amount > availableSlots) {
					return false;
				}
			}
		}
	}

	return true;
}
