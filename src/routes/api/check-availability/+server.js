import { json } from '@sveltejs/kit';
import { query } from '$lib/db.js';

export async function POST({ request }) {
	try {
		const { date, bookingLength, addons, experienceId } = await request.json();

		console.log('\n=== DEBUGGING REQUEST ===');
		console.log('Received request:', {
			date,
			bookingLength,
			addons,
			experienceId
		});

		// Get experience data
		const {
			rows: [experience]
		} = await query('SELECT * FROM experiences WHERE id = $1', [experienceId]);
		console.log('Experience data:', experience);

		// Get addons data
		const { rows: addonsList } = await query(
			`
			SELECT addons.* 
			FROM addons 
			JOIN experience_addons ON addons.id = experience_addons.addon_id 
			WHERE experience_addons.experience_id = $1`,
			[experienceId]
		);
		console.log('Addons list:', addonsList);

		// Parse booking length
		const { durationHours, numberOfNights } = parseBookingLength(bookingLength);
		console.log('Parsed booking length:', { durationHours, numberOfNights });

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

		console.log('Time slots:', { openTime, closeTime });

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
		console.error('Error in POST handler:', error);
		return json({ error: 'Internal server error', availableStartTimes: [] });
	}
}

function parseBookingLength(bookingLength) {
	console.log('Parsing booking length:', bookingLength);

	// Handle "Hela dagen"
	if (bookingLength === 'Hela dagen') {
		return { durationHours: 7, numberOfNights: 0 };
	}

	// Handle overnight bookings
	if (bookingLength.includes('övernattning')) {
		const nights = parseInt(bookingLength) || 1;
		return { durationHours: 0, numberOfNights: nights };
	}

	// Handle hour-based bookings (e.g., "4h")
	if (bookingLength.includes('h')) {
		const hours = parseInt(bookingLength);
		return { durationHours: hours, numberOfNights: 0 };
	}

	// Default case
	return { durationHours: 0, numberOfNights: 0 };
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
	const {
		rows: [experience]
	} = await query('SELECT booking_foresight_hours FROM experiences WHERE id = $1', [experienceId]);

	const foresightHours = experience?.booking_foresight_hours || 0;

	// enkel logg för framförhållning
	console.log('\n⏰ Kontroll av framförhållning:');
	console.log(`   • Krav: ${foresightHours} timmar`);

	const currentDateTime = new Date();
	const earliestPossibleTime = new Date(
		currentDateTime.getTime() + foresightHours * 60 * 60 * 1000
	);

	// enkel datumlogg
	console.log('\n📅 Datumkontroll:');
	console.log(`   • Nuvarande tid: ${currentDateTime.toLocaleString('sv-SE')}`);
	console.log(`   • Tidigaste bokningstid: ${earliestPossibleTime.toLocaleString('sv-SE')}`);
	console.log(`   • Önskat bokningsdatum: ${bookingDate}`);

	const [year, month, day] = bookingDate.split('-').map(Number);

	return times.filter((time) => {
		const [hours, minutes] = time.split(':').map(Number);
		const bookingDateTime = new Date(year, month - 1, day, hours, minutes);

		// enkel tidskontroll
		const isValid = bookingDateTime > earliestPossibleTime;
		if (!isValid) {
			console.log(`   ❌ ${time} - för tidigt att boka`);
		}

		return isValid;
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

	// För övernattningsbokningar eller hela dagen, använd bara starttider fram till 13:00
	const lastPossibleStart = new Date(endTime);
	if (durationHours === 0) {
		// Övernattningsbokning - använd stängningstiden som sista möjliga starttid
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
	const totalMinutes = hours * 60 + minutes;

	console.log(`   Omvandlar ${timeStr} till ${totalMinutes} minuter`);
	return totalMinutes;
}

function getDateString(date, addDays = 0) {
	// konverterar till Date-objekt om det är en sträng
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
	console.group('🔍 Availability Check');
	console.log('📅 Request:', {
		date,
		durationHours,
		numberOfNights,
		addons: JSON.stringify(addons)
	});

	// filter addonsList to only include requested addons
	const requestedAddons = addonsList.filter((addon) => addons[addon.column_name] > 0);
	console.log('\n=== REQUESTED ADDONS ===');
	console.log('Addons:', requestedAddons);
	console.log('Duration Hours:', durationHours);
	console.log('Number of Nights:', numberOfNights);

	const possibleTimes = generateTimeSlots(
		openTime,
		closeTime,
		numberOfNights === 0 ? durationHours : 0
	);
	console.log('\n=== POSSIBLE TIMES ===');
	console.log('Times:', possibleTimes);

	const validStartTimes = await filterPastTimes(possibleTimes, date, experienceId);
	console.log('\n=== VALID START TIMES ===');
	console.log('Times:', validStartTimes);

	if (validStartTimes.length === 0) {
		console.log('NO VALID START TIMES FOUND');
		return [];
	}

	const availableTimes = new Set(); // använder set för unika värden

	// process each potential start time
	for (const startTime of validStartTimes) {
		console.log(`\n=== CHECKING START TIME: ${startTime} ===`);

		let allAddonsAvailable = true; // flagga för att kontrollera om alla addons är tillgängliga

		// kontrollera alla begärda addons
		for (const addon of requestedAddons) {
			console.log(`\nChecking addon: ${addon.name}`);
			console.log('Parameters:', {
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

			console.log(
				`${addon.name} availability result: ${isAvailable ? 'AVAILABLE' : 'NOT AVAILABLE'}`
			);

			if (!isAvailable) {
				allAddonsAvailable = false;
				break; // avbryt om någon addon inte är tillgänglig
			}
		}

		// lägg bara till tiden om alla addons var tillgängliga
		if (allAddonsAvailable) {
			console.log(`\n✅ Time ${startTime} is AVAILABLE for booking (all addons available)`);
			availableTimes.add(startTime);
		} else {
			console.log(`\n❌ Time ${startTime} is NOT available for booking`);
		}
	}

	const uniqueAvailableTimes = Array.from(availableTimes);
	console.log('✅ Available Times:', uniqueAvailableTimes);
	console.groupEnd();

	return uniqueAvailableTimes;
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

	console.log('\n[Bokningsperiod]', {
		startDatum: dates[0],
		slutDatum: dates[dates.length - 1],
		antalDagar: dates.length,
		antalNätter: numberOfNights
	});

	// visa bokningsförfrågan
	console.log('\n[Bokningsförfrågan]', {
		tillägg: addon.name,
		antal: amount,
		period: `${dates[0]} till ${dates[dates.length - 1]}`,
		starttid: startTime
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

		console.log(`\n[${currentDate}]`, {
			typ: isFirstDay ? 'start' : isLastDay ? 'slut' : 'mellan',
			tid: `${formatMinutes(dayStartMinutes)}-${formatMinutes(dayEndMinutes)}`
		});

		if (availabilityData) {
			// kontrollera varje kvart
			for (let minutes = dayStartMinutes; minutes < dayEndMinutes; minutes += 15) {
				const columnName = (Math.floor(minutes / 15) * 15).toString();
				const bookedAmount = parseInt(availabilityData[columnName] || '0');
				const availableSlots = maxQuantity + bookedAmount;

				if (amount > availableSlots) {
					console.log(
						`[Ej tillgänglig] ${formatMinutes(minutes)}: ${availableSlots}/${amount} platser`
					);
					return false;
				}
			}
			console.log('[Status] Tillgänglig');
		} else {
			console.log('[Status] Ingen data - antar tillgänglig');
		}
	}

	console.log('\n[Resultat] Bokning möjlig för hela perioden');
	return true;
}

// hjälpfunktion för att formatera minuter till tid
function formatMinutes(minutes) {
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}
