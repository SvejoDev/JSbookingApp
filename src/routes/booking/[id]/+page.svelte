<script>
	import flatpickr from 'flatpickr';
	import 'flatpickr/dist/flatpickr.css';
	import { onMount } from 'svelte';

	export let data;

	console.log(data.experience.id);

	//Addon variabler
	let amountCanoes = 0;
	let amountKayaks = 0;
	let amountSUPs = 0;

	let blockedDates = [];
	let startDate = null;
	let minDate = null;
	let maxDate = null;
	let startTime = null;
	let possibleStartTimes = [];
	let selectedBookingLength = null;
	let returnDate = null;
	let returnTime = null;
	let selectedStartLocation = null;
	let numAdults = 0;
	let numChildren = 0;
	let totalPrice = 0;

	//Kunduppgifter:
	let userName = '';
	let userLastname = '';
	let userPhone = '';
	let userEmail = '';
	let userComment = '';
	let acceptTerms = false;

	// Genererar möjliga starttider baserat på öppettider och vald bokningslängd
	function generateStartTimes() {
		if (!data.openHours || !data.openHours.open_time || !data.openHours.close_time) {
			console.error('Data för öppettider saknas eller är ofullständig');
			return [];
		}

		const openTime = new Date(`${startDate}T${data.openHours.open_time}`);
		const closeTime = new Date(`${startDate}T${data.openHours.close_time}`);

		if (isNaN(openTime.getTime()) || isNaN(closeTime.getTime())) {
			console.error('Ogiltig öppnings- eller stängningstid', openTime, closeTime);
			return [];
		}

		const startTimes = [];
		let currentTime = new Date(openTime);
		while (currentTime <= closeTime) {
			startTimes.push(currentTime.toTimeString().substring(0, 5));
			currentTime.setMinutes(currentTime.getMinutes() + 30);
		}

		const bookingLength = data.bookingLengths.find((b) => b.length === selectedBookingLength);
		let latestStartTime = new Date(closeTime);

		if (bookingLength && !bookingLength.overnight && bookingLength.length !== 'Hela dagen') {
			latestStartTime.setHours(latestStartTime.getHours() - parseInt(bookingLength.length));
		}

		// Filter out blocked start times
		const blockedStartTimes = data.blocked_start_times.filter(
			(blockedTime) => blockedTime.blocked_date === startDate
		);

		return startTimes.filter((time) => {
			const timeDate = new Date(`${startDate}T${time}`);
			const isNotBlocked = !blockedStartTimes.some(
				(blockedTime) => blockedTime.blocked_time.substring(0, 5) === time
			);
			return timeDate <= latestStartTime && isNotBlocked;
		});
	}

	// Beräknar returdatum och returtid baserat på vald starttid och bokningslängd
	function calculateReturnDate() {
		if (!selectedBookingLength || !startTime || !startDate) {
			console.error('Data saknas för att beräkna returdatum.');
			return;
		}

		const bookingLength = data.bookingLengths.find((b) => b.length === selectedBookingLength);
		if (!bookingLength) {
			console.error('Data för bokningslängd saknas');
			return;
		}

		const startDateTime = new Date(`${startDate}T${startTime}`);
		if (isNaN(startDateTime.getTime())) {
			console.error('Ogiltigt startdatum eller starttid');
			return;
		}

		let returnDateTime = new Date(startDateTime);

		if (bookingLength.overnight) {
			returnDateTime.setDate(returnDateTime.getDate() + bookingLength.return_day_offset);
			const closeTimeParts = data.openHours.close_time.split(':');
			returnDateTime.setHours(parseInt(closeTimeParts[0]), parseInt(closeTimeParts[1]), 0, 0);
		} else if (bookingLength.length === 'Hela dagen') {
			const closeTimeParts = data.openHours.close_time.split(':');
			returnDateTime.setHours(parseInt(closeTimeParts[0]), parseInt(closeTimeParts[1]), 0, 0);
		} else {
			const hoursToAdd = parseInt(bookingLength.length);
			returnDateTime.setHours(returnDateTime.getHours() + hoursToAdd);

			const closeTime = new Date(`${startDate}T${data.openHours.close_time}`);
			if (returnDateTime > closeTime) {
				returnDateTime = closeTime;
			}
		}

		returnDate = returnDateTime.toISOString().split('T')[0];
		returnTime = returnDateTime.toTimeString().substring(0, 5);
	}

	// Sorterar bokningslängder baserat på varaktighet och typ
	function sortBookingLengths(bookingLengths) {
		return bookingLengths.sort((a, b) => {
			if (a.length.includes('h') && b.length.includes('h')) {
				return parseInt(a.length) - parseInt(b.length);
			}
			if (a.length.includes('h')) return -1;
			if (b.length.includes('h')) return 1;
			if (a.length === 'Hela dagen') return -1;
			if (b.length === 'Hela dagen') return 1;
			return 0;
		});
	}

	let sortedBookingLengths = [];

	$: if (selectedStartLocation) {
		sortedBookingLengths = sortBookingLengths(
			data.bookingLengths.filter((bl) => bl.location_id == selectedStartLocation)
		);
	} else {
		sortedBookingLengths = [];
	}

	onMount(() => {
		const today = new Date();

		if (data.openHours && data.openHours.start_date && data.openHours.end_date) {
			const dbMinDate = new Date(data.openHours.start_date);
			minDate = dbMinDate > today ? dbMinDate : today;
			maxDate = new Date(data.openHours.end_date);
		}

		if (data.blocked_dates) {
			blockedDates = data.blocked_dates.map((blocked) => new Date(blocked.blocked_date));
		}

		// Initierar Flatpickr-kalendern med anpassade inställningar
		flatpickr('#booking-calendar', {
			disableMobile: 'true',
			minDate: minDate,
			maxDate: maxDate,
			disable: blockedDates,
			dateFormat: 'Y-m-d',
			onChange: (selectedDates, dateStr) => {
				startDate = dateStr;
			}
		});
	});

	function updatePrice() {
		if (selectedStartLocation && data.startLocations) {
			const selectedLocation = data.startLocations.find(
				(location) => location.id === selectedStartLocation
			);
			if (selectedLocation) {
				totalPrice = numAdults * selectedLocation.price;
			} else {
				console.error('Vald startplats hittades inte');
				totalPrice = 0;
			}
		} else {
			totalPrice = 0;
		}
	}
	$: {
		if (selectedStartLocation || numAdults) {
			updatePrice();
		}
	}

	$: if (startDate && selectedBookingLength) {
		possibleStartTimes = generateStartTimes();
	}

	$: if (startDate && startTime && selectedBookingLength) {
		calculateReturnDate();
	}

	//Stripe

	import { loadStripe } from '@stripe/stripe-js';

	let stripePromise;

	onMount(async () => {
		stripePromise = await loadStripe(
			'pk_test_51Q3N7cP8OFkPaMUNpmkTh09dCDHBxYz4xWIC15fBXB4UerJpV9qXhX5PhT0f1wxwdcGVlenqQaKw0m6GpKUZB0jj00HBzDqWig'
		);
	});

	async function handleCheckout() {
		try {
			const stripe = await stripePromise;
			console.log('Sending request to create-checkout-session...');

			// Log the data being sent
			const requestData = {
				amount: totalPrice,
				name: data.experience.name,
				experience_id: data.experience.id,
				start_date: startDate,
				start_time: startTime,
				end_date: returnDate,
				end_time: returnTime,
				number_of_adults: numAdults,
				number_of_children: numChildren,
				amount_canoes: amountCanoes,
				amount_kayak: amountKayaks,
				amount_SUP: amountSUPs,
				booking_name: userName,
				booking_lastname: userLastname,
				customer_comment: userComment
			};
			console.log('Request Data:', requestData);

			const response = await fetch('/api/create-checkout-session', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestData)
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error('Server response:', response.status, errorText);
				throw new Error(`Server error: ${response.status} ${errorText}`);
			}

			const session = await response.json();
			console.log('Received session:', session);

			if (!session.id) {
				throw new Error('Invalid session data received from server');
			}

			const result = await stripe.redirectToCheckout({
				sessionId: session.id
			});

			if (result.error) {
				console.error('Stripe redirect error:', result.error);
				throw new Error(result.error.message);
			}
		} catch (error) {
			console.error('Checkout error:', error);
			// Here you might want to show an error message to the user
		}
	}
</script>

{#if data.experience}
	<h1>{data.experience.name}</h1>

	<label>Välj startplats:</label>
	<select bind:value={selectedStartLocation} on:change={updatePrice}>
		{#each data.startLocations as location}
			<option value={location.id}>{location.location} - {location.price}kr</option>
		{/each}
	</select>

	<label>Välj bokningslängd:</label>
	<select bind:value={selectedBookingLength}>
		<option value="" disabled selected>Välj längd</option>
		{#each sortedBookingLengths as duration}
			<option value={duration.length}>{duration.length}</option>
		{/each}
	</select>

	<label>Välj datum:</label>
	<input id="booking-calendar" type="text" placeholder="Välj datum" />

	{#if startDate && selectedBookingLength}
		<p>Valt datum: {startDate}</p>

		{#if possibleStartTimes.length > 0}
			<label>Välj starttid:</label>
			<select bind:value={startTime}>
				<option value="" disabled selected>Välj en starttid</option>
				{#each possibleStartTimes as time}
					<option value={time}>{time}</option>
				{/each}
			</select>
		{:else}
			<p>Inga tillgängliga starttider.</p>
		{/if}

		{#if startTime}
			<p>Vald starttid: {startTime}</p>
			{#if returnDate && returnTime}
				<p>Returdatum: {returnDate}</p>
				<p>Returtid senast: {returnTime}</p>
			{/if}
		{/if}
	{/if}

	<label>Välj tillval:</label>
	<div>
		<label>Antal kanadensare:</label>
		<input type="number" min="0" bind:value={amountCanoes} />
	</div>
	<div>
		<label>Antal kajaker:</label>
		<input type="number" min="0" bind:value={amountKayaks} />
	</div>
	<div>
		<label>Antal SUP:ar:</label>
		<input type="number" min="0" bind:value={amountSUPs} />
	</div>

	{#if selectedStartLocation}
		<label>Antal vuxna:</label>
		<input type="number" min="0" bind:value={numAdults} />

		<label>Antal barn (gratis):</label>
		<input type="number" min="0" bind:value={numChildren} />

		<p>Totalt pris: {totalPrice}kr</p>
	{/if}
	{#if selectedStartLocation && startDate && startTime && selectedBookingLength}
		<h2>Kontaktuppgifter</h2>
		<label>Förnamn:</label>
		<input type="text" bind:value={userName} required />

		<label>Efternamn:</label>
		<input type="text" bind:value={userLastname} required />

		<label>Telefonnummer:</label>
		<input type="tel" bind:value={userPhone} pattern="^\+?[1-9]\d{(1, 14)}$" required />

		<label>Epostadress:</label>
		<input type="email" bind:value={userEmail} required />

		<label>Kommentar (valfri):</label>
		<textarea bind:value={userComment}></textarea>

		<div>
			<input type="checkbox" bind:checked={acceptTerms} required />
			<label>I accept the booking agreement and the terms of purchase</label>
		</div>

		<button disabled={!acceptTerms} on:click={handleCheckout}>
			Go to payment ({totalPrice}kr)
		</button>
	{/if}
{:else}
	<p>Upplevelsen hittades inte</p>
{/if}
