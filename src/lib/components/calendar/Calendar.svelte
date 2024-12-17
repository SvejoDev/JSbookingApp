<script>
	import { createEventDispatcher } from 'svelte';
	import CalendarHeader from './CalendarHeader.svelte';
	import CalendarGrid from './CalendarGrid.svelte';

	export let bookingLength = {
		length: '',
		overnight: false,
		return_day_offset: 0
	};
	export let minDate = null;
	export let maxDate = null;
	export let blockedDates = [];
	export let openingPeriods = [];
	export let selectedDate = null;

	const dispatch = createEventDispatcher();
	let currentMonth = new Date();
	let forceUpdate = 0;

	function formatDate(date) {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	function handleDateSelect(event) {
		const date = event.detail;
		selectedDate = formatDate(date);
		forceUpdate += 1;
		dispatch('dateSelect', date);
	}

	function handleMonthChange(event) {
		currentMonth = event.detail;
	}

	export function isDateOpen(date) {
		return openingPeriods.some((period) => {
			const start = new Date(period.start_date);
			const end = new Date(period.end_date);
			return date >= start && date <= end;
		});
	}

	export function isDateBlocked(date) {
		return blockedDates.some((blockedDate) => blockedDate.toDateString() === date.toDateString());
	}

	// Use optional chaining with a fallback value
	$: key = `${selectedDate}-${bookingLength?.length || ''}-${currentMonth.getTime()}`;
</script>

{#key key}
	<div class="calendar">
		<CalendarHeader {currentMonth} on:monthChange={handleMonthChange} />
		<CalendarGrid
			{currentMonth}
			{minDate}
			{maxDate}
			{selectedDate}
			{bookingLength}
			{isDateOpen}
			{isDateBlocked}
			on:dateSelect={handleDateSelect}
		/>
	</div>
{/key}

<style>
	.calendar {
		background-color: white;
		border-radius: 0.5rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		padding: 1rem;
	}
</style>
