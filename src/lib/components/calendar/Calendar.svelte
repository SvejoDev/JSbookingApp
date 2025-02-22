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
	export let endDate = null;
	export let disabled = false;
	export let data = null;

	const dispatch = createEventDispatcher();
	let currentMonth = new Date(); // Set initial value
	let forceUpdate = 0;

	// Initialize calendar based on experience type and availability
	$: {
		if (minDate) {
			let targetDate = null;

			// kontrollera specifika datum först (högst prioritet)
			if (openingPeriods.specificDates?.length > 0) {
				const firstSpecificDate = openingPeriods.specificDates
					.map((d) => new Date(d.date))
					.sort((a, b) => a - b)
					.find((date) => !isDateBlocked(date) && date >= new Date());

				if (firstSpecificDate) {
					targetDate = firstSpecificDate;
				}
			}

			// kontrollera perioder om inget specifikt datum hittades
			if (!targetDate && openingPeriods.periods?.length > 0) {
				const firstValidPeriod = openingPeriods.periods
					.sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
					.find((period) => {
						const startDate = new Date(period.start_date);
						const endDate = new Date(period.end_date);
						return endDate >= new Date();
					});

				if (firstValidPeriod) {
					const periodStart = new Date(firstValidPeriod.start_date);
					const now = new Date();

					// använd dagens datum om det är inom perioden, annars använd periodens startdatum
					targetDate = now > periodStart ? now : periodStart;
				}
			}

			// om varken specifika datum eller perioder hittades, använd minDate
			if (!targetDate && minDate) {
				targetDate = new Date(minDate);
			}

			// sätt kalendern till rätt månad
			if (targetDate) {
				currentMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
			} else {
				currentMonth = new Date();
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

		// spara nuvarande tillstånd
		let isOpenDate = false;

		// hantera business_school på samma sätt som public
		if (
			data?.experience?.experience_type === 'business_school' ||
			data?.experience?.experience_type === 'public'
		) {
			// kontrollera specifika datum först
			if (openingPeriods.specificDates?.length > 0) {
				isOpenDate = openingPeriods.specificDates.some(
					(specificDate) => specificDate.date === dateStr
				);
				if (isOpenDate) return true;
			}

			// kontrollera perioder om inget specifikt datum hittades
			if (!isOpenDate && openingPeriods.periods?.length > 0) {
				const checkDate = new Date(date);
				checkDate.setHours(12, 0, 0, 0);

				isOpenDate = openingPeriods.periods.some((period) => {
					const start = new Date(period.start_date);
					const end = new Date(period.end_date);

					start.setHours(12, 0, 0, 0);
					end.setHours(12, 0, 0, 0);

					return checkDate >= start && checkDate <= end;
				});
			}
		}

		return isOpenDate;
	}

	export function isDateBlocked(date) {
		// kontrollera vanliga blockerade datum
		const isNormallyBlocked = blockedDates.some(
			(blockedDate) => blockedDate.toDateString() === date.toDateString()
		);

		if (isNormallyBlocked) return true;

		// kontrollera framförhållning
		const now = new Date();
		const foresightHours = data?.experience?.booking_foresight_hours || 0;
		const earliestPossibleTime = new Date(now.getTime() + foresightHours * 60 * 60 * 1000);

		// om datumet är samma som earliestPossibleTime, tillåt bokning från den tiden
		if (date.toDateString() === earliestPossibleTime.toDateString()) {
			return false;
		}

		// blockera datum som är före earliestPossibleTime
		return date < earliestPossibleTime;
	}

	// Generate key for forcing re-render
	$: key = `${selectedDate}-${bookingLength?.length || ''}-${currentMonth?.getTime() || Date.now()}`;
</script>

{#key key}
	<div class="calendar">
		<CalendarHeader {currentMonth} on:monthChange={handleMonthChange} />
		<CalendarGrid
			{currentMonth}
			{selectedDate}
			{endDate}
			{bookingLength}
			{minDate}
			{maxDate}
			{isDateOpen}
			{isDateBlocked}
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
