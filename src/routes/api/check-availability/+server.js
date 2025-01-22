import { json } from '@sveltejs/kit';
import { query } from '$lib/db.js';

export async function POST({ request }) {
	try {
		const { date, bookingLength, addons, experienceId } = await request.json();

		console.log('=== BOKNING PÅBÖRJAD ===');
		console.log('📅 Datum:', date);
		console.log('⏱️ Bokningslängd:', bookingLength);
		console.log('🎯 Upplevelse ID:', experienceId);
		console.log('➕ Tillägg:', JSON.stringify(addons, null, 2));

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
	// omvandlar tidsträngarna till minuter för att kunna göra beräkningar
	const [openHours, openMinutes] = openTime.split(':').map(Number);
	const [closeHours, closeMinutes] = closeTime.split(':').map(Number);

	console.log('⏰ Beräknar öppettider:');
	console.log(`   Öppnar: ${openTime}`);
	console.log(`   Stänger: ${closeTime}`);

	// beräknar total tid i minuter
	const totalOpenMinutes = closeHours * 60 + closeMinutes - (openHours * 60 + openMinutes);
	const hours = Math.floor(totalOpenMinutes / 60);

	console.log(`   Totalt antal timmar öppet: ${hours}`);
	return hours;
}

async function filterPastTimes(times, bookingDate, experienceId) {
	// hämtar framförhållningskrav (booking_foresight_hours) från databasen
	const {
		rows: [experience]
	} = await query('SELECT booking_foresight_hours FROM experiences WHERE id = $1', [experienceId]);

	const foresightHours = experience?.booking_foresight_hours || 0;

	console.log('\n🕒 Filtrerar tider baserat på framförhållning:');
	console.log(`   Krav på framförhållning: ${foresightHours} timmar`);

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
	console.log('\n⚙️ Genererar tidsluckor:');
	console.log(`   Öppettid: ${openTime}`);
	console.log(`   Stängningstid: ${closeTime}`);
	console.log(`   Bokningslängd: ${durationHours} timmar`);

	const times = [];
	let currentTime = new Date(`1970-01-01T${openTime}`);
	const endTime = new Date(`1970-01-01T${closeTime}`);

	// för enkeldagsbokningar, beräkna sista möjliga starttid baserat på bokningslängd
	// exempel: om stängning är 22:00 och bokningen är 2 timmar, är sista starttid 20:00
	if (durationHours > 0) {
		const lastPossibleStart = new Date(endTime);
		lastPossibleStart.setHours(lastPossibleStart.getHours() - Math.floor(durationHours));
		lastPossibleStart.setMinutes(lastPossibleStart.getMinutes() - (durationHours % 1) * 60);
		endTime.setTime(lastPossibleStart.getTime());

		console.log(`   Sista möjliga starttid: ${lastPossibleStart.toTimeString().slice(0, 5)}`);
	}

	while (currentTime <= endTime) {
		times.push(currentTime.toTimeString().slice(0, 5));
		currentTime.setMinutes(currentTime.getMinutes() + 30);
	}

	return times;
}

function timeToMinutes(timeStr) {
	const [hours, minutes] = timeStr.split(':').map(Number);
	const totalMinutes = hours * 60 + minutes;

	console.log(`   Omvandlar ${timeStr} till ${totalMinutes} minuter`);
	return totalMinutes;
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

	console.log('\n🔍 KONTROLL AV TILLÄGG');
	console.log(`📦 Tillägg: ${addon.name}`);
	console.log(`📊 Antal begärda: ${amount}`);
	console.log(`⚡ Max antal tillåtna: ${maxQuantity}`);
	console.log(`📅 Startdatum: ${startDate}`);
	console.log(`⏰ Starttid: ${startTime}`);
	console.log(`🌙 Antal nätter: ${numberOfNights}`);

	// skapa en array med alla datum som ska kontrolleras
	const dates = Array.from({ length: numberOfNights + 1 }, (_, i) => getDateString(startDate, i));
	console.log('\n📆 Kontrollerar följande datum:', dates.join(', '));

	// kontrollera tillgänglighet för varje datum
	for (const [index, currentDate] of dates.entries()) {
		const isFirstDay = index === 0;
		const isLastDay = index === dates.length - 1;
		const isMiddleDay = !isFirstDay && !isLastDay;

		console.log(`\n🔄 PROCESSAR DATUM: ${currentDate}`);
		console.log(
			`📍 Typ av dag: ${isFirstDay ? 'Första dagen' : isMiddleDay ? 'Mellandag' : 'Sista dagen'}`
		);

		let dayStartMinutes, dayEndMinutes;

		if (numberOfNights > 0) {
			if (isFirstDay) {
				dayStartMinutes = timeToMinutes(startTime);
				dayEndMinutes = timeToMinutes('23:59');
			} else if (isMiddleDay) {
				dayStartMinutes = timeToMinutes('00:00');
				dayEndMinutes = timeToMinutes('23:59');
			} else if (isLastDay) {
				dayStartMinutes = timeToMinutes('00:00');
				dayEndMinutes = timeToMinutes(closeTime);
			}
		} else {
			dayStartMinutes = timeToMinutes(startTime);
			dayEndMinutes = dayStartMinutes + durationHours * 60;
		}

		console.log(
			`⏱️ Kontrollerar tidsintervall: ${Math.floor(dayStartMinutes / 60)}:${(dayStartMinutes % 60).toString().padStart(2, '0')} till ${Math.floor(dayEndMinutes / 60)}:${(dayEndMinutes % 60).toString().padStart(2, '0')}`
		);

		// hämta tillgänglighetsdata från databasen för aktuellt datum
		const {
			rows: [availabilityData]
		} = await query(`SELECT * FROM ${addon.availability_table_name} WHERE date = $1`, [
			currentDate
		]);

		if (availabilityData) {
			console.log('\n📊 TILLGÄNGLIGHETSANALYS:');
			// kontrollera varje 15-minuters intervall
			for (let minutes = dayStartMinutes; minutes < dayEndMinutes; minutes += 15) {
				const columnName = (Math.floor(minutes / 15) * 15).toString();
				const bookedAmount = parseInt(availabilityData[columnName] || '0');
				const availableSlots = maxQuantity + bookedAmount;
				const timeString = `${Math.floor(minutes / 60)}:${(minutes % 60).toString().padStart(2, '0')}`;

				console.log(`\n⚖️ Kontroll för ${timeString}:`);
				console.log(`   📝 Kolumn i databasen: "${columnName}"`);
				console.log(`   ➖ Redan bokat: ${Math.abs(bookedAmount)}`);
				console.log(`   ➕ Max tillåtna: ${maxQuantity}`);
				console.log(`   ✨ Tillgängliga platser: ${availableSlots}`);
				console.log(`   🎯 Begärda platser: ${amount}`);

				if (amount > availableSlots) {
					console.log(`\n❌ BOKNING EJ MÖJLIG:`);
					console.log(`   Tid: ${timeString}`);
					console.log(`   Tillgängligt: ${availableSlots}`);
					console.log(`   Begärt: ${amount}`);
					console.log(`   Anledning: Otillräcklig kapacitet`);
					return false;
				}
			}
		}
	}

	console.log('\n✅ BOKNING MÖJLIG:');
	console.log(`   Tillägg: ${addon.name}`);
	console.log(`   Antal: ${amount}`);
	return true;
}
