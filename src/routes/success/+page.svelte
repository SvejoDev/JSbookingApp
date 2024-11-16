<script>
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { ArrowLeft } from 'lucide-svelte';

	export let data;
	const { booking } = data;

	// Price formatting
	const formatPrice = (price) => {
		if (typeof price === 'number' && !isNaN(price)) {
			return price.toFixed(2);
		}
		return '0.00';
	};

	// Formatera datum och tid
	const formatDateTime = (date, time) => {
		const dateObj = new Date(`${date}T${time}`);
		return dateObj.toLocaleString('sv-SE', {
			dateStyle: 'long',
			timeStyle: 'short'
		});
	};

	// Formatera datum
	const formatDate = (dateString) => {
		const date = new Date(dateString);
		return date.toLocaleDateString('sv-SE');
	};
</script>

<div class="container mx-auto py-8 px-4">
	<Button variant="ghost" href="/" class="mb-6 flex items-center gap-2">
		<ArrowLeft class="w-4 h-4" />
		Tillbaka till startsidan
	</Button>

	<Card class="w-full max-w-3xl mx-auto bg-white shadow-lg">
		<CardContent class="p-8">
			<!-- Logo Header -->
			<div class="bg-[#00000] p-6 -mt-8 -mx-8 mb-6 flex justify-center">
				<img src="/Logga.svg" alt="Stisses" class="h-20" />
			</div>

			<!-- Title -->
			<div class="text-center mb-8">
				<h1 class="text-3xl font-bold mb-2">Bekräftelse & Kvitto</h1>
				<p class="text-xl">Tack för din bokning!</p>
			</div>

			<!-- Booking Details -->
			<div class="mb-8">
				<h2 class="text-xl font-semibold mb-2">Din bokning #{booking.id}</h2>
				<p><strong>Skapades:</strong> {formatDate(booking.date_time_created)}</p>
				<p><strong>Kund:</strong> {booking.booking_name} {booking.booking_lastname}</p>
				{#if booking.startLocation}
					<p><strong>Startplats</strong> {booking.startLocation}</p>
				{/if}
				{#if booking.customer_comment}
					<p><strong>Meddelande:</strong> {booking.customer_comment}</p>
				{/if}
			</div>

			<!-- Booking Time -->
			<div class="mb-6 p-4 bg-gray-50 rounded-lg">
				<p class="text-lg font-medium">
					{#if booking.start_date === booking.end_date}
						{formatDateTime(booking.start_date, booking.start_time)} till {booking.end_time}
					{:else}
						{formatDateTime(booking.start_date, booking.start_time)} till {formatDateTime(
							booking.end_date,
							booking.end_time
						)}
					{/if}
				</p>
			</div>

			<!-- Products Table -->
			<div class="mb-8">
				<table class="w-full mb-4">
					<thead>
						<tr class="border-b">
							<th class="text-left py-2">Produkt</th>
							<th class="text-center py-2 px-4">Antal</th>
							<th class="text-right py-2 px-4">Á Pris exkl. moms</th>
							<th class="text-right py-2 pl-4">Totalt exkl. moms</th>
						</tr>
					</thead>
					<tbody>
						<tr class="border-b">
							<td class="py-2">{booking.experience}</td>
							<td class="text-center">1</td>
							<td class="text-right">0 kr</td>
							<td class="text-right">0 kr</td>
						</tr>
						{#if booking.amount_canoes > 0}
							<tr class="border-b">
								<td class="py-2">Kanot</td>
								<td class="text-center">{booking.amount_canoes}</td>
								<td class="text-right">0 kr</td>
								<td class="text-right">0 kr</td>
							</tr>
						{/if}
						{#if booking.amount_kayak > 0}
							<tr class="border-b">
								<td class="py-2">Kajak</td>
								<td class="text-center">{booking.amount_kayak}</td>
								<td class="text-right">0 kr</td>
								<td class="text-right">0 kr</td>
							</tr>
						{/if}
						{#if booking.amount_sup > 0}
							<tr class="border-b">
								<td class="py-2">SUP</td>
								<td class="text-center">{booking.amount_sup}</td>
								<td class="text-right">0 kr</td>
								<td class="text-right">0 kr</td>
							</tr>
						{/if}

						<tr class="border-b">
							<td class="py-2">Antal vuxna</td>
							<td class="text-center">{booking.number_of_adults}</td>
							<td class="text-right">{formatPrice(booking.adultPriceExclVat)} kr</td>
							<td class="text-right">{formatPrice(booking.totalAdultsExclVat)} kr</td>
						</tr>

						{#if booking.number_of_children > 0}
							<tr class="border-b">
								<td class="py-2">Antal barn</td>
								<td class="text-center">{booking.number_of_children}</td>
								<td class="text-right">0 kr</td>
								<td class="text-right">0 kr</td>
							</tr>
						{/if}
					</tbody>
				</table>

				<div class="border-t pt-4">
					<div class="flex justify-between mb-2">
						<span>Totalt (exkl. moms)</span>
						<span>{formatPrice(booking.subtotal)} kr</span>
					</div>
					<div class="flex justify-between mb-2">
						<span>Moms (25%)</span>
						<span>{formatPrice(booking.vat)} kr</span>
					</div>
					<div class="flex justify-between font-bold">
						<span>Totalt pris</span>
						<span>{formatPrice(booking.total)} kr</span>
					</div>
				</div>
			</div>

			<!-- Information Text -->
			<div class="prose max-w-none">
				<p class="mb-4">
					Vi är glada för att få ha er som gäst och vi kommer göra allt vi kan för att er upplevelse
					ska bli så bra som möjligt.
				</p>

				<p class="mb-4">Vi finns på Reningsverksvägen 2 i Ängelholm</p>

				<p class="mb-4">
					Om ni kommer med bil eller buss så finns det gott om parkeringsplatser direkt till vänster
					när ni kommer fram. Det är gratis parkering. Kommer ni med tåg till Ängelholm är det bara
					en kort promenad från stationen (cirka 15 minuter).
				</p>

				<p class="mb-4">
					Tveka inte att höra av er om det är något ni undrar över.<br />
					Skicka ett mejl till
					<a href="mailto:info@stisses.se" class="text-blue-600 hover:underline">info@stisses.se</a>
					eller sms till
					<a href="tel:+46703259638" class="text-blue-600 hover:underline">+46703259638</a>.
				</p>
			</div>
		</CardContent>
	</Card>
</div>
