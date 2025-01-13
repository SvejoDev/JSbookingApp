<script>
	import { goto } from '$app/navigation';
	import { Card } from '$lib/components/ui/card';
	import { ChevronLeft, ChevronRight } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';

	export let data;

	// debounce function to prevent rapid database queries
	function debounce(func, wait) {
		let timeout;
		return function executedFunction(...args) {
			const later = () => {
				clearTimeout(timeout);
				func(...args);
			};
			clearTimeout(timeout);
			timeout = setTimeout(later, wait);
		};
	}

	// navigate to adjacent date
	function navigateDate(direction) {
		const currentDate = new Date(data.selectedDate);
		currentDate.setDate(currentDate.getDate() + direction);
		const newDate = currentDate.toISOString().split('T')[0];
		goto(`/admin/bookings?date=${newDate}`);
	}

	// debounced navigation functions
	const debouncedPrevDay = debounce(() => navigateDate(-1), 300);
	const debouncedNextDay = debounce(() => navigateDate(1), 300);

	// format date for display
	function formatDate(dateString) {
		return new Date(dateString).toLocaleDateString('sv-SE');
	}

	// format time for display
	function formatTime(timeString) {
		return timeString?.slice(0, 5) || '';
	}

	// format datetime for display
	function formatDateTime(dateTimeString) {
		const date = new Date(dateTimeString);
		return date.toLocaleDateString('sv-SE') + ' ' + date.toLocaleTimeString('sv-SE');
	}

	// handle date change
	function handleDateChange(event) {
		const newDate = event.target.value;
		goto(`/admin/bookings?date=${newDate}`);
	}

	// format equipment string
	function formatEquipment(booking) {
		const equipment = [];
		if (booking.amount_canoes > 0) equipment.push(`Kanot: ${booking.amount_canoes}`);
		if (booking.amount_kayak > 0) equipment.push(`Kajak: ${booking.amount_kayak}`);
		if (booking.amount_sup > 0) equipment.push(`SUP: ${booking.amount_sup}`);
		return equipment.join(', ');
	}
</script>

<div class="container mx-auto p-4">
	<div class="mb-6 flex items-center justify-center gap-4">
		<Button variant="outline" on:click={debouncedPrevDay}>
			<ChevronLeft class="h-4 w-4" />
		</Button>

		<input
			type="date"
			value={data.selectedDate}
			on:change={handleDateChange}
			class="border p-2 rounded"
		/>

		<Button variant="outline" on:click={debouncedNextDay}>
			<ChevronRight class="h-4 w-4" />
		</Button>
	</div>

	<div class="overflow-x-auto">
		<table class="w-full border-collapse">
			<thead>
				<tr class="bg-gray-100">
					<th class="border p-2 text-left">Tid</th>
					<th class="border p-2 text-left">Namn</th>
					<th class="border p-2 text-left">Upplevelse</th>
					<th class="border p-2 text-left">Startplats</th>
					<th class="border p-2 text-left">Antal</th>
					<th class="border p-2 text-left">Utrustning</th>
					<th class="border p-2 text-left">Status</th>
					<th class="border p-2 text-left">Belopp</th>
					<th class="border p-2 text-left">Kontakt</th>
					<th class="border p-2 text-left">Kommentar</th>
				</tr>
			</thead>
			<tbody>
				{#each data.bookings as booking}
					<tr class="hover:bg-gray-50">
						<td class="border p-2">
							{formatTime(booking.start_time)} - {formatTime(booking.end_time)}
						</td>
						<td class="border p-2">
							{booking.booking_name}
							{booking.booking_lastname}
						</td>
						<td class="border p-2">
							{booking.experience}
						</td>
						<td class="border p-2">
							{booking.startlocation}
						</td>
						<td class="border p-2">
							Vuxna: {booking.number_of_adults}<br />
							Barn: {booking.number_of_children}
						</td>
						<td class="border p-2">
							{formatEquipment(booking)}
						</td>
						<td class="border p-2">
							<span
								class="px-2 py-1 rounded {booking.status === 'betald'
									? 'bg-green-100'
									: 'bg-yellow-100'}"
							>
								{booking.status}
							</span>
						</td>
						<td class="border p-2">
							{booking.amount_total} kr
						</td>
						<td class="border p-2">
							{booking.customer_email}
						</td>
						<td class="border p-2">
							{booking.customer_comment || '-'}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>

		{#if data.bookings.length === 0}
			<div class="text-center py-4 bg-gray-50">Inga bokningar för detta datum</div>
		{/if}
	</div>
</div>

<style>
	/* enable horizontal scrolling on small screens */
	.overflow-x-auto {
		-webkit-overflow-scrolling: touch;
	}

	/* ensure table headers stick to top when scrolling horizontally */
	thead tr {
		position: sticky;
		top: 0;
		z-index: 1;
	}
</style>
