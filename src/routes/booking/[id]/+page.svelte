<script>
	import flatpickr from 'flatpickr';
	import 'flatpickr/dist/flatpickr.css';
	import { onMount } from 'svelte';

	export let data;

	let blockedDates = [];
	let startDate = null;
	let minDate = null;
	let maxDate = null;

	onMount(() => {
		const today = new Date(); // Dagens datum

		// Konvertera openDates till Date-objekt
		if (data.openDates.start_date && data.openDates.end_date) {
			const dbMinDate = new Date(data.openDates.start_date);
			minDate = dbMinDate > today ? dbMinDate : today; // Välj det senare av dagens datum och startdatum från DB
			maxDate = new Date(data.openDates.end_date);
		}

		// Blockera datum som är i "blocked_dates"
		blockedDates = data.blocked_dates.map((blocked) => new Date(blocked.blocked_date));

		flatpickr('#booking-calendar', {
			disableMobile: 'true',

			minDate: minDate, // Det senare datumet mellan idag och DB's startdatum
			maxDate: maxDate, // Sätt slutdatum från experience_availability
			disable: blockedDates, // Blockera specifika datum
			dateFormat: 'Y-m-d',
			onChange: (selectedDates, dateStr) => {
				startDate = dateStr;
				console.log('Valt datum:', dateStr);
			}
		});
	});
</script>

{#if data.experience}
	<h1>{data.experience.name}</h1>

	<label>Välj bokningslängd:</label>
	<select>
		{#each data.bookingLengths as duration}
			<option>{duration.length}</option>
		{/each}
	</select>

	<!-- Kalender för att välja datum -->
	<label>Välj datum:</label>
	<input id="booking-calendar" type="text" placeholder="Välj datum" />

	{#if startDate}
		<p>Valt datum: {startDate}</p>
	{/if}

	<label>Välj tillval:</label>
	{#each data.experienceAddons as addon}
		<div>
			<label>{addon.addons.name}:</label>
			<!-- Accessing the name and max_quantity correctly -->
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
