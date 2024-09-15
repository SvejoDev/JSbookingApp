<script>
	export let data;
</script>

{#if data.experience}
	<h1>{data.experience.name}</h1>

	<h2>Tillval</h2>
	{#if data.addons.length > 0}
		<ul>
			{#each data.addons as addon}
				<li>{addon.name}</li>
			{/each}
		</ul>
	{:else}
		<p>Inga tillval tillgängliga för denna upplevelse</p>
	{/if}
{:else}
	<p>Upplevelsen hittades inte</p>
{/if}
