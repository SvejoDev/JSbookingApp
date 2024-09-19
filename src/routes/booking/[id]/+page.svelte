<script>
	// Importera Flatpickr för kalenderhantering och dess CSS-stilar
	import flatpickr from 'flatpickr';
	import 'flatpickr/dist/flatpickr.css';
	import { onMount } from 'svelte';

	// Data som skickas från servern
	export let data;

	// Variabler för kalender och val
	let blockedDates = []; // Datum som ska blockeras i kalendern
	let startDate = null; // Vald startdatum
	let minDate = null; // Lägsta tillåtna datum för bokning
	let maxDate = null; // Högsta tillåtna datum för bokning

	// Variabler för starttider och bokningslängd
	let startTime = null; // Vald starttid
	let possibleStartTimes = []; // Tillgängliga starttider
	let selectedBookingLength = null; // Vald bokningslängd

	// Variabler för returdatum och returtid
	let returnDate = null; // Beräknat returdatum
	let returnTime = null; // Beräknad returtid

	/**
	 * Generera starttider baserat på öppettider och vald bokningslängd.
	 * Starttider skapas varje halvtimme från öppettiden, men slutar
	 * tidigare om bokningslängden går över stängningstiden.
	 */
	function generateStartTimes() {
		console.log('Generating start times...');

		// Kontrollera att öppettider finns innan vi fortsätter
		if (!data.openHours || !data.openHours.open_time || !data.openHours.close_time) {
			console.error('Open hours data is missing or incomplete');
			return []; // Returnera tom lista om öppettider saknas
		}

		// Konvertera öppettider till Date-objekt
		const openTime = new Date(`${startDate}T${data.openHours.open_time}`);
		const closeTime = new Date(`${startDate}T${data.openHours.close_time}`);

		if (isNaN(openTime.getTime()) || isNaN(closeTime.getTime())) {
			console.error('Invalid open or close time', openTime, closeTime);
			return []; // Returnera tom lista om tiderna är ogiltiga
		}

		console.log('Open time:', openTime);
		console.log('Close time:', closeTime);

		// Generera starttider var 30:e minut mellan öppet- och stängningstid
		const startTimes = [];
		let currentTime = new Date(openTime);
		while (currentTime <= closeTime) {
			startTimes.push(currentTime.toTimeString().substring(0, 5)); // Format HH:mm
			currentTime.setMinutes(currentTime.getMinutes() + 30); // Öka med 30 minuter
		}

		console.log('Generated start times:', startTimes);

		// Hämta vald bokningslängd
		const bookingLength = data.bookingLengths.find((b) => b.length === selectedBookingLength);
		let latestStartTime = new Date(closeTime); // Standardvärde är stängningstid

		// Justera sista tillåtna starttid baserat på bokningslängd om den inte är "Hela dagen"
		if (bookingLength && !bookingLength.overnight && bookingLength.length !== 'Hela dagen') {
			latestStartTime.setHours(latestStartTime.getHours() - parseInt(bookingLength.length));
		}

		console.log('Latest possible start time:', latestStartTime);

		// Filtrera starttider för att säkerställa att de inte är för sena för bokningslängden
		const validStartTimes = startTimes.filter((time) => {
			const timeDate = new Date(`${startDate}T${time}`);
			return timeDate <= latestStartTime;
		});

		console.log('Valid start times:', validStartTimes);
		return validStartTimes;
	}

	/**
	 * Beräkna returdatum och returtid baserat på vald starttid och bokningslängd.
	 * Hanterar olika scenarier beroende på om bokningen är över natten eller specifik tidslängd.
	 */
	function calculateReturnDate() {
		if (!selectedBookingLength || !startTime || !startDate) {
			console.error('Missing data for calculating return date.');
			return; // Avsluta om viktig data saknas
		}

		// Hämta vald bokningslängd från datan
		const bookingLength = data.bookingLengths.find((b) => b.length === selectedBookingLength);
		if (!bookingLength) {
			console.error('Booking length data is missing');
			return;
		}

		// Skapa ett Date-objekt för starttiden
		const startDateTime = new Date(`${startDate}T${startTime}`);
		if (isNaN(startDateTime.getTime())) {
			console.error('Invalid start date or time');
			return; // Avsluta om starttid eller datum är ogiltiga
		}

		let returnDateTime = new Date(startDateTime); // Initiera returdatum med starttid

		// Hantera bokningslängder som går över natten
		if (bookingLength.overnight) {
			returnDateTime.setDate(returnDateTime.getDate() + bookingLength.return_day_offset);

			// Använd stängningstiden från databasen som retur-tid nästa dag
			const closeTimeParts = data.openHours.close_time.split(':');
			returnDateTime.setHours(parseInt(closeTimeParts[0]), parseInt(closeTimeParts[1]), 0, 0);
		}
		// Hantera bokningslängder för hela dagen
		else if (bookingLength.length === 'Hela dagen') {
			// Sätt retur-tid till stängningstiden från databasen samma dag
			const closeTimeParts = data.openHours.close_time.split(':');
			returnDateTime.setHours(parseInt(closeTimeParts[0]), parseInt(closeTimeParts[1]), 0, 0);
		}
		// Hantera specifika bokningslängder i timmar
		else {
			const hoursToAdd = parseInt(bookingLength.length);
			returnDateTime.setHours(returnDateTime.getHours() + hoursToAdd);

			// Om returtiden går över stängningstiden, justera retur-tid till stängningstiden
			const closeTime = new Date(`${startDate}T${data.openHours.close_time}`);
			if (returnDateTime > closeTime) {
				returnDateTime = closeTime;
			}
		}

		// Sätt returdatum och returtid som ISO-sträng och HH:mm-format
		returnDate = returnDateTime.toISOString().split('T')[0];
		returnTime = returnDateTime.toTimeString().substring(0, 5);

		console.log('Return date:', returnDate, 'Return time:', returnTime);
	}

	// Uppdatera tillgängliga starttider och beräkna returdatum när startdatum och bokningslängd är valda
	$: if (startDate && selectedBookingLength) {
		console.log('StartDate:', startDate);
		console.log('SelectedBookingLength:', selectedBookingLength);
		possibleStartTimes = generateStartTimes(); // Generera starttider
		console.log('Possible start times:', possibleStartTimes);
	}

	// Uppdatera returdatum och returtid när både starttid och bokningslängd är valda
	$: if (startDate && startTime && selectedBookingLength) {
		calculateReturnDate(); // Beräkna returdatum och returtid
	}

	// Funktion för att sortera bokningslängderna
	function sortBookingLengths(bookingLengths) {
		return bookingLengths.sort((a, b) => {
			// Om a och b är timmar (Xh)
			if (a.length.includes('h') && b.length.includes('h')) {
				return parseInt(a.length) - parseInt(b.length); // Sortera timmar stigande
			}

			// Om a är timmar men b inte är det
			if (a.length.includes('h')) return -1;

			// Om b är timmar men a inte är det
			if (b.length.includes('h')) return 1;

			// Om en av dem är "Hela dagen", prioritera den efter timmar
			if (a.length === 'Hela dagen') return -1;
			if (b.length === 'Hela dagen') return 1;

			// Om vi kommer hit är det övernattningar eller andra textbaserade längder
			return 0;
		});
	} // Sortera bokningslängderna när komponenten laddas
	let sortedBookingLengths = sortBookingLengths(data.bookingLengths);

	// Initiera kalender med Flatpickr vid komponentens mount
	onMount(() => {
		const today = new Date(); // Dagens datum

		// Sätt minsta och största tillåtna datum baserat på öppettider
		if (data.openHours && data.openHours.start_date && data.openHours.end_date) {
			const dbMinDate = new Date(data.openHours.start_date);
			minDate = dbMinDate > today ? dbMinDate : today; // Välj det senare av dagens datum och startdatum från DB
			maxDate = new Date(data.openHours.end_date);
		}

		// Konvertera blockerade datum till Date-objekt
		if (data.blocked_dates) {
			blockedDates = data.blocked_dates.map((blocked) => new Date(blocked.blocked_date));
		}

		// Initiera Flatpickr-kalendern
		flatpickr('#booking-calendar', {
			disableMobile: 'true',
			minDate: minDate, // Sätt minimidatum
			maxDate: maxDate, // Sätt maximidatum
			disable: blockedDates, // Blockera specifika datum
			dateFormat: 'Y-m-d', // Format för datum
			onChange: (selectedDates, dateStr) => {
				startDate = dateStr; // Sätt valt datum
				console.log('Selected Date:', dateStr); // Logga valt datum
			}
		});
	});
</script>

{#if data.experience}
	<h1>{data.experience.name}</h1>

	<!-- Bokningslängd -->
	<label>Välj bokningslängd:</label>
	<select bind:value={selectedBookingLength}>
		<option value="" disabled selected>Välj längd</option>
		{#each sortedBookingLengths as duration}
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

		<!-- Visa vald starttid och returdatum -->
		{#if startTime}
			<p>Vald starttid: {startTime}</p>
			{#if returnDate && returnTime}
				<p>Returdatum: {returnDate}</p>
				<p>Returtid: {returnTime}</p>
			{/if}
		{/if}
	{/if}

	<!-- Tillval -->
	<label>Välj tillval:</label>
	{#each data.experienceAddons as addon}
		<div>
			<label>{addon.addons.name}:</label>
			<input type="number" min="0" max={addon.addons.max_quantity} bind:value={addon.quantity} />
		</div>
	{/each}

	<!-- Startplats -->
	<label>Välj startplats:</label>
	<select>
		{#each data.startLocations as location}
			<option>{location.location} - {location.price}kr</option>
		{/each}
	</select>
{:else}
	<p>Upplevelsen hittades inte</p>
{/if}
