<script>
	import { createEventDispatcher } from 'svelte';
	import CalendarDay from './CalendarDay.svelte';

	export let currentMonth;
	export let minDate = null;
	export let maxDate = null;
	export let selectedDate = null;
	export let endDate = null;
	export let isDateOpen;
	export let isDateBlocked;
	export let bookingLength = null;
	export let disabled = false;

	const dispatch = createEventDispatcher();
	const weekDays = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

	$: calendarDays = getCalendarDays(currentMonth);
	$: selectedDateStr = selectedDate;

	$: {
		if (selectedDate && bookingLength?.overnight) {
			const startDate = new Date(selectedDate);
			startDate.setUTCHours(0, 0, 0, 0);
			const tempEndDate = new Date(startDate);
			tempEndDate.setUTCDate(startDate.getUTCDate() + bookingLength.return_day_offset);
			tempEndDate.setUTCHours(0, 0, 0, 0);
			endDate = formatDate(tempEndDate);
		} else {
			endDate = null;
		}
	}

	function getCalendarDays(date) {
		const days = [];
		const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
		const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);

		let start = new Date(firstDay);
		start.setDate(firstDay.getDate() - ((firstDay.getDay() + 6) % 7));

		let end = new Date(lastDay);
		end.setDate(lastDay.getDate() + ((7 - lastDay.getDay()) % 7));

		let current = new Date(start);
		while (current <= end) {
			days.push(new Date(current));
			current.setDate(current.getDate() + 1);
		}

		return days;
	}

	function handleDateSelect(date) {
		if (!isDateDisabled(date)) {
			dispatch('dateSelect', date);
		}
	}

	function isDateDisabled(date) {
		if (minDate && date < minDate) return true;
		if (maxDate && date > maxDate) return true;
		if (isDateBlocked(date)) return true;
		return false;
	}

	function isOutsideMonth(date) {
		return date.getMonth() !== currentMonth.getMonth();
	}

	function isToday(date) {
		const today = new Date();
		return date.toDateString() === today.toDateString();
	}

	function isSelected(date) {
		if (!selectedDateStr) return false;
		return formatDate(date) === selectedDateStr;
	}

	function formatDate(date) {
		return date.toISOString().split('T')[0];
	}

	function isDateInRange(date) {
		if (!selectedDate || !bookingLength) {
			return {
				isStartDay: false,
				isEndDay: false,
				isInBetweenDay: false
			};
		}

		// Create date objects and normalize them to midnight UTC
		const startDateObj = new Date(selectedDate);
		startDateObj.setUTCHours(0, 0, 0, 0);

		const currentDateObj = new Date(date);
		currentDateObj.setUTCHours(0, 0, 0, 0);

		let endDateObj;
		if (bookingLength.overnight) {
			endDateObj = new Date(startDateObj);
			endDateObj.setUTCDate(startDateObj.getUTCDate() + bookingLength.return_day_offset);
			endDateObj.setUTCHours(0, 0, 0, 0);
		} else {
			endDateObj = startDateObj;
		}

		// Compare timestamps for exact matching
		const currentTime = currentDateObj.getTime();
		const startTime = startDateObj.getTime();
		const endTime = endDateObj.getTime();

		return {
			isStartDay: currentTime === startTime,
			isEndDay: currentTime === endTime,
			isInBetweenDay: currentTime > startTime && currentTime < endTime
		};
	}

	function isDateSelected(date) {
		if (!selectedDate) return false;
		return formatDate(date) === selectedDate;
	}
</script>

<div
	class="calendar-grid"
	data-calendar-month={currentMonth.getMonth()}
	data-calendar-year={currentMonth.getFullYear()}
>
	<div class="weekdays">
		{#each weekDays as day}
			<div class="weekday">{day}</div>
		{/each}
	</div>

	<div class="days">
		{#each calendarDays as date}
			{@const range = isDateInRange(date)}
			<CalendarDay
				{date}
				{selectedDate}
				{endDate}
				{bookingLength}
				isSelected={isDateSelected(date)}
				isToday={isToday(date)}
				isOpen={isDateOpen(date)}
				isBlocked={isDateBlocked(date)}
				isOutsideMonth={isOutsideMonth(date)}
				disabled={disabled || isDateDisabled(date)}
				isStartDay={range.isStartDay}
				isEndDay={range.isEndDay}
				isInBetweenDay={range.isInBetweenDay}
				on:select={() => handleDateSelect(date)}
			/>
		{/each}
	</div>
</div>

<style>
	.calendar-grid {
		width: 100%;
		max-width: 300px;
		margin: 0 auto;
	}

	.weekdays {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 0;
		margin-bottom: 0.5rem;
	}

	.weekday {
		text-align: center;
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	.days {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 0;
	}
</style>
