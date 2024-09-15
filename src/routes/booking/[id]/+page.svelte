<script>
	export let data;
</script>

{#if data.experience}
	<h1>{data.experience.name}</h1>

	<label>Välj tillval:</label>
	<select>
		{#each data.addons as addon}
			<option value={addon.id}>{addon.name}</option>
		{/each}
	</select>
	<label>Välj startplats:</label>
	<select>
		{#each data.startLocations as location}
			<option>{location.location} - {location.price}kr</option>
		{/each}
	</select>
{:else}
	<p>Upplevelsen hittades inte</p>
{/if}
