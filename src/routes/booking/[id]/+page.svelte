<script>
	import flatpickr from 'flatpickr';
	import 'flatpickr/dist/flatpickr.css';
	import { onMount } from 'svelte';

	export let data;

	let blockedDates = [];
	let startDate = null;
	let minDate = null;
	let maxDate = null;

	// Starttiderna
	let startTime = null;
	let possibleStartTimes = [];
	let selectedBookingLength = null;

	// Beräkna returdatum och retur-tid
	let returnDate = null;
	let returnTime = null; // Lägg till en variabel för att hantera retur-tiden

	// Funktion för att generera starttider baserat på öppettider och bokningslängd
	function generateStartTimes() {
		console.log('Generating start times...');

		if (!data.openHours || !data.openHours.open_time || !data.openHours.close_time) {
			console.error('Open hours data is missing or incomplete');
			return []; // Om öppettider inte finns, returnera tom lista
		}

		// Kontrollera att startdatum är satt
		if (!startDate) {
			console.error('Start date is not set');
			return [];
		}

		// Skapa öppnings- och stängningstider för valt datum
		const openTime = new Date(`${startDate}T${data.openHours.open_time}`);
		const closeTime = new Date(`${startDate}T${data.openHours.close_time}`);

		if (isNaN(openTime.getTime()) || isNaN(closeTime.getTime())) {
			console.error('Invalid open or close time', openTime, closeTime);
			return []; // Om tiderna är ogiltiga, returnera tom lista
		}

		console.log('Open time:', openTime);
		console.log('Close time:', closeTime);

		let currentTime = new Date(openTime);
		const startTimes = [];

		while (currentTime <= closeTime) {
			startTimes.push(currentTime.toTimeString().substring(0, 5)); // Format HH:mm
			currentTime.setMinutes(currentTime.getMinutes() + 30); // Öka tiden med 30 minuter
		}

		console.log('Generated start times:', startTimes);

		const bookingLengthHours = selectedBookingLength ? parseInt(selectedBookingLength) : 0;
		const latestStartTime = new Date(closeTime);
		latestStartTime.setHours(latestStartTime.getHours() - bookingLengthHours);

		console.log('Latest possible start time:', latestStartTime);

		const validStartTimes = startTimes.filter((time) => {
			const timeDate = new Date(`${startDate}T${time}`);
			return timeDate <= latestStartTime;
		});

		console.log('Valid start times:', validStartTimes);
		return validStartTimes;
	}

	// Funktion för att hantera bokningslängd och beräkna returdatum och tid
	function calculateReturnDate() {
		console.log('Calculating return date...'); // Lägg till för att se om funktionen körs
		if (selectedBookingLength && startTime) {
			const bookingLength = data.bookingLengths.find(
				(length) => length.length === selectedBookingLength
			);

			if (bookingLength) {
				// Om det är en övernattningsbokning
				if (bookingLength.overnight) {
					const selectedDate = new Date(startDate);
					selectedDate.setDate(selectedDate.getDate() + bookingLength.return_day_offset);
					returnDate = selectedDate.toISOString().split('T')[0]; // Sätt returdatum som en sträng i Y-m-d format
					returnTime = data.openHours.close_time; // Retur innan stängningstid
				} else if (bookingLength.length === 'hela dagen') {
					// Om det är en "hela dagen"-bokning, retur innan stängning
					returnDate = startDate; // Samma dag som bokningsstart
					returnTime = data.openHours.close_time; // Retur innan stängningstid
				} else {
					// För kortare bokningar (t.ex. 2 timmar, 3 timmar etc.)
					const selectedDate = new Date(startDate + ' ' + startTime); // Kombinera startdatum och starttid
					selectedDate.setHours(selectedDate.getHours() + parseInt(bookingLength.length)); // Lägg till bokningslängden till starttiden

					returnDate = selectedDate.toISOString().split('T')[0]; // Sätt returdatum (samma dag)
					returnTime = selectedDate.toTimeString().substring(0, 5); // Retur-tid i "HH:mm" format
				}
			}
		}
	}

	// Generera starttider och beräkna returdatum när ett datum och bokningslängd är valt
	$: if (startDate && selectedBookingLength) {
		console.log('StartDate:', startDate);
		console.log('SelectedBookingLength:', selectedBookingLength);
		possibleStartTimes = generateStartTimes();
		console.log('Possible start times:', possibleStartTimes);
	}

	$: if (startDate && startTime && selectedBookingLength) {
		calculateReturnDate(); // Beräkna returdatum och retur-tid
	}

	onMount(() => {
		const today = new Date(); // Dagens datum

		// Kontrollera om data.openHours existerar och har start- och slutdatum
		if (data.openHours && data.openHours.start_date && data.openHours.end_date) {
			const dbMinDate = new Date(data.openHours.start_date);
			minDate = dbMinDate > today ? dbMinDate : today; // Välj det senare av dagens datum och startdatum från DB
			maxDate = new Date(data.openHours.end_date);
		}

		// Kontrollera om blocked_dates existerar innan vi försöker använda den
		if (data.blocked_dates) {
			blockedDates = data.blocked_dates.map((blocked) => new Date(blocked.blocked_date));
		}

		// Initiera kalendern med Flatpickr
		flatpickr('#booking-calendar', {
			disableMobile: 'true',
			minDate: minDate, // Det senare datumet mellan idag och DB:s startdatum
			maxDate: maxDate, // Sätt slutdatum från experience_availability
			disable: blockedDates, // Blockera specifika datum
			dateFormat: 'Y-m-d',
			onChange: (selectedDates, dateStr) => {
				startDate = dateStr;
				console.log('Selected Date:', dateStr); // Kontrollera att datumet väljs korrekt
			}
		});
	});
</script>

{#if data.experience}
	<h1>{data.experience.name}</h1>

	<label>Välj bokningslängd:</label>
	<select bind:value={selectedBookingLength}>
		<option value="" disabled selected>Välj längd</option>
		{#each data.bookingLengths as duration}
			<option value={duration.length}>{duration.length}</option>
		{/each}
	</select>

	<!-- Kalender för att välja datum -->
	<label>Välj datum:</label>
	<input id="booking-calendar" type="text" placeholder="Välj datum" />

	{#if startDate && selectedBookingLength}
		<p>Valt datum: {startDate}</p>

		<!-- Visa de genererade starttiderna -->
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

		<!-- Visa vald starttid och beräkna returdatum när en starttid är vald -->
		{#if startTime}
			<p>Vald starttid: {startTime}</p>
			<!-- Visa returdatum och retur-tid -->
			{#if returnDate && returnTime}
				<p>Returdatum: {returnDate}</p>
				<p>Returtid: {returnTime}</p>
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

	<label>Välj startplats:</label>
	<select>
		{#each data.startLocations as location}
			<option>{location.location} - {location.price}kr</option>
		{/each}
	</select>
{:else}
	<p>Upplevelsen hittades inte</p>
{/if}
