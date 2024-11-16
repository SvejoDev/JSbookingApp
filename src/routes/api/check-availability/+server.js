// Importera nödvändiga moduler
import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabaseAdmin.js';

export async function POST({ request }) {
	try {
		const { date, bookingLength, addons, experienceId } = await request.json();

		// Hämta öppettider för den valda upplevelsen
		const { data: openDateData, error: openDateError } = await supabaseAdmin
			.from('experience_open_dates')
			.select('*')
			.eq('experience_id', experienceId)
			.single();

		if (openDateError || !openDateData) {
			console.error('Kunde inte hämta öppettider:', openDateError);
			return json({ error: 'Kunde inte hämta öppettider för upplevelsen' }, { status: 500 });
		}

		// Kontrollera om det valda datumet är inom tillåtet datumintervall
		const selectedDate = new Date(date);
		const startDate = new Date(openDateData.start_date);
		const endDate = new Date(openDateData.end_date);

		if (selectedDate < startDate || selectedDate > endDate) {
			return json({
				error: 'Valt datum är utanför säsongen',
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
		console.error('Error checking availability:', error);
		return json({ error: error.message }, { status: 500 });
	}
}

// Hjälpfunktion för att räkna ut antal timmar mellan öppning och stängning
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
	// Använd de dynamiska öppettiderna istället för hårdkodade värden
	const possibleTimes = [];
	let currentTime = new Date(`${date}T${openTime}`);

	// Räkna ut sista möjliga starttid
	let endTime;
	if (durationHours < getHoursInDay(openTime, closeTime)) {
		const [closeHours, closeMinutes] = closeTime.split(':').map(Number);
		endTime = new Date(`${date}T${closeTime}`);
		endTime.setHours(closeHours - durationHours);
		endTime.setMinutes(closeMinutes);
	} else {
		endTime = new Date(`${date}T${closeTime}`);
	}

	// Skapa möjliga starttider med 30 minuters intervall
	while (currentTime <= endTime) {
		possibleTimes.push(currentTime.toTimeString().slice(0, 5));
		currentTime.setMinutes(currentTime.getMinutes() + 30);
	}

	// Beräkna antal övernattningar
	const numberOfNights =
		durationHours === 24 ? 1 : durationHours === 48 ? 2 : durationHours === 72 ? 3 : 0;

	console.log(
		`Kollar tillgänglighet för bokning som startar ${date} med ${numberOfNights} natt(er)`
	);

	const validStartTimes = filterPastTimes(possibleTimes, date);

	if (validStartTimes.length === 0) {
		return [];
	}

	const availableTimes = [];

	// Hjälpfunktioner
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

	// Beräkna stängningstid i minuter
	const closingTimeParts = closeTime.split(':').map(Number);
	const closingTimeMinutes = closingTimeParts[0] * 60 + closingTimeParts[1];

	// Funktion för att räkna totalt bokade
	const calculateTotalBooked = (availData, minute) => {
		if (!availData || !availData[minute.toString()]) return 0;
		return Math.abs(availData[minute.toString()] || 0);
	};

	// Funktion som kontrollerar tillgänglighet för en specifik produkt (kanot, kajak eller SUP)
	async function checkProductAvailability(productType, amount, startTime, maxQuantity) {
		// Om inget ska bokas av denna typ, returnera true
		if (amount <= 0) return true;

		console.log(`\nKollar tillgänglighet för ${productType} (${amount} begärda)`);

		// Omvandla starttiden till minuter
		const startTimeMinutes = parseInt(timeToIndex(startTime));

		// Hämta data om tillgänglighet för första dagen
		const { data: firstDayAvail } = await supabaseAdmin
			.from(`${productType}_availability`)
			.select('*')
			.eq('date', date)
			.single();

		// För bokningar som inte är övernattning
		if (numberOfNights === 0) {
			if (firstDayAvail) {
				// Räkna ut sluttid i minuter
				const endTimeMinutes = startTimeMinutes + durationHours * 60;

				// Kolla varje 15-minutersperiod under bokningen
				for (let minutes = startTimeMinutes; minutes < endTimeMinutes; minutes += 15) {
					const totalBooked = calculateTotalBooked(firstDayAvail, minutes);
					const availableSlots = maxQuantity - totalBooked;

					// Logga information om bokningar
					if (totalBooked > 0) {
						console.log(`Tid ${Math.floor(minutes / 60)}:${(minutes % 60)
							.toString()
							.padStart(2, '0')}:
                            Redan bokat: ${totalBooked}
                            Önskat antal: ${amount}
                            Tillgängliga platser: ${availableSlots}
                            Kan bokas: ${amount <= availableSlots}`);
					}

					// Om det inte finns tillräckligt med lediga platser
					if (amount > availableSlots) {
						console.log(
							`Kan inte boka: Inte tillräckligt med kapacitet kl ${Math.floor(
								minutes / 60
							)}:${(minutes % 60).toString().padStart(2, '0')} (behöver ${amount}, har ${availableSlots} tillgängliga)`
						);
						return false;
					}
				}
			}
		}
		// För övernattningsbokningar
		else if (numberOfNights > 0) {
			// Hämta data för nästa dag
			const nextDay = getDatePlusDays(date, 1);
			const { data: nextDayData } = await supabaseAdmin
				.from(`${productType}_availability`)
				.select('*')
				.eq('date', nextDay)
				.single();

			console.log(`Data för nästa dag tillgänglig:`, nextDayData ? 'Ja' : 'Nej');

			// Kolla första dagens tillgänglighet
			if (firstDayAvail) {
				for (let minutes = startTimeMinutes; minutes <= closingTimeMinutes; minutes += 15) {
					const totalBooked = calculateTotalBooked(firstDayAvail, minutes);
					const availableSlots = maxQuantity - totalBooked;

					if (totalBooked > 0) {
						console.log(`Första dagen kl ${Math.floor(minutes / 60)}:${(minutes % 60)
							.toString()
							.padStart(2, '0')}:
                            Redan bokat: ${totalBooked}
                            Önskat antal: ${amount}
                            Tillgängliga platser: ${availableSlots}
                            Kan bokas: ${amount <= availableSlots}`);
					}

					if (amount > availableSlots) {
						console.log(
							`Kan inte boka: Inte tillräckligt med kapacitet första dagen kl ${Math.floor(
								minutes / 60
							)}:${(minutes % 60).toString().padStart(2, '0')}`
						);
						return false;
					}
				}
			}

			// Kolla nästa dags tillgänglighet
			if (nextDayData) {
				const openingTimeMinutes = parseInt(timeToIndex(openTime));
				for (let minutes = openingTimeMinutes; minutes <= closingTimeMinutes; minutes += 15) {
					const totalBooked = calculateTotalBooked(nextDayData, minutes);
					const availableSlots = maxQuantity - totalBooked;

					if (totalBooked > 0) {
						console.log(`Nästa dag kl ${Math.floor(minutes / 60)}:${(minutes % 60)
							.toString()
							.padStart(2, '0')}:
                            Redan bokat: ${totalBooked}
                            Önskat antal: ${amount}
                            Tillgängliga platser: ${availableSlots}
                            Kan bokas: ${amount <= availableSlots}`);
					}

					if (amount > availableSlots) {
						console.log(
							`Kan inte boka: Inte tillräckligt med kapacitet nästa dag kl ${Math.floor(
								minutes / 60
							)}:${(minutes % 60).toString().padStart(2, '0')}`
						);
						return false;
					}
				}
			}
		}

		return true;
	}

	// Kolla igenom alla möjliga starttider
	for (const time of validStartTimes) {
		let isTimeAvailable = true;
		console.log(`\nKollar tillgänglighet för starttid: ${time}`);

		// Kolla tillgänglighet för kanoter om några är begärda
		if (isTimeAvailable && addons.amountCanoes > 0) {
			// Hämta max antal kanoter från databasen
			const { data: maxCanoes } = await supabaseAdmin
				.from('addons')
				.select('max_quantity')
				.eq('id', 1)
				.single();

			if (!maxCanoes) {
				console.error('Kunde inte hämta max antal kanoter');
				isTimeAvailable = false;
				continue;
			}

			// Kolla om det finns tillräckligt med kanoter lediga
			isTimeAvailable = await checkProductAvailability(
				'canoe',
				addons.amountCanoes,
				time,
				maxCanoes.max_quantity
			);
		}

		// Kolla tillgänglighet för kajaker om några är begärda
		if (isTimeAvailable && addons.amountKayaks > 0) {
			// Hämta max antal kajaker från databasen
			const { data: maxKayaks } = await supabaseAdmin
				.from('addons')
				.select('max_quantity')
				.eq('id', 2)
				.single();

			if (!maxKayaks) {
				console.error('Kunde inte hämta max antal kajaker');
				isTimeAvailable = false;
				continue;
			}

			// Kolla om det finns tillräckligt med kajaker lediga
			isTimeAvailable = await checkProductAvailability(
				'kayak',
				addons.amountKayaks,
				time,
				maxKayaks.max_quantity
			);
		}

		// Kolla tillgänglighet för SUP:ar om några är begärda
		if (isTimeAvailable && addons.amountSUPs > 0) {
			// Hämta max antal SUP:ar från databasen
			const { data: maxSUPs } = await supabaseAdmin
				.from('addons')
				.select('max_quantity')
				.eq('id', 3)
				.single();

			if (!maxSUPs) {
				console.error('Kunde inte hämta max antal SUP:ar');
				isTimeAvailable = false;
				continue;
			}

			// Kolla om det finns tillräckligt med SUP:ar lediga
			isTimeAvailable = await checkProductAvailability(
				'sup',
				addons.amountSUPs,
				time,
				maxSUPs.max_quantity
			);
		}

		// Om tiden är tillgänglig för alla begärda produkter, lägg till den i listan
		if (isTimeAvailable) {
			console.log(`Tid ${time} är TILLGÄNGLIG för bokning`);
			availableTimes.push(time);
		} else {
			console.log(`Tid ${time} är INTE tillgänglig för bokning`);
		}
	}

	// Returnera alla tillgängliga tider
	return availableTimes;
}
