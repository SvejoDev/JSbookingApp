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
		if (!disabled && !isBlocked) {
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
	disabled={disabled || isBlocked}
	title={isBlocked ? 'Detta datum är tyvärr blockerat' : ''}
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
		border: 2px solid transparent;
	}

	.day:hover:not(.disabled):not(.blocked) {
		background-color: hsl(var(--primary) / 0.1);
	}

	.blocked {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.indicator {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		margin-top: 1px;
		position: absolute;
		bottom: 2px;
		background-color: rgb(22 163 74);
	}

	.indicator.blocked {
		background-color: rgb(239 68 68);
	}
</style>
