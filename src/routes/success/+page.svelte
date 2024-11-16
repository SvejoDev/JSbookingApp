<script>
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import {
		Card,
		CardContent,
		CardDescription,
		CardFooter,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';

	export let data;
	const { booking } = data;

	// Formatera datum och tid
	const formatDateTime = (date, time) => {
		const dateObj = new Date(`${date}T${time}`);
		return dateObj.toLocaleString('sv-SE', {
			dateStyle: 'long',
			timeStyle: 'short'
		});
	};
</script>

<div class="container mx-auto py-10 px-4">
	<Alert class="mb-6">
		<AlertTitle>Bokning bekräftad!</AlertTitle>
		<AlertDescription>
			Tack för din bokning. Vi har skickat en bekräftelse till {booking.customer_email}
		</AlertDescription>
	</Alert>

	<Card class="w-full max-w-2xl mx-auto">
		<CardHeader>
			<CardTitle>{booking.experience}</CardTitle>
			<CardDescription>Bokningsnummer: {booking.id}</CardDescription>
		</CardHeader>

		<CardContent>
			<div class="space-y-4">
				<div class="grid grid-cols-2 gap-4">
					<div>
						<h4 class="font-medium text-sm">Start</h4>
						<p>{formatDateTime(booking.start_date, booking.start_time)}</p>
					</div>
					<div>
						<h4 class="font-medium text-sm">Slut</h4>
						<p>{formatDateTime(booking.end_date, booking.end_time)}</p>
					</div>
				</div>

				<div>
					<h4 class="font-medium text-sm">Deltagare</h4>
					<p>
						{booking.number_of_adults} vuxna{#if booking.number_of_children}, {booking.number_of_children}
							barn{/if}
					</p>
				</div>

				<div>
					<h4 class="font-medium text-sm">Utrustning</h4>
					<ul class="list-disc list-inside">
						{#if booking.amount_canoes > 0}
							<li>{booking.amount_canoes} kanoter</li>
						{/if}
						{#if booking.amount_kayak > 0}
							<li>{booking.amount_kayak} kajaker</li>
						{/if}
						{#if booking.amount_sup > 0}
							<li>{booking.amount_sup} SUP-brädor</li>
						{/if}
					</ul>
				</div>

				{#if booking.startLocation}
					<div>
						<h4 class="font-medium text-sm">Startplats</h4>
						<p>{booking.startLocation}</p>
					</div>
				{/if}

				{#if booking.customer_comment}
					<div>
						<h4 class="font-medium text-sm">Meddelande</h4>
						<p>{booking.customer_comment}</p>
					</div>
				{/if}
			</div>
		</CardContent>

		<CardFooter>
			<p class="text-sm text-gray-500">Totalbelopp: {booking.amount_total} SEK</p>
		</CardFooter>
	</Card>
</div>
