<!-- src/lib/components/calendar/CalendarHeader.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { ChevronLeft, ChevronRight } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';

	export let currentMonth: Date;

	const dispatch = createEventDispatcher();

	const monthNames = [
		'Januari',
		'Februari',
		'Mars',
		'April',
		'Maj',
		'Juni',
		'Juli',
		'Augusti',
		'September',
		'Oktober',
		'November',
		'December'
	];

	function previousMonth() {
		const newDate = new Date(currentMonth);
		newDate.setMonth(newDate.getMonth() - 1);
		dispatch('monthChange', newDate);
	}

	function nextMonth() {
		const newDate = new Date(currentMonth);
		newDate.setMonth(newDate.getMonth() + 1);
		dispatch('monthChange', newDate);
	}
</script>
Test1
<div class="calendar-header">
	<Button variant="ghost" size="icon" on:click={previousMonth}>
		<ChevronLeft class="h-4 w-4" />
	</Button>

	<h2 class="month-title">
		{monthNames[currentMonth.getMonth()]}
		{currentMonth.getFullYear()}
	</h2>

	<Button variant="ghost" size="icon" on:click={nextMonth}>
		<ChevronRight class="h-4 w-4" />
	</Button>
</div>

<style>
	.calendar-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-bottom: 1rem;
	}

	.month-title {
		font-size: 1.1rem;
		font-weight: 500;
	}
</style>
