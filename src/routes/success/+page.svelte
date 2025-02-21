<script>
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { ArrowLeft } from 'lucide-svelte';

	export let data;
	const { booking, isInvoiceBooking } = data;

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
							<span>{booking.startlocation_name}</span>
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

				<!-- Prisdetaljer -->
				<div class="price-details">
					<h2 class="text-xl font-semibold mb-4">Prisdetaljer</h2>
					<div class="space-y-2">
						<div class="flex justify-between">
							<span>Totalt (exkl. moms)</span>
							<span>{formatPrice(booking.subtotal)} kr</span>
						</div>
						<div class="flex justify-between">
							<span>Moms (25%)</span>
							<span>{formatPrice(booking.vat)} kr</span>
						</div>
						<div class="flex justify-between font-bold">
							<span>Totalt att betala</span>
							<span>{formatPrice(booking.total)} kr</span>
						</div>
					</div>
				</div>

				{#if isInvoiceBooking}
					<div class="mt-6 bg-yellow-50 p-4 rounded-lg">
						<h3 class="font-semibold mb-2">Viktig information om fakturering</h3>
						<div class="space-y-4">
							<p>
								En faktura kommer att skickas {booking.invoice_type === 'pdf'
									? 'till din e-postadress'
									: 'elektroniskt'} inom kort. Vänligen notera att bokningen inte är bekräftad förrän
								fakturan är betald.
							</p>

							<div class="mt-4">
								<h4 class="font-semibold mb-2">Faktureringsinformation</h4>
								{#if booking.invoice_type === 'pdf'}
									<div class="grid gap-2">
										<div class="flex justify-between">
											<span>Fakturatyp:</span>
											<span>PDF-faktura</span>
										</div>
										<div class="flex justify-between">
											<span>E-postadress:</span>
											<span>{booking.invoice_email}</span>
										</div>
										<div class="flex justify-between">
											<span>Organisation:</span>
											<span>{booking.organization}</span>
										</div>
										<div class="flex justify-between">
											<span>Adress:</span>
											<span>{booking.address}</span>
										</div>
										<div class="flex justify-between">
											<span>Postnummer:</span>
											<span>{booking.postal_code}</span>
										</div>
									</div>
								{:else}
									<div class="grid gap-2">
										<div class="flex justify-between">
											<span>Fakturatyp:</span>
											<span>Elektronisk faktura</span>
										</div>
										<div class="flex justify-between">
											<span>GLN/PEPPOL-ID:</span>
											<span>{booking.gln_peppol_id}</span>
										</div>
										<div class="flex justify-between">
											<span>Märkning:</span>
											<span>{booking.marking}</span>
										</div>
										<div class="flex justify-between">
											<span>Organisation:</span>
											<span>{booking.organization}</span>
										</div>
										<div class="flex justify-between">
											<span>Adress:</span>
											<span>{booking.address}</span>
										</div>
										<div class="flex justify-between">
											<span>Postnummer:</span>
											<span>{booking.postal_code}</span>
										</div>
										<div class="flex justify-between">
											<span>Ort:</span>
											<span>{booking.city}</span>
										</div>
									</div>
								{/if}
							</div>
						</div>
					</div>
				{/if}

				<!-- Kontaktinformation och övrig information... -->
			</div>
		</CardContent>
	</Card>
</div>
