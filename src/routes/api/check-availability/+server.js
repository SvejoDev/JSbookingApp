import { json } from '@sveltejs/kit';
import { supabase } from '$lib/supabaseClient.js';

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

	while (currentTime < endTime) {
		possibleTimes.push(currentTime.toTimeString().slice(0, 5));
		currentTime.setMinutes(currentTime.getMinutes() + 30);
	}

	const availableTimes = [];
	for (const time of possibleTimes) {
		let isTimeAvailable = true;

		// Alternativt, för tydligare läsning:
		const timeToIndex = (timeStr) => {
			const [hours, minutes] = timeStr.split(':').map(Number);
			const intervalsPerHour = 4;
			return hours * intervalsPerHour * 15 + minutes;
		};

		const startIndex = timeToIndex(time);
		const intervalsNeeded = durationHours * 4;

		// Check canoes if requested
		if (addons.amountCanoes > 0) {
			const { data: maxCanoes } = await supabase
				.from('addons')
				.select('max_quantity')
				.eq('id', 1)
				.single();

			if (!maxCanoes || addons.amountCanoes > maxCanoes.max_quantity) {
				isTimeAvailable = false;
				continue;
			}

			const { data: canoeAvail } = await supabase
				.from('canoe_availability')
				.select('*')
				.eq('date', date)
				.single();

			if (canoeAvail) {
				const endIndex = startIndex + intervalsNeeded;
				for (let i = startIndex; i < endIndex; i++) {
					const columnName = i.toString();
					const booked = Math.abs(canoeAvail[columnName] || 0);
					console.log(
						`Checking canoes at ${time}, interval ${i}, booked: ${booked}, requesting: ${addons.amountCanoes}, max: ${maxCanoes.max_quantity}`
					);

					if (booked + addons.amountCanoes > maxCanoes.max_quantity) {
						console.log(
							`Not available: Would exceed max canoes (${booked} + ${addons.amountCanoes} > ${maxCanoes.max_quantity})`
						);
						isTimeAvailable = false;
						break;
					}
				}
			}
		}

		// Check kayaks if requested
		if (isTimeAvailable && addons.amountKayaks > 0) {
			const { data: maxKayaks } = await supabase
				.from('addons')
				.select('max_quantity')
				.eq('id', 2)
				.single();

			if (!maxKayaks || addons.amountKayaks > maxKayaks.max_quantity) {
				console.log(
					`Not available: Requested kayaks (${addons.amountKayaks}) exceeds max (${maxKayaks?.max_quantity})`
				);
				isTimeAvailable = false;
				continue;
			}

			const { data: kayakAvail } = await supabase
				.from('kayak_availability')
				.select('*')
				.eq('date', date)
				.single();

			if (kayakAvail) {
				const endIndex = startIndex + intervalsNeeded;
				for (let i = startIndex; i < endIndex; i++) {
					const columnName = i.toString();
					const booked = Math.abs(kayakAvail[columnName] || 0);
					console.log(
						`Checking kayaks at ${time}, interval ${i}, booked: ${booked}, requesting: ${addons.amountKayaks}, max: ${maxKayaks.max_quantity}`
					);

					if (booked + addons.amountKayaks > maxKayaks.max_quantity) {
						console.log(
							`Not available: Would exceed max kayaks (${booked} + ${addons.amountKayaks} > ${maxKayaks.max_quantity})`
						);
						isTimeAvailable = false;
						break;
					}
				}
			}
		}

		// Check SUPs if requested
		if (isTimeAvailable && addons.amountSUPs > 0) {
			const { data: maxSUPs } = await supabase
				.from('addons')
				.select('max_quantity')
				.eq('id', 3)
				.single();

			if (!maxSUPs || addons.amountSUPs > maxSUPs.max_quantity) {
				console.log(
					`Not available: Requested SUPs (${addons.amountSUPs}) exceeds max (${maxSUPs?.max_quantity})`
				);
				isTimeAvailable = false;
				continue;
			}

			const { data: supAvail } = await supabase
				.from('sup_availability')
				.select('*')
				.eq('date', date)
				.single();

			if (supAvail) {
				const endIndex = startIndex + intervalsNeeded;
				for (let i = startIndex; i < endIndex; i++) {
					const columnName = i.toString();
					const booked = Math.abs(supAvail[columnName] || 0);
					console.log(
						`Checking SUPs at ${time}, interval ${i}, booked: ${booked}, requesting: ${addons.amountSUPs}, max: ${maxSUPs.max_quantity}`
					);

					if (booked + addons.amountSUPs > maxSUPs.max_quantity) {
						console.log(
							`Not available: Would exceed max SUPs (${booked} + ${addons.amountSUPs} > ${maxSUPs.max_quantity})`
						);
						isTimeAvailable = false;
						break;
					}
				}
			}
		}

		if (isTimeAvailable) {
			console.log(`Time ${time} is available for booking`);
			availableTimes.push(time);
		} else {
			console.log(`Time ${time} is NOT available for booking`);
		}
	}

	return availableTimes;
}
