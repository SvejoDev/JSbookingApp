import { json } from '@sveltejs/kit';
import { logger } from '$lib/utils/logger';
import { query } from '$lib/db.js';

export async function POST({ request }) {
	try {
		const { date, bookingLength, addons, experienceId } = await request.json();

		logger.info('Received request:', { date, bookingLength, addons, experienceId });

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

		logger.info('Experience data:', experience);

		if (!experience?.open_time || !experience?.close_time) {
			logger.error('Missing opening hours:', {
				experience_id: experienceId,
				open_time: experience?.open_time,
				close_time: experience?.close_time
			});
			return json({
				error: 'Kunde inte hitta öppettider för denna upplevelse',
				availableStartTimes: []
			});
		}

		// validera att öppettiderna är i rätt format
		const openTime = experience.open_time.slice(0, 5); // ta bara "HH:MM"
		const closeTime = experience.close_time.slice(0, 5);

		logger.info('Validated opening hours:', {
			openTime,
			closeTime,
			original: {
				open: experience.open_time,
				close: experience.close_time
			}
		});

		// hämta addons data
		const { rows: addonsList } = await query(
			`
			SELECT addons.* 
			FROM addons 
			JOIN experience_addons ON addons.id = experience_addons.addon_id 
			WHERE experience_addons.experience_id = $1`,
			[experienceId]
		);

		logger.info('Addons list:', addonsList);

		// hantera både public och business_school på samma sätt
		if (
			experience.experience_type === 'public' ||
			experience.experience_type === 'business_school'
		) {
			// använd redan hämtade öppettider från CTE
			let openTime = experience.open_time;
			let closeTime = experience.close_time;

			logger.info('Using times:', { openTime, closeTime });

			// validera öppettider
			if (!openTime || !closeTime) {
				return json({
					error: 'Öppettider saknas för denna upplevelse',
					availableStartTimes: []
				});
			}

			const { durationHours, numberOfNights } = parseBookingLength(
				bookingLength,
				openTime,
				closeTime
			);

			logger.info('Parsed booking length:', { durationHours, numberOfNights });

			// generera möjliga tider baserat på öppettider
			const possibleTimes = generateTimeSlots(openTime, closeTime, durationHours, bookingLength);
			logger.info('Generated possible times:', possibleTimes);

			// filtrera bort tider som redan är passerade
			const validStartTimes = possibleTimes.filter((time) => {
				const [hours, minutes] = time.split(':').map(Number);
				const timeInMinutes = hours * 60 + minutes;

				// kontrollera att tiden är inom öppettiderna
				const [openHours, openMinutes] = openTime.split(':').map(Number);
				const openTimeInMinutes = openHours * 60 + openMinutes;

				// kontrollera att tiden plus bokningslängden inte går över stängningstiden
				const [closeHours, closeMinutes] = closeTime.split(':').map(Number);
				const closeTimeInMinutes = closeHours * 60 + closeMinutes;

				// beräkna sluttiden baserat på bokningslängden
				const endTimeInMinutes = timeInMinutes + durationHours * 60;

				return (
					timeInMinutes >= openTimeInMinutes && // tiden är efter öppning
					endTimeInMinutes <= closeTimeInMinutes // sluttiden är före stängning
				);
			});

			logger.info('Time filtering debug:', {
				openTime,
				closeTime,
				durationHours,
				possibleTimes: possibleTimes.length,
				validStartTimes: validStartTimes.length
			});

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

			logger.info('Final available times:', availableTimes);

			return json({
				success: true,
				openTime: openTime,
				closeTime: closeTime,
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
		logger.error('Error checking availability:', error);
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
	const validStartTimes = possibleTimes.filter((time) => {
		const [hours, minutes] = time.split(':').map(Number);
		const timeInMinutes = hours * 60 + minutes;

		// kontrollera att tiden är inom öppettiderna
		const [openHours, openMinutes] = openTime.split(':').map(Number);
		const openTimeInMinutes = openHours * 60 + openMinutes;

		// kontrollera att tiden plus bokningslängden inte går över stängningstiden
		const [closeHours, closeMinutes] = closeTime.split(':').map(Number);
		const closeTimeInMinutes = closeHours * 60 + closeMinutes;

		// beräkna sluttiden baserat på bokningslängden
		const endTimeInMinutes = timeInMinutes + durationHours * 60;

		return (
			timeInMinutes >= openTimeInMinutes && // tiden är efter öppning
			endTimeInMinutes <= closeTimeInMinutes // sluttiden är före stängning
		);
	});

	logger.info('Time filtering debug:', {
		openTime,
		closeTime,
		durationHours,
		possibleTimes: possibleTimes.length,
		validStartTimes: validStartTimes.length
	});

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

	logger.info('Checking availability for addon:', {
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
		logger.error(`Addon not found: ${addonId}`);
		throw new Error(`tillägg med id ${addonId} hittades inte`);
	}

	logger.info('Found addon:', addon);

	const totalDays = numberOfNights + 1;
	const dates = Array.from({ length: totalDays }, (_, i) => {
		const date = new Date(startDate);
		date.setDate(date.getDate() + i);
		return date.toISOString().split('T')[0];
	});

	logger.info('Checking dates:', dates);

	for (const [index, currentDate] of dates.entries()) {
		const isFirstDay = index === 0;
		const isLastDay = index === dates.length - 1;

		let dayStartMinutes = isFirstDay ? timeToMinutes(startTime) : timeToMinutes('00:00');
		let dayEndMinutes = isLastDay ? timeToMinutes(closeTime) : timeToMinutes('23:59');

		logger.info('Checking time range:', {
			date: currentDate,
			start: dayStartMinutes,
			end: dayEndMinutes
		});

		const {
			rows: [availabilityData]
		} = await query(`SELECT * FROM ${addon.availability_table_name} WHERE date = $1`, [
			currentDate
		]);

		logger.info('Availability data:', availabilityData);

		if (availabilityData) {
			for (let minutes = dayStartMinutes; minutes < dayEndMinutes; minutes += 15) {
				const columnName = (Math.floor(minutes / 15) * 15).toString();
				const bookedAmount = Math.abs(parseInt(availabilityData[columnName] || '0'));
				const availableSlots = maxQuantity - bookedAmount;

				if (amount > availableSlots) {
					logger.info('Insufficient availability:', {
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

	logger.info('Addon is available');
	return true;
}
