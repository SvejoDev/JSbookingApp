<script>
	import flatpickr from 'flatpickr';
	import 'flatpickr/dist/flatpickr.css';
	import { onMount } from 'svelte';

	export let data;

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

		return startTimes.filter((time) => {
			const timeDate = new Date(`${startDate}T${time}`);
			return timeDate <= latestStartTime;
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

	// Uppdaterar totalpriset baserat på antal vuxna och vald startplats
	function updatePrice() {
		if (selectedStartLocation) {
			totalPrice = numAdults * selectedStartLocation;
		}
	}

	// Reaktiva uttalanden för att uppdatera starttider och returdatum
	$: if (startDate && selectedBookingLength) {
		possibleStartTimes = generateStartTimes();
	}

	$: if (startDate && startTime && selectedBookingLength) {
		calculateReturnDate();
	}
</script>

{#if data.experience}
	<h1>{data.experience.name}</h1>

	<label>Välj startplats:</label>
	<select bind:value={selectedStartLocation}>
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
	{#each data.experienceAddons as addon}
		<div>
			<label>{addon.addons.name}:</label>
			<input type="number" min="0" max={addon.addons.max_quantity} bind:value={addon.quantity} />
		</div>
	{/each}

	{#if selectedStartLocation}
		<label>Antal vuxna:</label>
		<input type="number" min="0" bind:value={numAdults} on:input={updatePrice} />

		<label>Antal barn (gratis):</label>
		<input type="number" min="0" bind:value={numChildren} />

		<p>Totalt pris: {totalPrice}kr</p>
	{/if}
{:else}
	<p>Upplevelsen hittades inte</p>
{/if}
