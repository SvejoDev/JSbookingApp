import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabaseAdmin.js';

export async function POST({ request }) {
	try {
		const { date, bookingLength, addons } = await request.json();

		const durationHours = bookingLength.includes('h')
			? parseInt(bookingLength)
			: bookingLength === 'Hela dagen'
				? 7 // 10:00 to 17:00
				: 24; // Overnight booking

		const availableStartTimes = await checkAvailability(date, durationHours, addons);
		return json({ availableStartTimes });
	} catch (error) {
		console.error('Error checking availability:', error);
		return json({ error: error.message }, { status: 500 });
	}
}

async function checkAvailability(date, durationHours, addons) {
	const openTime = '10:00';
	const closeTime = '17:00';
	const possibleTimes = [];
	let currentTime = new Date(`${date}T${openTime}`);
	const endTime = new Date(`${date}T${closeTime}`);

	// Beräkna antal övernattningar
	const numberOfNights =
		durationHours === 24 ? 1 : durationHours === 48 ? 2 : durationHours === 72 ? 3 : 0;

	console.log(`Checking availability for booking starting ${date} with ${numberOfNights} night(s)`);

	// Generate possible start times at 30-minute intervals
	while (currentTime < endTime) {
		possibleTimes.push(currentTime.toTimeString().slice(0, 5));
		currentTime.setMinutes(currentTime.getMinutes() + 30);
	}

	const availableTimes = [];

	// Hjälpfunktioner
	const timeToIndex = (timeStr) => {
		const [hours, minutes] = timeStr.split(':').map(Number);
		const totalMinutes = hours * 60 + minutes;
		return totalMinutes.toString(); // Returnera som string för att matcha CSV kolumnerna
	};

	const getDatePlusDays = (baseDate, daysToAdd) => {
		const newDate = new Date(baseDate);
		newDate.setDate(newDate.getDate() + daysToAdd);
		return newDate.toISOString().split('T')[0];
	};

	// Beräkna stängningstid i minuter från midnatt
	const closingTimeParts = closeTime.split(':').map(Number);
	const closingTimeMinutes = closingTimeParts[0] * 60 + closingTimeParts[1];

	// Funktion för att räkna ut totalt antal bokade för en viss tidpunkt
	const calculateTotalBooked = (availData, minute) => {
		if (!availData || !availData[minute.toString()]) return 0;
		return Math.abs(availData[minute.toString()] || 0);
	};

	// Generell funktion för att kontrollera tillgänglighet för en produkttyp
	async function checkProductAvailability(productType, amount, startTime, maxQuantity) {
		if (amount <= 0) return true;

		console.log(`\nChecking ${productType} availability (${amount} requested)`);

		// Kontrollera första dagen
		const startTimeMinutes = parseInt(timeToIndex(startTime));
		const { data: firstDayAvail } = await supabaseAdmin
			.from(`${productType}_availability`)
			.select('*')
			.eq('date', date)
			.single();

		// För vanliga bokningar på samma dag
		if (numberOfNights === 0) {
			if (firstDayAvail) {
				// Beräkna sluttid för bokningen
				const endTimeMinutes = startTimeMinutes + durationHours * 60;

				// Don't allow bookings that would overlap with existing bookings
				for (let minutes = startTimeMinutes; minutes < endTimeMinutes; minutes += 15) {
					const totalBooked = calculateTotalBooked(firstDayAvail, minutes);
					const availableSlots = maxQuantity - totalBooked;

					// Visa information om bokningar
					if (totalBooked > 0) {
						console.log(`Time ${Math.floor(minutes / 60)}:${(minutes % 60).toString().padStart(2, '0')}:
                        Currently booked: ${totalBooked}
                        Requesting: ${amount}
                        Available slots: ${availableSlots}
                        Can accommodate: ${amount <= availableSlots}`);
					}

					if (amount > availableSlots) {
						console.log(
							`Cannot book: Not enough capacity at ${Math.floor(minutes / 60)}:${(minutes % 60).toString().padStart(2, '0')} (need ${amount}, have ${availableSlots} available)`
						);
						return false;
					}
				}
			}
		}
		// För övernattningsbokningar
		else if (numberOfNights > 0) {
			// Kontrollera även nästa dag
			const nextDay = getDatePlusDays(date, 1);
			const { data: nextDayData } = await supabaseAdmin
				.from(`${productType}_availability`)
				.select('*')
				.eq('date', nextDay)
				.single();
			console.log(`Next day data available:`, nextDayData ? 'Yes' : 'No');
			if (nextDayData) {
				const bookingTime = '780'; // 13:00 (780 minuter)
				console.log(`Booked at 13:00:`, nextDayData[bookingTime]);
			}

			// Kontrollera första dagen från starttid till stängning
			if (firstDayAvail) {
				for (let minutes = startTimeMinutes; minutes <= closingTimeMinutes; minutes += 15) {
					const totalBooked = calculateTotalBooked(firstDayAvail, minutes);
					const availableSlots = maxQuantity - totalBooked;

					if (totalBooked > 0) {
						console.log(`First day time ${Math.floor(minutes / 60)}:${(minutes % 60).toString().padStart(2, '0')}:
                            Currently booked: ${totalBooked}
                            Requesting: ${amount}
                            Available slots: ${availableSlots}
                            Can accommodate: ${amount <= availableSlots}`);
					}

					if (amount > availableSlots) {
						console.log(
							`Cannot book: Not enough capacity at first day ${Math.floor(minutes / 60)}:${(minutes % 60).toString().padStart(2, '0')}`
						);
						return false;
					}
				}
			}

			// Kontrollera hela nästa dag från öppning till stängning
			if (nextDayData) {
				const openingTimeMinutes = parseInt(timeToIndex(openTime));
				for (let minutes = openingTimeMinutes; minutes <= closingTimeMinutes; minutes += 15) {
					const totalBooked = calculateTotalBooked(nextDayData, minutes);
					const availableSlots = maxQuantity - totalBooked;

					if (totalBooked > 0) {
						console.log(`Next day time ${Math.floor(minutes / 60)}:${(minutes % 60).toString().padStart(2, '0')}:
                            Currently booked: ${totalBooked}
                            Requesting: ${amount}
                            Available slots: ${availableSlots}
                            Can accommodate: ${amount <= availableSlots}`);
					}

					if (amount > availableSlots) {
						console.log(
							`Cannot book: Not enough capacity at next day ${Math.floor(minutes / 60)}:${(minutes % 60).toString().padStart(2, '0')}`
						);
						return false;
					}
				}
			}
		}

		return true;
	}

	// Kontrollera tillgänglighet för varje möjlig starttid
	for (const time of possibleTimes) {
		let isTimeAvailable = true;
		console.log(`\nChecking availability for start time: ${time}`);

		// Kontrollera kanoter
		if (isTimeAvailable && addons.amountCanoes > 0) {
			const { data: maxCanoes } = await supabaseAdmin
				.from('addons')
				.select('max_quantity')
				.eq('id', 1)
				.single();

			if (!maxCanoes) {
				console.error('Could not fetch max quantity for canoes');
				isTimeAvailable = false;
				continue;
			}

			isTimeAvailable = await checkProductAvailability(
				'canoe',
				addons.amountCanoes,
				time,
				maxCanoes.max_quantity
			);
		}

		// Kontrollera kajaker om kanoter var tillgängliga
		if (isTimeAvailable && addons.amountKayaks > 0) {
			const { data: maxKayaks } = await supabaseAdmin
				.from('addons')
				.select('max_quantity')
				.eq('id', 2)
				.single();

			if (!maxKayaks) {
				console.error('Could not fetch max quantity for kayaks');
				isTimeAvailable = false;
				continue;
			}

			isTimeAvailable = await checkProductAvailability(
				'kayak',
				addons.amountKayaks,
				time,
				maxKayaks.max_quantity
			);
		}

		// Kontrollera SUPs om tidigare produkter var tillgängliga
		if (isTimeAvailable && addons.amountSUPs > 0) {
			const { data: maxSUPs } = await supabaseAdmin
				.from('addons')
				.select('max_quantity')
				.eq('id', 3)
				.single();

			if (!maxSUPs) {
				console.error('Could not fetch max quantity for SUPs');
				isTimeAvailable = false;
				continue;
			}

			isTimeAvailable = await checkProductAvailability(
				'sup',
				addons.amountSUPs,
				time,
				maxSUPs.max_quantity
			);
		}

		if (isTimeAvailable) {
			console.log(`Time ${time} is AVAILABLE for booking`);
			availableTimes.push(time);
		} else {
			console.log(`Time ${time} is NOT available for booking`);
		}
	}

	return availableTimes;
}
