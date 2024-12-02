<!-- src/lib/components/calendar/CalendarDay.svelte -->
<script lang="ts">
	export let date: Date;
	export let isSelected: boolean = false;
	export let isToday: boolean = false;
	export let isOpen: boolean = false;
	export let isBlocked: boolean = false;
	export let isOutsideMonth: boolean = false;
	export let disabled: boolean = false;
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	function handleClick() {
		if (!disabled) {
			dispatch('select', date);
		}
	}
</script>

<button
	class="day"
	class:selected={isSelected}
	class:today={isToday}
	class:outside-month={isOutsideMonth}
	class:disabled
	class:blocked={isBlocked}
	on:click={handleClick}
	{disabled}
>
	<span class="date">{date.getDate()}</span>
	{#if isOpen}
		<span class="indicator" class:blocked={isBlocked} />
	{/if}
</button>

<style>
	.day {
		position: relative;
		width: 100%;
		aspect-ratio: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		border: none;
		background: none;
		cursor: pointer;
		border-radius: 0.25rem;
		font-size: 0.875rem;
		padding: 0.25rem;
		border: 2px solid transparent; /* Lägg till en transparent border som default */
	}

	.day:hover:not(.disabled):not(.blocked) {
		background-color: hsl(var(--primary) / 0.1);
	}

	.selected {
		background-color: hsl(var(--primary) / 0.1); /* Ljusare bakgrund */
		border: 2px solid hsl(var(--primary)); /* Tydlig border runt vald dag */
		font-weight: 600; /* Fetare text */
	}

	.indicator {
		width: 6px; /* Lite större prick */
		height: 6px;
		border-radius: 50%;
		margin-top: 1px;
		position: absolute;
		bottom: 2px;
		background-color: rgb(22 163 74); /* Default grön färg */
	}

	.indicator.blocked {
		background-color: rgb(239 68 68); /* Röd färg för blockerade dagar */
	}

	.open {
		background-color: rgb(22 163 74); /* Tydlig grön färg */
	}

	.outside-month {
		opacity: 0.5;
	}

	.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
