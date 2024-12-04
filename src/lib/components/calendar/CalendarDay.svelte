<script lang="ts">
	export let bookingLength: {
		length: string;
		overnight: boolean;
		return_day_offset: number;
	} | null = null;
	export let date: Date;
	export let isSelected: boolean = false;
	export let isToday: boolean = false;
	export let isOpen: boolean = false;
	export let isBlocked: boolean = false;
	export let isOutsideMonth: boolean = false;
	export let disabled: boolean = false;
	export let isStartDay: boolean = false;
	export let isEndDay: boolean = false;
	export let isInBetweenDay: boolean = false;
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	function handleClick() {
		if (!disabled && !isBlocked) {
			dispatch('select', date);
		}
	}

	$: showConnectingLine = (isStartDay || isInBetweenDay) && bookingLength?.overnight;
</script>

<button
	class="day-wrapper"
	class:selected={isSelected}
	class:today={isToday}
	class:outside-month={isOutsideMonth}
	class:disabled
	class:blocked={isBlocked}
	class:not-open={!isOpen}
	class:start-day={isStartDay}
	class:end-day={isEndDay}
	class:in-between-day={isInBetweenDay}
	class:show-line={showConnectingLine}
	on:click={handleClick}
	disabled={disabled || isBlocked}
>
	<div class="day">
		<span class="date">{date.getDate()}</span>
		{#if isOpen}
			<span class="indicator" class:blocked={isBlocked} />
		{/if}
	</div>
</button>

<style>
	.day-wrapper {
		position: relative;
		width: 100%;
		aspect-ratio: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: transparent;
		padding: 0;
	}

	.day {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		font-size: 0.875rem;
		color: hsl(var(--foreground));
		position: relative;
		z-index: 2;
	}

	.selected .day {
		background-color: hsl(220 13% 15%);
		color: white;
	}

	.start-day .day,
	.end-day .day {
		background-color: hsl(220 13% 15%);
		color: white;
	}

	.show-line.start-day::after,
	.show-line.in-between-day::after {
		content: '';
		position: absolute;
		left: 16px; /* Justerad från 0 till 16px för att inte sticka ut */
		right: -50%;
		top: 50%;
		transform: translateY(-50%);
		height: 30px; /* Ökad från 8px till 16px för högre linje */
		background-color: hsl(220 13% 91%);
		z-index: 1;
	}

	.show-line.in-between-day::before {
		content: '';
		position: absolute;
		right: 16px; /* Justerad från 0 till 16px för att inte sticka ut */
		left: -50%;
		top: 50%;
		transform: translateY(-50%);
		height: 30px; /* Ökad från 8px till 16px för högre linje */
		background-color: hsl(220 13% 91%);
		z-index: 1;
	}

	.blocked,
	.not-open,
	.disabled,
	.outside-month {
		opacity: 0.35;
		color: hsl(var(--muted-foreground));
	}

	.indicator {
		width: 4px;
		height: 4px;
		border-radius: 50%;
		position: absolute;
		bottom: 2px;
		background-color: rgb(22 163 74 / 0.8);
	}

	.indicator.blocked {
		background-color: rgb(239 68 68 / 0.8);
	}

	.selected .indicator {
		background-color: white;
	}
</style>
