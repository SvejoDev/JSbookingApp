<script>
	import flatpickr from 'flatpickr';
	import 'flatpickr/dist/flatpickr.css';
	import { onMount } from 'svelte';

	export let data;

	let blockedDates = [];
	let startDate = null;

	onMount(() => {
		// Omvandla blocked_dates till en lista av Date-objekt
		blockedDates = data.blocked_dates.map((blocked) => new Date(blocked.blocked_date));

		console.log(blockedDates); // Kontrollera att blockeringen fungerar som den ska

		flatpickr('#booking-calendar', {
			disableMobile: 'true',
			minDate: 'today', // Sätter minimalt valbart datum till idag
			dateFormat: 'Y-m-d',
			disable: blockedDates, // Blockerade datum
			mode: 'single', // Kan även vara "range" för att tillåta flerdagsbokning
			onChange: (selectedDates, dateStr) => {
				startDate = dateStr;
				console.log('Valt datum:', dateStr);
			}
		});
	});
</script>

{#if data.experience}
	<h1>{data.experience.name}</h1>

	<label>Välj tillval:</label>
	<select>
		{#each data.addons as addon}
			<option>{addon.name}</option>
		{/each}
	</select>

	<label>Välj startplats:</label>
	<select>
		{#each data.startLocations as location}
			<option>{location.location} - {location.price}kr</option>
		{/each}
	</select>

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
{:else}
	<p>Upplevelsen hittades inte</p>
{/if}
