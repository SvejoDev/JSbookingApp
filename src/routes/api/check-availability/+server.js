import { json } from '@sveltejs/kit';
import { query } from '$lib/db.js';

export async function POST({ request }) {
	try {
		const { date, bookingLength, addons, experienceId } = await request.json();

		// hämta öppettider för den valda upplevelsen
		const {
			rows: [openDateData]
		} = await query('SELECT * FROM experience_open_dates WHERE experience_id = $1', [experienceId]);

		if (!openDateData) {
			console.error('kunde inte hämta öppettider');
			return json({ error: 'kunde inte hämta öppettider för upplevelsen' }, { status: 500 });
		}

		// kontrollera om datumet är inom tillåtet intervall
		const selectedDate = new Date(date);
		const startDate = new Date(openDateData.start_date);
		const endDate = new Date(openDateData.end_date);

		if (selectedDate < startDate || selectedDate > endDate) {
			return json({
				error: 'valt datum är utanför säsongen',
				availableStartTimes: []
			});
		}

		const durationHours = bookingLength.includes('h')
			? parseInt(bookingLength)
			: bookingLength === 'Hela dagen'
				? getHoursInDay(openDateData.open_time, openDateData.close_time)
				: 24;

		const availableStartTimes = await checkAvailability(
			date,
			durationHours,
			addons,
			openDateData.open_time,
			openDateData.close_time
		);

		return json({ availableStartTimes });
	} catch (error) {
		console.error('fel vid kontroll av tillgänglighet:', error);
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
		if (hours > currentHours) return true;
		if (hours === currentHours) {
			return minutes >= currentMinutes;
		}
		return false;
	});
}

async function checkAvailability(date, durationHours, addons, openTime, closeTime) {
	const possibleTimes = [];
	let currentTime = new Date(`${date}T${openTime}`);

	// räkna ut sista möjliga starttid
	let endTime;
	if (durationHours < getHoursInDay(openTime, closeTime)) {
		const [closeHours, closeMinutes] = closeTime.split(':').map(Number);
		endTime = new Date(`${date}T${closeTime}`);
		endTime.setHours(closeHours - durationHours);
		endTime.setMinutes(closeMinutes);
	} else {
		endTime = new Date(`${date}T${closeTime}`);
	}

	// skapa möjliga starttider
	while (currentTime <= endTime) {
		possibleTimes.push(currentTime.toTimeString().slice(0, 5));
		currentTime.setMinutes(currentTime.getMinutes() + 30);
	}

	// beräkna antal övernattningar
	const numberOfNights =
		durationHours === 24 ? 1 : durationHours === 48 ? 2 : durationHours === 72 ? 3 : 0;

	console.log(
		`kollar tillgänglighet för bokning som startar ${date} med ${numberOfNights} natt(er)`
	);

	const validStartTimes = filterPastTimes(possibleTimes, date);

	if (validStartTimes.length === 0) {
		return [];
	}

	const availableTimes = [];

	// hjälpfunktioner
	const timeToIndex = (timeStr) => {
		const [hours, minutes] = timeStr.split(':').map(Number);
		const totalMinutes = hours * 60 + minutes;
		return totalMinutes.toString();
	};

	const getDatePlusDays = (baseDate, daysToAdd) => {
		const newDate = new Date(baseDate);
		newDate.setDate(newDate.getDate() + daysToAdd);
		return newDate.toISOString().split('T')[0];
	};

	// beräkna stängningstid i minuter
	const closingTimeParts = closeTime.split(':').map(Number);
	const closingTimeMinutes = closingTimeParts[0] * 60 + closingTimeParts[1];

	const calculateTotalBooked = (availData, minute) => {
		if (!availData || !availData[minute.toString()]) return 0;
		return Math.abs(availData[minute.toString()] || 0);
	};

	async function checkProductAvailability(productType, amount, startTime, maxQuantity) {
		if (amount <= 0) return true;

		console.log(`\nkollar tillgänglighet för ${productType} (${amount} begärda)`);

		const startTimeMinutes = parseInt(timeToIndex(startTime));

		// hämta data för första dagen
		const {
			rows: [firstDayAvail]
		} = await query(`SELECT * FROM ${productType}_availability WHERE date = $1`, [date]);

		// för bokningar som inte är övernattning
		if (numberOfNights === 0) {
			if (firstDayAvail) {
				const endTimeMinutes = startTimeMinutes + durationHours * 60;

				for (let minutes = startTimeMinutes; minutes < endTimeMinutes; minutes += 15) {
					const totalBooked = calculateTotalBooked(firstDayAvail, minutes);
					const availableSlots = maxQuantity - totalBooked;

					if (totalBooked > 0) {
						console.log(
							`tid ${Math.floor(minutes / 60)}:${(minutes % 60).toString().padStart(2, '0')}:
                            redan bokat: ${totalBooked}
                            önskat antal: ${amount}
                            tillgängliga platser: ${availableSlots}
                            kan bokas: ${amount <= availableSlots}`
						);
					}

					if (amount > availableSlots) {
						console.log(
							`kan inte boka: inte tillräckligt med kapacitet kl ${Math.floor(minutes / 60)}:${(
								minutes % 60
							)
								.toString()
								.padStart(2, '0')} (behöver ${amount}, har ${availableSlots} tillgängliga)`
						);
						return false;
					}
				}
			}
		}
		// för övernattningsbokningar
		else if (numberOfNights > 0) {
			// kontrollera alla dagar i bokningsperioden
			for (let night = 0; night <= numberOfNights; night++) {
				const currentDate = getDatePlusDays(date, night);

				const {
					rows: [dayAvail]
				} = await query(`SELECT * FROM ${productType}_availability WHERE date = $1`, [currentDate]);

				console.log(`kontrollerar tillgänglighet för ${currentDate}`);

				let startMin, endMin;
				if (night === 0) {
					// första dagen
					startMin = startTimeMinutes;
					endMin = closingTimeMinutes;
				} else if (night === numberOfNights) {
					// sista dagen
					startMin = parseInt(timeToIndex(openTime));
					endMin = startTimeMinutes;
				} else {
					// mellandagar
					startMin = parseInt(timeToIndex(openTime));
					endMin = closingTimeMinutes;
				}

				// kontrollera varje 15-minutersperiod
				for (let minutes = startMin; minutes <= endMin; minutes += 15) {
					const totalBooked = calculateTotalBooked(dayAvail, minutes);
					const availableSlots = maxQuantity - totalBooked;

					if (totalBooked > 0) {
						console.log(
							`dag ${night + 1} kl ${Math.floor(minutes / 60)}:${(minutes % 60)
								.toString()
								.padStart(2, '0')}:
                            redan bokat: ${totalBooked}
                            önskat antal: ${amount}
                            tillgängliga platser: ${availableSlots}
                            kan bokas: ${amount <= availableSlots}`
						);
					}

					if (amount > availableSlots) {
						console.log(
							`kan inte boka: inte tillräckligt med kapacitet dag ${
								night + 1
							} kl ${Math.floor(minutes / 60)}:${(minutes % 60).toString().padStart(2, '0')}`
						);
						return false;
					}
				}
			}
		}

		return true;
	}

	// kontrollera alla möjliga starttider
	for (const time of validStartTimes) {
		let isTimeAvailable = true;
		console.log(`\nkollar tillgänglighet för starttid: ${time}`);

		// kontrollera kanoter
		if (isTimeAvailable && addons.amountCanoes > 0) {
			const {
				rows: [maxCanoes]
			} = await query('SELECT max_quantity FROM addons WHERE id = 1');

			if (!maxCanoes) {
				console.error('kunde inte hämta max antal kanoter');
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

		// kontrollera kajaker
		if (isTimeAvailable && addons.amountKayaks > 0) {
			const {
				rows: [maxKayaks]
			} = await query('SELECT max_quantity FROM addons WHERE id = 2');

			if (!maxKayaks) {
				console.error('kunde inte hämta max antal kajaker');
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

		// kontrollera SUP:ar
		if (isTimeAvailable && addons.amountSUPs > 0) {
			const {
				rows: [maxSUPs]
			} = await query('SELECT max_quantity FROM addons WHERE id = 3');

			if (!maxSUPs) {
				console.error('kunde inte hämta max antal SUP:ar');
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
			console.log(`tid ${time} är TILLGÄNGLIG för bokning`);
			availableTimes.push(time);
		} else {
			console.log(`tid ${time} är INTE tillgänglig för bokning`);
		}
	}

	return availableTimes;
}
