<!-- src/lib/components/calendar/CalendarGrid.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import CalendarDay from './CalendarDay.svelte';

	export let currentMonth: Date;
	export let minDate: Date | null;
	export let maxDate: Date | null;
	export let selectedDate: string | null;
	export let isDateOpen: (date: Date) => boolean;
	export let isDateBlocked: (date: Date) => boolean;

	const dispatch = createEventDispatcher();

	const weekDays = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

	$: calendarDays = getCalendarDays(currentMonth);

	function getCalendarDays(date: Date) {
		const days = [];
		const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
		const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);

		// Get the Monday before the first day of the month
		let start = new Date(firstDay);
		start.setDate(firstDay.getDate() - ((firstDay.getDay() + 6) % 7));

		// Get the Sunday after the last day of the month
		let end = new Date(lastDay);
		end.setDate(lastDay.getDate() + ((7 - lastDay.getDay()) % 7));

		let current = new Date(start);
		while (current <= end) {
			days.push(new Date(current));
			current.setDate(current.getDate() + 1);
		}

		return days;
	}

	function isDateDisabled(date: Date): boolean {
    if (minDate && date < minDate) return true;
    if (maxDate && date > maxDate) return true;
    if (isDateBlocked(date)) return true; 
    return false;
}

	function isOutsideMonth(date: Date): boolean {
		return date.getMonth() !== currentMonth.getMonth();
	}

	function handleDateSelect(date: Date) {
		if (!isDateDisabled(date)) {
			dispatch('dateSelect', date);
		}
	}

	function isToday(date: Date): boolean {
		const today = new Date();
		return date.toDateString() === today.toDateString();
	}

	function isSelected(date: Date): boolean {
		if (!selectedDate) return false;
		return date.toDateString() === new Date(selectedDate).toDateString();
	}
</script>

<div class="calendar-grid">
	<div class="weekdays">
		{#each weekDays as day}
			<div class="weekday">{day}</div>
		{/each}
	</div>

	<div class="days">
		{#each calendarDays as date}
			<CalendarDay
				{date}
				isSelected={isSelected(date)}
				isToday={isToday(date)}
				isOpen={isDateOpen(date)}
				isBlocked={isDateBlocked(date)}
				isOutsideMonth={isOutsideMonth(date)}
				disabled={isDateDisabled(date)}
				on:select={() => handleDateSelect(date)}
			/>
		{/each}
	</div>
</div>

<style>
	.calendar-grid {
		width: 100%;
		max-width: 300px; /* Begränsa kalenderns bredd */
		margin: 0 auto; /* Centrera kalendern */
	}

	.weekdays {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 0.25rem; /* Minska mellanrummet mellan dagarna */
		margin-bottom: 0.25rem;
	}

	.weekday {
		text-align: center;
		font-size: 0.75rem; /* Mindre text för veckodagarna */
		color: hsl(var(--muted-foreground));
	}

	.days {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 0.25rem; /* Minska mellanrummet mellan dagarna */
	}
</style>
