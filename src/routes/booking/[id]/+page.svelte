<script>
	import { supabase } from '$lib/supabaseClient.js';
	import { Swedish } from 'flatpickr/dist/l10n/sv.js'; // Add this import at the top with other imports

	import { Button } from '$lib/components/ui/button';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Alert, AlertTitle, AlertDescription } from '$lib/components/ui/alert';
	import {
		Select,
		SelectTrigger,
		SelectContent,
		SelectItem,
		SelectValue
	} from '$lib/components/ui/select';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Loader2 } from 'lucide-svelte';

	import flatpickr from 'flatpickr';
	import 'flatpickr/dist/flatpickr.css';
	import { onMount } from 'svelte';

	export let data;

	//Addon variabler
	let amountCanoes = 0;
	let amountKayaks = 0;
	let amountSUPs = 0;

	let maxCanoes = 0;
	let maxKayaks = 0;
	let maxSUPs = 0;

	async function fetchMaxQuantities() {
		const { data: addons, error } = await supabase.from('addons').select('id, max_quantity');

		if (error) {
			console.error('Error fetching max quantities:', error);
			return;
		}

		addons.forEach((addon) => {
			if (addon.id === 1) maxCanoes = addon.max_quantity;
			if (addon.id === 2) maxKayaks = addon.max_quantity;
			if (addon.id === 3) maxSUPs = addon.max_quantity;
		});
	}

	let blockedDates = [];
	let startDate = null;
	let minDate = null;
	let maxDate = null;
	let startTime = null;
	let possibleStartTimes = [];
	let selectedBookingLength = null;
	let returnDate = null;
	let returnTime = null;
	let selectedStartLocation = null;
	let numAdults = 0;
	let numChildren = 0;
	let totalPrice = 0;
	let isLoadingTimes = false;

	let hasCheckedTimes = false;

	//Hitta namnet till tillvalsprodukten
	let selectedStartLocationName = '';

	$: {
		const selectedLocation = data.startLocations.find(
			(location) => location.id === selectedStartLocation
		);
		selectedStartLocationName = selectedLocation ? selectedLocation.location : '';
	}

	//Kunduppgifter:
	let userName = '';
	let userLastname = '';
	let userPhone = '';
	let userEmail = '';
	let userComment = '';
	let acceptTerms = false;

	// Genererar möjliga starttider baserat på öppettider och vald bokningslängd
	async function generateStartTimes() {
		if (!startDate || !selectedBookingLength) {
			possibleStartTimes = [];
			return;
		}

		isLoadingTimes = true;
		startTime = null;
		hasCheckedTimes = true;

		try {
			const response = await fetch('/api/check-availability', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					date: startDate,
					bookingLength: selectedBookingLength,
					addons: {
						amountCanoes,
						amountKayaks,
						amountSUPs
					}
				})
			});

			if (!response.ok) {
				throw new Error('Failed to check availability');
			}

			const { availableStartTimes } = await response.json();
			possibleStartTimes = availableStartTimes;
		} catch (error) {
			console.error('Error checking availability:', error);
			possibleStartTimes = [];
		} finally {
			isLoadingTimes = false;
		}
	}

	// Beräknar returdatum och returtid baserat på vald starttid och bokningslängd
	function calculateReturnDate() {
		if (!selectedBookingLength || !startTime || !startDate) {
			console.error('Data saknas för att beräkna returdatum.');
			return;
		}

		const bookingLength = data.bookingLengths.find((b) => b.length === selectedBookingLength);
		if (!bookingLength) {
			console.error('Data för bokningslängd saknas');
			return;
		}

		const startDateTime = new Date(`${startDate}T${startTime}`);
		if (isNaN(startDateTime.getTime())) {
			console.error('Ogiltigt startdatum eller starttid');
			return;
		}

		let returnDateTime = new Date(startDateTime);

		if (bookingLength.overnight) {
			returnDateTime.setDate(returnDateTime.getDate() + bookingLength.return_day_offset);
			const closeTimeParts = data.openHours.close_time.split(':');
			returnDateTime.setHours(parseInt(closeTimeParts[0]), parseInt(closeTimeParts[1]), 0, 0);
		} else if (bookingLength.length === 'Hela dagen') {
			const closeTimeParts = data.openHours.close_time.split(':');
			returnDateTime.setHours(parseInt(closeTimeParts[0]), parseInt(closeTimeParts[1]), 0, 0);
		} else {
			const hoursToAdd = parseInt(bookingLength.length);
			returnDateTime.setHours(returnDateTime.getHours() + hoursToAdd);

			const closeTime = new Date(`${startDate}T${data.openHours.close_time}`);
			if (returnDateTime > closeTime) {
				returnDateTime = closeTime;
			}
		}

		returnDate = returnDateTime.toISOString().split('T')[0];
		returnTime = returnDateTime.toTimeString().substring(0, 5);
	}

	// Sorterar bokningslängder baserat på varaktighet och typ
	function sortBookingLengths(bookingLengths) {
		return bookingLengths.sort((a, b) => {
			if (a.length.includes('h') && b.length.includes('h')) {
				return parseInt(a.length) - parseInt(b.length);
			}
			if (a.length.includes('h')) return -1;
			if (b.length.includes('h')) return 1;
			if (a.length === 'Hela dagen') return -1;
			if (b.length === 'Hela dagen') return 1;
			return 0;
		});
	}

	let sortedBookingLengths = [];

	$: {
		if (selectedStartLocation) {
			// Kontrollera om location_id är string eller number
			const filtered = data.bookingLengths.filter((bl) => {
				return Number(bl.location_id) === Number(selectedStartLocation);
			});

			sortedBookingLengths = sortBookingLengths(filtered);
		} else {
			sortedBookingLengths = [];
		}
	}

	onMount(async () => {
		await fetchMaxQuantities();
		const today = new Date();

		if (data.openHours && data.openHours.start_date && data.openHours.end_date) {
			const dbMinDate = new Date(data.openHours.start_date);
			minDate = dbMinDate > today ? dbMinDate : today;
			maxDate = new Date(data.openHours.end_date);
		}

		if (data.blocked_dates) {
			blockedDates = data.blocked_dates.map((blocked) => new Date(blocked.blocked_date));
		}

		// Initierar Flatpickr-kalendern med anpassade inställningar
		flatpickr('#booking-calendar', {
			disableMobile: 'true',
			minDate: minDate,
			maxDate: maxDate,
			disable: blockedDates,
			dateFormat: 'Y-m-d',
			weekNumbers: true,
			locale: Swedish, // Add Swedish locale which defaults to Monday as first day
			onChange: (selectedDates, dateStr) => {
				startDate = dateStr;
			}
		});
	});

	function updatePrice() {
		if (selectedStartLocation && data.startLocations) {
			const selectedLocation = data.startLocations.find(
				(location) => location.id === selectedStartLocation
			);
			if (selectedLocation) {
				totalPrice = numAdults * selectedLocation.price;
			} else {
				console.error('Vald startplats hittades inte');
				totalPrice = 0;
			}
		} else {
			totalPrice = 0;
		}
	}
	$: {
		if (selectedStartLocation || numAdults) {
			updatePrice();
		}
	}

	$: if (startDate && startTime && selectedBookingLength) {
		calculateReturnDate();
	}

	//Stripe

	import { loadStripe } from '@stripe/stripe-js';

	let stripePromise;

	onMount(async () => {
		stripePromise = await loadStripe(
			'pk_test_51Q3N7cP8OFkPaMUNpmkTh09dCDHBxYz4xWIC15fBXB4UerJpV9qXhX5PhT0f1wxwdcGVlenqQaKw0m6GpKUZB0jj00HBzDqWig'
		);
	});

	async function handleCheckout() {
		try {
			const stripe = await stripePromise;
			console.log('Sending request to create-checkout-session...');

			// Log the data being sent
			const requestData = {
				amount: totalPrice,
				name: data.experience.name,
				experience_id: data.experience.id,
				experience: data.experience.name,
				startLocation: selectedStartLocationName,
				start_date: startDate,
				start_time: startTime,
				end_date: returnDate,
				end_time: returnTime,
				number_of_adults: numAdults,
				number_of_children: numChildren,
				amount_canoes: amountCanoes,
				amount_kayak: amountKayaks,
				amount_SUP: amountSUPs,
				booking_name: userName,
				booking_lastname: userLastname,
				customer_comment: userComment,
				customer_email: userEmail
			};
			console.log('Request Data:', requestData);

			const response = await fetch('/api/create-checkout-session', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestData)
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error('Server response:', response.status, errorText);
				throw new Error(`Server error: ${response.status} ${errorText}`);
			}

			const session = await response.json();
			console.log('Received session:', session);

			if (!session.id) {
				throw new Error('Invalid session data received from server');
			}

			const result = await stripe.redirectToCheckout({
				sessionId: session.id
			});

			if (result.error) {
				console.error('Stripe redirect error:', result.error);
				throw new Error(result.error.message);
			}
		} catch (error) {
			console.error('Checkout error:', error);
			// Here you might want to show an error message to the user
		}
	}
</script>

{#if data.experience}
	<div class="container mx-auto p-4 space-y-6">
		<Card>
			<CardHeader>
				<CardTitle>{data.experience.name}</CardTitle>
			</CardHeader>
			<CardContent class="space-y-6">
				<!-- Startplats -->
				<div class="space-y-2">
					<Label for="startLocation">Välj startplats</Label>
					<select
						id="startLocation"
						bind:value={selectedStartLocation}
						on:change={updatePrice}
						class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
					>
						<option value="">Välj startplats</option>
						{#each data.startLocations as location}
							<option value={location.id}>
								{location.location} - {location.price}kr
							</option>
						{/each}
					</select>
				</div>

				<!-- Bokningslängd -->
				<div class="space-y-2">
					<Label for="bookingLength">Välj bokningslängd</Label>
					<select
						id="bookingLength"
						bind:value={selectedBookingLength}
						class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
						disabled={!selectedStartLocation}
					>
						<option value="">Välj längd</option>
						{#each sortedBookingLengths as duration}
							<option value={duration.length}>
								{duration.length}
							</option>
						{/each}
					</select>
				</div>

				<!-- Datum -->
				<div class="space-y-2">
					<Label for="booking-calendar">Välj datum</Label>
					<Input
						id="booking-calendar"
						type="text"
						placeholder="Välj datum"
						class="flatpickr-input"
					/>
				</div>
			</CardContent>
		</Card>

		{#if startDate && selectedBookingLength}
			<Card>
				<CardHeader>
					<CardTitle>Välj utrustning och tid</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="grid gap-6">
						<!-- Tillval -->
						<div class="space-y-4">
							<Label>Välj tillval:</Label>
							<div class="grid gap-4 sm:grid-cols-3">
								<!-- Kanadensare -->
								<div class="space-y-2">
									<Label for="canoes">Antal kanadensare (max {maxCanoes})</Label>
									<div class="flex items-center space-x-2">
										<Button
											variant="outline"
											class="px-3"
											on:click={() => (amountCanoes = Math.max(0, amountCanoes - 1))}
										>
											-
										</Button>
										<div class="w-12 text-center">{amountCanoes}</div>
										<Button
											variant="outline"
											class="px-3"
											on:click={() => (amountCanoes = Math.min(maxCanoes, amountCanoes + 1))}
										>
											+
										</Button>
									</div>
								</div>

								<!-- Kajaker -->
								<div class="space-y-2">
									<Label for="kayaks">Antal kajaker (max {maxKayaks})</Label>
									<div class="flex items-center space-x-2">
										<Button
											variant="outline"
											class="px-3"
											on:click={() => (amountKayaks = Math.max(0, amountKayaks - 1))}
										>
											-
										</Button>
										<div class="w-12 text-center">{amountKayaks}</div>
										<Button
											variant="outline"
											class="px-3"
											on:click={() => (amountKayaks = Math.min(maxKayaks, amountKayaks + 1))}
										>
											+
										</Button>
									</div>
								</div>

								<!-- SUP -->
								<div class="space-y-2">
									<Label for="sups">Antal SUP:ar (max {maxSUPs})</Label>
									<div class="flex items-center space-x-2">
										<Button
											variant="outline"
											class="px-3"
											on:click={() => (amountSUPs = Math.max(0, amountSUPs - 1))}
										>
											-
										</Button>
										<div class="w-12 text-center">{amountSUPs}</div>
										<Button
											variant="outline"
											class="px-3"
											on:click={() => (amountSUPs = Math.min(maxSUPs, amountSUPs + 1))}
										>
											+
										</Button>
									</div>
								</div>
							</div>
						</div>

						<!-- Sök tider knapp -->
						<Button
							on:click={generateStartTimes}
							disabled={!startDate ||
								!selectedBookingLength ||
								isLoadingTimes ||
								(amountCanoes === 0 && amountKayaks === 0 && amountSUPs === 0)}
							variant={isLoadingTimes ? 'outline' : 'default'}
							class="w-full sm:w-auto"
						>
							{#if isLoadingTimes}
								<Loader2 class="mr-2 h-4 w-4 animate-spin" />
								Söker tillgängliga tider...
							{:else if amountCanoes === 0 && amountKayaks === 0 && amountSUPs === 0}
								Välj minst en produkt
							{:else}
								Visa tillgängliga tider
							{/if}
						</Button>

						<!-- Tillgängliga tider -->
						{#if possibleStartTimes.length > 0}
							<div class="space-y-2">
								<Label>Tillgängliga starttider:</Label>
								<div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
									{#each possibleStartTimes as time}
										<Button
											variant={startTime === time ? 'default' : 'outline'}
											on:click={() => (startTime = time)}
											class="w-full"
										>
											{time}
										</Button>
									{/each}
								</div>
							</div>
						{:else if hasCheckedTimes && !isLoadingTimes}
							<Alert variant="destructive">
								<AlertTitle>Inga tillgängliga tider</AlertTitle>
								<AlertDescription>
									Inga tillgängliga starttider hittades för valda produkter. Prova ett annat antal
									produkter eller annat datum.
								</AlertDescription>
							</Alert>
						{/if}

						<!-- Vald tid info -->
						{#if startTime}
							<Alert>
								<AlertTitle>Din bokning</AlertTitle>
								<AlertDescription>
									{#if returnDate && returnTime}
										Startdatum: {startDate}
										<br />
										Starttid: {startTime}
										<br />
										Returdatum: {returnDate}
										<br />
										Returtid senast: {returnTime}
									{/if}
								</AlertDescription>
							</Alert>
						{/if}
					</div>
				</CardContent>
			</Card>
		{/if}

		{#if selectedStartLocation && startTime}
			<Card>
				<CardHeader>
					<CardTitle>Antal deltagare</CardTitle>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="space-y-2">
						<Label for="adults">Antal vuxna</Label>
						<Input type="number" id="adults" min="0" bind:value={numAdults} />
					</div>
					<div class="space-y-2">
						<Label for="children">Antal barn (gratis)</Label>
						<Input type="number" id="children" min="0" bind:value={numChildren} />
					</div>
					<Alert>
						<AlertTitle>Totalt pris</AlertTitle>
						<AlertDescription>{totalPrice}kr</AlertDescription>
					</Alert>
				</CardContent>
			</Card>
		{/if}

		{#if selectedStartLocation && startDate && startTime && selectedBookingLength}
			<Card>
				<CardHeader>
					<CardTitle>Kontaktuppgifter</CardTitle>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="firstName">Förnamn</Label>
							<Input type="text" id="firstName" bind:value={userName} required />
						</div>
						<div class="space-y-2">
							<Label for="lastName">Efternamn</Label>
							<Input type="text" id="lastName" bind:value={userLastname} required />
						</div>
					</div>
					<div class="space-y-2">
						<Label for="phone">Telefonnummer</Label>
						<Input
							type="tel"
							id="phone"
							bind:value={userPhone}
							pattern="^\+?[1-9]\d{(1, 14)}$"
							required
						/>
					</div>
					<div class="space-y-2">
						<Label for="email">E-postadress</Label>
						<Input type="email" id="email" bind:value={userEmail} required />
					</div>
					<div class="space-y-2">
						<Label for="comment">Kommentar (valfri)</Label>
						<Textarea id="comment" bind:value={userComment} />
					</div>
					<div class="flex items-center space-x-2">
						<Checkbox bind:checked={acceptTerms} id="terms" />
						<Label for="terms">I accept the booking agreement and the terms of purchase</Label>
					</div>
					<Button disabled={!acceptTerms} on:click={handleCheckout} class="w-full">
						Go to payment ({totalPrice}kr)
					</Button>
				</CardContent>
			</Card>
		{/if}
	</div>
{:else}
	<Alert variant="destructive" class="m-4">
		<AlertTitle>Error</AlertTitle>
		<AlertDescription>Upplevelsen hittades inte</AlertDescription>
	</Alert>
{/if}

<style>
	/* Stil för att matcha flatpickr med shadcn design */
	:global(.flatpickr-input) {
		background-color: hsl(var(--background));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		padding: 0.5rem;
		font-size: 0.875rem;
		line-height: 1.25rem;
		width: 100%;
	}

	:global(.flatpickr-input:focus) {
		outline: none;
		border-color: hsl(var(--ring));
		ring: 1px solid hsl(var(--ring));
	}
</style>
