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

	// Funktion för att generera starttider baserat på öppet- och stängningstider och bokningslängd
	function generateStartTimes() {
		const openTime = new Date();
		const closeTime = new Date();

		// Kontrollera att open_time och close_time existerar i data.openHours
		if (data.openHours) {
			openTime.setHours(
				data.openHours.open_time.split(':')[0],
				data.openHours.open_time.split(':')[1],
				0
			);
			closeTime.setHours(
				data.openHours.close_time.split(':')[0],
				data.openHours.close_time.split(':')[1],
				0
			);
		}

		const startTimes = [];
		let currentTime = new Date(openTime);

		// Beräkna den sista bokningsbara starttiden baserat på bokningslängden
		const bookingLengthHours = selectedBookingLength ? parseInt(selectedBookingLength) : 0;
		const latestStartTime = new Date(closeTime);
		latestStartTime.setHours(latestStartTime.getHours() - bookingLengthHours);

		// Generera tillgängliga starttider med 30-minutersintervaller
		while (currentTime <= latestStartTime) {
			startTimes.push(currentTime.toTimeString().substring(0, 5)); // Lägg till tiden i "HH:mm"-format
			currentTime.setMinutes(currentTime.getMinutes() + 30); // Öka tiden med 30 minuter
		}

		return startTimes;
	}

	// Generera starttider när ett datum och bokningslängd är valt
	$: if (startDate && selectedBookingLength) {
		possibleStartTimes = generateStartTimes();
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
				{#each possibleStartTimes as time}
					<option>{time}</option>
				{/each}
			</select>
		{:else}
			<p>Inga tillgängliga starttider.</p>
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
