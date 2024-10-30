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

	// Generate possible start times at 30-minute intervals
	while (currentTime < endTime) {
		possibleTimes.push(currentTime.toTimeString().slice(0, 5));
		currentTime.setMinutes(currentTime.getMinutes() + 30);
	}

	const availableTimes = [];
	for (const time of possibleTimes) {
		let isTimeAvailable = true;

		const getTimeIndices = (timeStr) => {
			const [hours, minutes] = timeStr.split(':').map(Number);
			const totalMinutes = hours * 60 + minutes;
			return totalMinutes.toString(); // Returns e.g. "600" for 10:00
		};

		const startIndex = parseInt(getTimeIndices(time));
		const intervalsNeeded = durationHours * 4; // 4 fifteen-minute intervals per hour
		const endIndex = startIndex + intervalsNeeded * 15;

		// Check canoes if requested
		if (addons.amountCanoes > 0) {
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

			// Check if requested amount exceeds max capacity
			if (addons.amountCanoes > maxCanoes.max_quantity) {
				console.log(
					`Requested canoes (${addons.amountCanoes}) exceeds maximum capacity (${maxCanoes.max_quantity})`
				);
				isTimeAvailable = false;
				continue;
			}

			const { data: canoeAvail } = await supabaseAdmin
				.from('canoe_availability')
				.select('*')
				.eq('date', date)
				.single();

			if (canoeAvail) {
				for (let i = startIndex; i < endIndex; i += 15) {
					// Step by 15 for each 15-minute interval
					const columnName = i.toString();
					const booked = Math.abs(canoeAvail[columnName] || 0);
					const available = maxCanoes.max_quantity - booked;

					console.log(`Checking canoes at ${time}, interval ${i}:
                        - Currently booked: ${booked}
                        - Max capacity: ${maxCanoes.max_quantity}
                        - Available: ${available}
                        - Requested: ${addons.amountCanoes}`);

					if (available < addons.amountCanoes) {
						console.log(
							`Not enough canoes available (need ${addons.amountCanoes}, only ${available} available)`
						);
						isTimeAvailable = false;
						break;
					}
				}
			} else {
				console.error('No availability data found for canoes on this date');
				isTimeAvailable = false;
			}
		}

		// Check kayaks if requested
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

			if (addons.amountKayaks > maxKayaks.max_quantity) {
				console.log(
					`Requested kayaks (${addons.amountKayaks}) exceeds maximum capacity (${maxKayaks.max_quantity})`
				);
				isTimeAvailable = false;
				continue;
			}

			const { data: kayakAvail } = await supabaseAdmin
				.from('kayak_availability')
				.select('*')
				.eq('date', date)
				.single();

			if (kayakAvail) {
				for (let i = startIndex; i < endIndex; i += 15) {
					const columnName = i.toString();
					const booked = Math.abs(kayakAvail[columnName] || 0);
					const available = maxKayaks.max_quantity - booked;

					console.log(`Checking kayaks at ${time}, interval ${i}:
                        - Currently booked: ${booked}
                        - Max capacity: ${maxKayaks.max_quantity}
                        - Available: ${available}
                        - Requested: ${addons.amountKayaks}`);

					if (available < addons.amountKayaks) {
						console.log(
							`Not enough kayaks available (need ${addons.amountKayaks}, only ${available} available)`
						);
						isTimeAvailable = false;
						break;
					}
				}
			} else {
				console.error('No availability data found for kayaks on this date');
				isTimeAvailable = false;
			}
		}

		// Check SUPs if requested
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

			if (addons.amountSUPs > maxSUPs.max_quantity) {
				console.log(
					`Requested SUPs (${addons.amountSUPs}) exceeds maximum capacity (${maxSUPs.max_quantity})`
				);
				isTimeAvailable = false;
				continue;
			}

			const { data: supAvail } = await supabaseAdmin
				.from('sup_availability')
				.select('*')
				.eq('date', date)
				.single();

			if (supAvail) {
				for (let i = startIndex; i < endIndex; i += 15) {
					const columnName = i.toString();
					const booked = Math.abs(supAvail[columnName] || 0);
					const available = maxSUPs.max_quantity - booked;

					console.log(`Checking SUPs at ${time}, interval ${i}:
                        - Currently booked: ${booked}
                        - Max capacity: ${maxSUPs.max_quantity}
                        - Available: ${available}
                        - Requested: ${addons.amountSUPs}`);

					if (available < addons.amountSUPs) {
						console.log(
							`Not enough SUPs available (need ${addons.amountSUPs}, only ${available} available)`
						);
						isTimeAvailable = false;
						break;
					}
				}
			} else {
				console.error('No availability data found for SUPs on this date');
				isTimeAvailable = false;
			}
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
