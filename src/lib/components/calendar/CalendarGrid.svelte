<script>
	import { createEventDispatcher } from 'svelte';
	import CalendarDay from './CalendarDay.svelte';

	export let currentMonth;
	export let minDate = null;
	export let maxDate = null;
	export let selectedDate = null;
	export let isDateOpen;
	export let isDateBlocked;
	export let bookingLength = null;

	const dispatch = createEventDispatcher();
	const weekDays = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

	$: calendarDays = getCalendarDays(currentMonth);
	$: selectedDateStr = selectedDate;

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
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	function isDateInRange(date) {
		if (!selectedDate || !bookingLength) {
			return {
				isStartDay: false,
				isEndDay: false,
				isInBetweenDay: false
			};
		}

		const startDateObj = new Date(selectedDate);
		let endDateObj = new Date(startDateObj);

		if (bookingLength.overnight) {
			endDateObj.setDate(endDateObj.getDate() + bookingLength.return_day_offset);
		} else {
			return {
				isStartDay: formatDate(date) === selectedDate,
				isEndDay: false,
				isInBetweenDay: false
			};
		}

		const currentDateStr = formatDate(date);
		const startDateStr = formatDate(startDateObj);
		const endDateStr = formatDate(endDateObj);

		return {
			isStartDay: currentDateStr === startDateStr,
			isEndDay: currentDateStr === endDateStr,
			isInBetweenDay: currentDateStr > startDateStr && currentDateStr < endDateStr
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
				{bookingLength}
				isSelected={isDateSelected(date)}
				isToday={isToday(date)}
				isOpen={isDateOpen(date)}
				isBlocked={isDateBlocked(date)}
				isOutsideMonth={isOutsideMonth(date)}
				disabled={isDateDisabled(date)}
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
