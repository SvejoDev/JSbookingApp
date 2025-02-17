<script>
	import { goto } from '$app/navigation';
	import { Card } from '$lib/components/ui/card';
	import { ChevronLeft, ChevronRight } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';

	export let data;

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

	// format equipment display
	function formatEquipment(booking) {
		if (!booking || !data.addons) return '';

		return data.addons
			.map((addon) => {
				const amount = booking[addon.column_name];
				if (amount && amount > 0) {
					return `${addon.name}: ${amount}`;
				}
				return null;
			})
			.filter((item) => item !== null)
			.join('\n');
	}

	async function handleStartBooking(bookingId) {
		try {
			const response = await fetch('/api/bookings/start', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ bookingId })
			});

			const result = await response.json();
			if (result.success) {
				toast.success('Bokning har startats');
				// Uppdatera sidan för att visa ny status
				goto(`/admin/bookings?date=${data.selectedDate}`, { invalidateAll: true });
			} else {
				toast.error('Kunde inte starta bokningen');
			}
		} catch (error) {
			console.error('Fel vid start av bokning:', error);
			toast.error('Ett fel uppstod');
		}
	}

	async function handleCompleteBooking(bookingId) {
		try {
			const response = await fetch('/api/bookings/complete', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ bookingId })
			});

			const result = await response.json();
			if (result.success) {
				toast.success('Bokning har markerats som genomförd');
				// Uppdatera sidan för att visa ny status
				goto(`/admin/bookings?date=${data.selectedDate}`, { invalidateAll: true });
			} else {
				toast.error('Kunde inte slutföra bokningen');
			}
		} catch (error) {
			console.error('Fel vid slutförande av bokning:', error);
			toast.error('Ett fel uppstod');
		}
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
		<table class="w-full border-collapse text-xs">
			<thead>
				<tr class="bg-gray-100">
					<th class="border p-1 text-left">Tid</th>
					<th class="border p-1 text-left">Namn</th>
					<th class="border p-1 text-left">Upplevelse</th>
					<th class="border p-1 text-left">Startplats</th>
					<th class="border p-1 text-left">Antal</th>
					<th class="border p-1 text-left">Utrustning</th>
					<th class="border p-1 text-left">Betalningsstatus</th>
					<th class="border p-1 text-left">Status</th>
					<th class="border p-1 text-left">Belopp</th>
					<th class="border p-1 text-left">Kontakt</th>
					<th class="border p-1 text-left">Kommentar</th>
					<th class="border p-1 text-left">Åtgärder</th>
				</tr>
			</thead>
			<tbody>
				{#each data.bookings as booking}
					<tr class="hover:bg-gray-50">
						<td class="border p-1">
							{#if new Date(booking.start_date).toDateString() !== new Date(booking.end_date).toDateString()}
								<div class="text-xs">
									Start: {formatDate(booking.start_date)}<br />
									{formatTime(booking.start_time)}
								</div>
								<div class="text-xs">
									Slut: {formatDate(booking.end_date)}<br />
									{formatTime(booking.end_time)}
								</div>
							{:else}
								<div class="text-xs">
									{formatTime(booking.start_time)} - {formatTime(booking.end_time)}
								</div>
							{/if}
						</td>
						<td class="border p-1">
							{booking.booking_name}
							{booking.booking_lastname}
						</td>
						<td class="border p-1 text-xs max-w-[150px]">
							{#each booking.experience.split(' ') as word, i}
								{word}{i < booking.experience.split(' ').length - 1 ? ' ' : ''}{#if i % 3 === 1}<br
									/>{/if}
							{/each}
						</td>
						<td class="border p-1">
							{booking.startlocation_name || '-'}
						</td>
						<td class="border p-1 text-xs">
							Vuxna: {booking.number_of_adults}<br />
							Barn: {booking.number_of_children}
						</td>
						<td class="border p-1 text-xs whitespace-pre-line">
							{formatEquipment(booking)}
						</td>
						<td class="border p-1">
							<span
								class="text-xs px-2 py-1 rounded {booking.status === 'betald'
									? 'bg-green-100'
									: 'bg-yellow-100'}"
							>
								{booking.status === 'betald' ? 'Betald' : 'Ej betald'}
							</span>
						</td>
						<td class="border p-1">
							<span
								class="text-xs px-2 py-1 rounded {booking.booking_status === 'started'
									? 'bg-blue-100'
									: booking.booking_status === 'completed'
										? 'bg-gray-100'
										: 'bg-yellow-100'}"
							>
								{#if booking.booking_status === 'started'}
									Påbörjad
								{:else if booking.booking_status === 'completed'}
									Genomförd
								{:else}
									-
								{/if}
							</span>
						</td>
						<td class="border p-1">
							{booking.amount_total} kr
						</td>
						<td class="border p-1 text-xs">
							{booking.customer_email}
						</td>
						<td class="border p-1 text-xs">
							{booking.customer_comment || '-'}
						</td>
						<td class="border p-1">
							{#if booking.status === 'betald'}
								{#if booking.booking_status === 'pending'}
									<Button
										variant="outline"
										size="sm"
										on:click={() => handleStartBooking(booking.id)}
									>
										Start
									</Button>
								{:else if booking.booking_status === 'started'}
									<Button
										variant="outline"
										size="sm"
										on:click={() => handleCompleteBooking(booking.id)}
									>
										Slut
									</Button>
								{:else if booking.booking_status === 'completed'}
									<span class="text-xs text-gray-500">Avslutad</span>
								{/if}
							{/if}
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
