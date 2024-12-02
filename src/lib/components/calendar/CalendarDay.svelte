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
	class:not-open={!isOpen}
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
		/* existing styles */
		position: relative;
		width: 100%;
		aspect-ratio: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		border: 2px solid transparent;
		border-radius: 0.25rem;
		font-size: 0.875rem;
		padding: 0.25rem;
		transition: all 0.2s ease;
		background-color: white;
	}

	.selected {
		background-color: hsl(var(--primary)) !important;
		color: white !important;
		font-weight: 700;
		transform: scale(1.15);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
		z-index: 20;
		border: 2px solid hsl(var(--primary));
	}

	/* Make non-selected dates more muted */
	.day:not(.selected) {
		background-color: white;
	}

	.blocked,
	.not-open,
	.disabled,
	.outside-month {
		opacity: 0.25;
		color: hsl(var(--muted-foreground));
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

	.selected .indicator {
		background-color: white;
	}
</style>
