<!-- src/lib/components/calendar/Calendar.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import CalendarHeader from './CalendarHeader.svelte';
	import CalendarGrid from './CalendarGrid.svelte';

	export let minDate: Date | null = null;
	export let maxDate: Date | null = null;
	export let blockedDates: Date[] = [];
	export let openingPeriods: { start_date: string; end_date: string }[] = [];
	export let selectedDate: string | null = null;

	const dispatch = createEventDispatcher();

	let currentMonth = new Date();

	function handleDateSelect(event: CustomEvent<Date>) {
		dispatch('dateSelect', event.detail);
	}

	function handleMonthChange(event: CustomEvent<Date>) {
		currentMonth = event.detail;
	}

	// Hjälpfunktion för att kontrollera om ett datum är inom öppetperiod
	export function isDateOpen(date: Date): boolean {
		return openingPeriods.some((period) => {
			const start = new Date(period.start_date);
			const end = new Date(period.end_date);
			return date >= start && date <= end;
		});
	}

	// Hjälpfunktion för att kontrollera om ett datum är blockerat
	export function isDateBlocked(date: Date): boolean {
		return blockedDates.some((blockedDate) => blockedDate.toDateString() === date.toDateString());
	}
</script>

<div class="calendar">
	<CalendarHeader {currentMonth} on:monthChange={handleMonthChange} />

	<CalendarGrid
		{currentMonth}
		{minDate}
		{maxDate}
		{selectedDate}
		{isDateOpen}
		{isDateBlocked}
		on:dateSelect={handleDateSelect}
	/>
</div>

<style>
	.calendar {
		background-color: white;
		border-radius: 0.5rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		padding: 1rem;
	}
</style>
