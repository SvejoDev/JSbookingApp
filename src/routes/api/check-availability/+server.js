import { json } from '@sveltejs/kit';
import { query } from '$lib/db.js';

export async function POST({ request }) {
	try {
		const { date, bookingLength, addons, experienceId } = await request.json();

		console.log('Received request:', { date, bookingLength, addons, experienceId });

		// hämta upplevelsens data med öppettider
		const {
			rows: [experience]
		} = await query(
			`WITH opening_hours AS (
				-- försök först hitta specifika datum
				SELECT 
					open_time,
					close_time,
					1 as priority
				FROM experience_available_dates
				WHERE experience_id = $1 
				AND available_date = $2
				
				UNION ALL
				
				-- om inga specifika datum hittas, använd periodiska datum
				SELECT 
					open_time,
					close_time,
					2 as priority
				FROM experience_open_dates
				WHERE experience_id = $1 
				AND $2 BETWEEN start_date AND end_date
			)
			SELECT 
				e.*,
				oh.open_time,
				oh.close_time
			FROM experiences e
			LEFT JOIN (
				SELECT DISTINCT ON (priority) *
				FROM opening_hours
				ORDER BY priority
			) oh ON true
			WHERE e.id = $1`,
			[experienceId, date]
		);

		console.log('Experience data:', experience);

		if (!experience?.open_time || !experience?.close_time) {
			console.log('Missing opening hours:', {
				open_time: experience?.open_time,
				close_time: experience?.close_time
			});
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

		console.log('Addons list:', addonsList);

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

			console.log('Specific time slots:', specificTimeSlots);

			let openTime, closeTime;

			if (specificTimeSlots.length > 0) {
				openTime = specificTimeSlots[0].open_time;
				closeTime = specificTimeSlots[0].close_time;
			} else {
				openTime = experience.open_time;
				closeTime = experience.close_time;
			}

			console.log('Using times:', { openTime, closeTime });

			const { durationHours, numberOfNights } = parseBookingLength(
				bookingLength,
				openTime,
				closeTime
			);

			console.log('Parsed booking length:', { durationHours, numberOfNights });

			const possibleTimes = generateTimeSlots(openTime, closeTime, durationHours, bookingLength);
			console.log('Generated possible times:', possibleTimes);

			const validStartTimes = await filterPastTimes(possibleTimes, date, experienceId);
			console.log('Valid start times after filtering past times:', validStartTimes);

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

			console.log('Final available times:', availableTimes);

			return json({
				success: true,
				openTime: experience.open_time,
				closeTime: experience.close_time,
				availableStartTimes: availableTimes
			});
		}

		return json({
			success: true,
			openTime: experience.open_time,
			closeTime: experience.close_time
			// lägg till övrig relevant data här
		});
	} catch (error) {
		console.error('Error checking availability:', error);
		return json({ error: 'Ett fel uppstod vid kontroll av tillgänglighet' }, { status: 500 });
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

	console.log('Checking availability for addon:', {
		addonId,
		amount,
		maxQuantity,
		startDate,
		startTime,
		numberOfNights
	});

	const {
		rows: [addon]
	} = await query('SELECT availability_table_name, name FROM addons WHERE id = $1', [addonId]);

	if (!addon) {
		console.error(`Addon not found: ${addonId}`);
		throw new Error(`tillägg med id ${addonId} hittades inte`);
	}

	console.log('Found addon:', addon);

	const totalDays = numberOfNights + 1;
	const dates = Array.from({ length: totalDays }, (_, i) => {
		const date = new Date(startDate);
		date.setDate(date.getDate() + i);
		return date.toISOString().split('T')[0];
	});

	console.log('Checking dates:', dates);

	for (const [index, currentDate] of dates.entries()) {
		const isFirstDay = index === 0;
		const isLastDay = index === dates.length - 1;

		let dayStartMinutes = isFirstDay ? timeToMinutes(startTime) : timeToMinutes('00:00');
		let dayEndMinutes = isLastDay ? timeToMinutes(closeTime) : timeToMinutes('23:59');

		console.log('Checking time range:', {
			date: currentDate,
			start: dayStartMinutes,
			end: dayEndMinutes
		});

		const {
			rows: [availabilityData]
		} = await query(`SELECT * FROM ${addon.availability_table_name} WHERE date = $1`, [
			currentDate
		]);

		console.log('Availability data:', availabilityData);

		if (availabilityData) {
			for (let minutes = dayStartMinutes; minutes < dayEndMinutes; minutes += 15) {
				const columnName = (Math.floor(minutes / 15) * 15).toString();
				const bookedAmount = Math.abs(parseInt(availabilityData[columnName] || '0'));
				const availableSlots = maxQuantity - bookedAmount;

				if (amount > availableSlots) {
					console.log('Insufficient availability:', {
						time: columnName,
						bookedAmount,
						availableSlots,
						requestedAmount: amount
					});
					return false;
				}
			}
		}
	}

	console.log('Addon is available');
	return true;
}
