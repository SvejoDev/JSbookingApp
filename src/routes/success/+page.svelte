<script>
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { ArrowLeft } from 'lucide-svelte';

	export let data;
	const { booking, isInvoiceBooking } = data;

	// Lägg till console.log för debugging
	console.log('Booking data:', booking);

	// Price formatting
	const formatPrice = (price) => {
		if (price === null || price === undefined) return '0.00';

		// Konvertera till nummer om det är en sträng
		const numPrice = typeof price === 'string' ? parseFloat(price) : price;

		if (typeof numPrice === 'number' && !isNaN(numPrice)) {
			return new Intl.NumberFormat('sv-SE', {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			}).format(numPrice);
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

	// Lägg till en hjälpfunktion för att hantera undefined-värden
	const formatValue = (value) => value || 'Ej angiven';
</script>

<div class="container mx-auto px-4 py-8 max-w-3xl">
	<Button href="/" class="mb-8" variant="outline">
		<ArrowLeft class="mr-2 h-4 w-4" />
		Tillbaka till startsidan
	</Button>

	<Card>
		<CardContent class="pt-6">
			{#if isInvoiceBooking}
				<Alert class="mb-6">
					<AlertTitle>Tack för din bokning!</AlertTitle>
					<AlertDescription>
						Din bokningsförfrågan med faktura som betalningsmetod har mottagits. En faktura kommer
						att skickas till dig inom kort. Bokningen är preliminär tills fakturan är betald.
					</AlertDescription>
				</Alert>
			{:else}
				<Alert class="mb-6">
					<AlertTitle>Tack för din bokning!</AlertTitle>
					<AlertDescription>
						Din betalning har genomförts och din bokning är bekräftad.
					</AlertDescription>
				</Alert>
			{/if}

			<!-- Resten av din befintliga bokningsdetaljsvy... -->
			<div class="space-y-6">
				<div class="booking-details">
					<h2 class="text-xl font-semibold mb-4">Bokningsdetaljer</h2>
					<div class="grid gap-3">
						<div class="flex justify-between">
							<span>Bokningsnummer</span>
							<span>#{booking.id}</span>
						</div>
						<div class="flex justify-between">
							<span>Upplevelse</span>
							<span>{booking.experience}</span>
						</div>
						<div class="flex justify-between">
							<span>Startplats</span>
							<span>{formatValue(booking.startLocationName)}</span>
						</div>
						<div class="flex justify-between">
							<span>Datum</span>
							<span>{formatDateTime(booking.start_date, booking.start_time)}</span>
						</div>
						{#if booking.end_date}
							<div class="flex justify-between">
								<span>Slutdatum</span>
								<span>{formatDateTime(booking.end_date, booking.end_time)}</span>
							</div>
						{/if}
						<div class="flex justify-between">
							<span>Antal vuxna</span>
							<span>{booking.number_of_adults}</span>
						</div>
						<div class="flex justify-between">
							<span>Antal barn</span>
							<span>{booking.number_of_children}</span>
						</div>
					</div>
				</div>

				<!-- Fakturauppgifter -->
				{#if booking.payment_method === 'invoice' && booking.invoice_details && Object.keys(booking.invoice_details).length > 0}
					<div class="mt-6 border-t pt-4">
						<h3 class="text-lg font-medium mb-2">Fakturauppgifter</h3>
						<div class="space-y-2">
							<div class="flex justify-between">
								<span>Organisation:</span>
								<span>{booking.invoice_details.organization || 'Ej angiven'}</span>
							</div>
							<div class="flex justify-between">
								<span>Adress:</span>
								<span>{booking.invoice_details.address || 'Ej angiven'}</span>
							</div>
							<div class="flex justify-between">
								<span>Postnummer:</span>
								<span>{booking.invoice_details.postal_code || 'Ej angivet'}</span>
							</div>
							<div class="flex justify-between">
								<span>Ort:</span>
								<span>{booking.invoice_details.city || 'Ej angiven'}</span>
							</div>
							{#if booking.invoice_details.marking}
								<div class="flex justify-between">
									<span>Märkning:</span>
									<span>{booking.invoice_details.marking}</span>
								</div>
							{/if}
							{#if booking.invoice_details.invoice_type === 'electronic' && booking.invoice_details.gln_peppol_id}
								<div class="flex justify-between">
									<span>GLN/PEPPOL-ID:</span>
									<span>{booking.invoice_details.gln_peppol_id}</span>
								</div>
							{/if}
							<div class="flex justify-between">
								<span>Faktura skickas till:</span>
								<span
									>{booking.invoice_details.invoice_email ||
										booking.customer_email ||
										'Ej angiven'}</span
								>
							</div>
						</div>
					</div>
				{/if}

				<!-- Tillvalsprodukter - Flyttad utanför isInvoiceBooking-blocket -->
				{#if booking.optional_products && booking.optional_products.length > 0}
					<div class="mt-4">
						<h4 class="font-semibold mb-2">Tillvalsprodukter</h4>
						<div class="space-y-2">
							{#each booking.optional_products as product}
								<div class="flex justify-between">
									<span>{product.name} ({product.quantity} st):</span>
									<span>{formatPrice(product.total_price)} kr</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				{#if isInvoiceBooking}
					<div class="mt-6 bg-yellow-50 p-4 rounded-lg">
						<h3 class="font-semibold mb-2">Viktig information om fakturering</h3>
						<div class="space-y-4">
							<p>
								En faktura kommer att skickas {booking.invoiceType === 'electronic'
									? 'till din e-postadress'
									: 'elektroniskt'} inom kort. Vänligen notera att bokningen inte är bekräftad förrän
								fakturan är betald.
							</p>

							<div class="mt-4">
								<h4 class="font-semibold mb-2">Faktureringsinformation</h4>
								<div class="space-y-2">
									<div class="flex justify-between">
										<span>Fakturatyp:</span>
										<span
											>{booking.invoiceType === 'electronic'
												? 'Elektronisk faktura'
												: 'PDF-faktura'}</span
										>
									</div>

									{#if booking.invoiceType === 'electronic'}
										<div class="flex justify-between">
											<span>GLN/PEPPOL-ID:</span>
											<span>{formatValue(booking.glnPeppolId)}</span>
										</div>
										<div class="flex justify-between">
											<span>Märkning:</span>
											<span>{formatValue(booking.marking)}</span>
										</div>
									{:else}
										<!-- Visa PDF-fakturainformation -->
										<div class="flex justify-between">
											<span>E-postadress för faktura:</span>
											<span>{formatValue(booking.invoiceEmail)}</span>
										</div>
									{/if}

									<!-- Gemensamma fält för båda fakturatyper -->
									<div class="flex justify-between">
										<span>Organisation:</span>
										<span>{formatValue(booking.organization)}</span>
									</div>
									<div class="flex justify-between">
										<span>Adress:</span>
										<span>{formatValue(booking.address)}</span>
									</div>
									<div class="flex justify-between">
										<span>Postnummer:</span>
										<span>{formatValue(booking.postalCode)}</span>
									</div>
									<div class="flex justify-between">
										<span>Ort:</span>
										<span>{formatValue(booking.city)}</span>
									</div>
								</div>
							</div>

							<!-- Efter faktureringsinformationen -->
							{#if booking.addons && booking.addons.length > 0}
								<div class="mt-4">
									<h4 class="font-semibold mb-2">Bokade produkter</h4>
									<div class="space-y-2">
										{#each booking.addons as addon}
											{#if addon.amount > 0}
												<div class="flex justify-between">
													<span>{addon.name}:</span>
													<span>{addon.amount} st</span>
												</div>
											{/if}
										{/each}
									</div>
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Prisdetaljer - Flyttad längst ner -->
				<div class="price-details mt-6">
					<h3 class="text-lg font-medium mb-2">Prisdetaljer</h3>
					<div class="space-y-2">
						<!-- Vuxna -->
						<div class="flex justify-between">
							<span>Vuxna ({booking.number_of_adults} st):</span>
							<span
								>{formatPrice(booking.subtotal - (booking.optional_products_total || 0))} kr</span
							>
						</div>

						<!-- Tillvalsprodukter total (om det finns) -->
						{#if booking.optional_products && booking.optional_products.length > 0}
							<div class="flex justify-between">
								<span>Tillvalsprodukter:</span>
								<span>{formatPrice(booking.optional_products_total)} kr</span>
							</div>
						{/if}

						<!-- Delsumma -->
						<div class="flex justify-between border-t pt-2">
							<span>Delsumma:</span>
							<span>{formatPrice(booking.subtotal)} kr</span>
						</div>

						<!-- Moms -->
						<div class="flex justify-between">
							<span>Moms (25%):</span>
							<span>{formatPrice(booking.vat)} kr</span>
						</div>

						<!-- Totalt -->
						<div class="flex justify-between font-bold border-t pt-2">
							<span>Totalt att betala:</span>
							<span>{formatPrice(booking.total)} kr</span>
						</div>
					</div>
				</div>
			</div>
		</CardContent>
	</Card>
</div>
