<script>
	export let bookingLength = {
		length: '',
		overnight: false,
		return_day_offset: 0
	};
	export let date;
	export let selectedDate;
	export let endDate;
	export let isSelected = false;
	export let isToday = false;
	export let isOpen = false;
	export let isBlocked = false;
	export let isOutsideMonth = false;
	export let disabled = false;
	export let isStartDay = false;
	export let isEndDay = false;
	export let isInBetweenDay = false;

	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	function formatDate(date) {
		const d = new Date(date);
		d.setHours(12, 0, 0, 0); // Set to noon to avoid timezone issues
		return d.toISOString().split('T')[0];
	}

	$: currentDateStr = formatDate(date);
	$: classes = [
		'day',
		isStartDay ? 'selected start-day' : '',
		isEndDay ? 'selected end-day' : '',
		isInBetweenDay ? 'in-between-day' : '',
		(isStartDay || isEndDay) && bookingLength?.overnight ? 'show-line' : '',
		isInBetweenDay && bookingLength?.overnight ? 'between-overnight' : ''
	]
		.filter(Boolean)
		.join(' ');

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
	<div class={classes}>
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
		left: 50%;
		right: -50%;
		top: 50%;
		transform: translateY(-50%);
		height: 8px;
		background-color: hsl(var(--primary) / 0.1);
		z-index: 1;
	}

	.show-line.in-between-day::before {
		content: '';
		position: absolute;
		right: 50%;
		left: -50%;
		top: 50%;
		transform: translateY(-50%);
		height: 8px;
		background-color: hsl(var(--primary) / 0.1);
		z-index: 1;
	}

	.show-line.end-day::before {
		content: '';
		position: absolute;
		right: 50%;
		left: -50%;
		top: 50%;
		transform: translateY(-50%);
		height: 8px;
		background-color: hsl(var(--primary) / 0.1);
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
