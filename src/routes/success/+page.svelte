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

	// formatera datum och tid
	const formatDateTime = (date, time) => {
		if (!date || !time) return 'Ej angivet';

		// konvertera datum till svenskt format
		const dateObj = new Date(date);
		const formattedDate = dateObj.toLocaleDateString('sv-SE', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});

		// formatera tid (ta bort sekunder om de finns)
		const formattedTime = time.split(':').slice(0, 2).join(':');

		return `${formattedDate} kl. ${formattedTime}`;
	};

	// Formatera datum
	const formatDate = (dateString) => {
		const date = new Date(dateString);
		return date.toLocaleDateString('sv-SE');
	};
</script>

<div class="container mx-auto py-8 px-4">
	<a href="https://stisses.se">
		<Button variant="ghost" class="mb-6 flex items-center gap-2">
			<ArrowLeft class="w-4 h-4" />
			Tillbaka till startsidan
		</Button>
	</a>

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

			<!-- Booking Times -->
			<div class="mb-4">
				<p><strong>Start:</strong> {formatDateTime(booking.start_date, booking.start_time)}</p>
				<p><strong>Slut:</strong> {formatDateTime(booking.end_date, booking.end_time)}</p>
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

						{#each booking.addons as addon}
							{#if addon.amount > 0}
								<tr class="border-b">
									<td class="py-2">{addon.name}</td>
									<td class="text-center">{addon.amount}</td>
									<td class="text-right">0 kr</td>
									<td class="text-right">0 kr</td>
								</tr>
							{/if}
						{/each}

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
