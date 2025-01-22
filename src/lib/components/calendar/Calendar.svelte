<script>
	import { createEventDispatcher, onMount } from 'svelte';
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
	export let openingPeriods = {
		periods: [],
		specificDates: [], // Now contains objects with date and timeSlots array
		defaultOpenTime: '',
		defaultCloseTime: ''
	};
	export let selectedDate = null;
	export let disabled = false;

	const dispatch = createEventDispatcher();
	let currentMonth = new Date(); // Set initial value
	let forceUpdate = 0;

	// Find first available date based on opening periods or specific dates
	$: {
		if (minDate) {
			let targetDate;

			// First check specific dates if they exist
			if (openingPeriods.specificDates?.length > 0) {
				targetDate = openingPeriods.specificDates
					.map((d) => new Date(d.date))
					.sort((a, b) => a - b)
					.find((date) => !isDateBlocked(date) && date >= new Date());
			}

			// If no specific dates found, check periods
			if (!targetDate && openingPeriods.periods?.length > 0) {
				const validPeriod = openingPeriods.periods
					.sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
					.find((period) => {
						const endDate = new Date(period.end_date);
						return endDate >= new Date();
					});

				if (validPeriod) {
					targetDate = new Date(validPeriod.start_date);
				}
			}

			if (targetDate) {
				currentMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
			}
		}
	}

	function formatDate(date) {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	function handleDateSelect(event) {
		const date = event.detail;
		if (!(date instanceof Date) || isNaN(date.getTime())) {
			console.error('Invalid date received:', date);
			return;
		}

		selectedDate = formatDate(date);
		dispatch('dateSelect', { date });
	}

	function handleMonthChange(event) {
		currentMonth = event.detail;
	}

	export function isDateOpen(date) {
		const dateStr = formatDate(date);

		// Check if there are any specific dates
		if (openingPeriods.specificDates && openingPeriods.specificDates.length > 0) {
			// If we have specific dates, only those dates are available
			return openingPeriods.specificDates.some((specificDate) => specificDate.date === dateStr);
		}

		// If no specific dates, check period-based availability
		return openingPeriods.periods.some((period) => {
			const start = new Date(period.start_date);
			const end = new Date(period.end_date);
			return date >= start && date <= end;
		});
	}

	export function isDateBlocked(date) {
		return blockedDates.some((blockedDate) => blockedDate.toDateString() === date.toDateString());
	}

	// Generate key for forcing re-render
	$: key = `${selectedDate}-${bookingLength?.length || ''}-${currentMonth?.getTime() || Date.now()}`;
</script>

{#key key}
	<div class="calendar">
		<CalendarHeader {currentMonth} on:monthChange={handleMonthChange} />
		<CalendarGrid
			{currentMonth}
			{minDate}
			{maxDate}
			{selectedDate}
			{isDateOpen}
			{isDateBlocked}
			{bookingLength}
			{disabled}
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
