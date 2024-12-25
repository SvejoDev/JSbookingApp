<!--src/routes/booking/[id]/+page.svelte-->
<script>
	import { supabase } from '$lib/supabaseClient.js';

	import { Button } from '$lib/components/ui/button';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Alert, AlertTitle, AlertDescription } from '$lib/components/ui/alert';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Loader2 } from 'lucide-svelte';
	import Calendar from '$lib/components/calendar/Calendar.svelte';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	export let data;

	let selectedAddons = {};

	$: {
		if (data.experience?.addons) {
			// Initiera selectedAddons med 0 för varje tillgänglig addon
			data.experience.addons.forEach((addon) => {
				if (!(addon.name in selectedAddons)) {
					selectedAddons[addon.name] = 0;
				}
			});
		}
	}

	function updateAddonQuantity(addonName, increment) {
		const addon = data.experience.addons.find((a) => a.name === addonName);
		if (addon) {
			const currentValue = selectedAddons[addonName] || 0;
			const newValue = increment
				? Math.min(currentValue + 1, addon.max_quantity)
				: Math.max(0, currentValue - 1);
			selectedAddons[addonName] = newValue;
			selectedAddons = { ...selectedAddons }; // trigger reaktivitet
		}
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
	let hasGeneratedTimes = false;
	let settingsLocked = false;
	let hasCheckedTimes = false;
	let showContactSection = false;
	let selectedExperienceId = data.experience?.id;

	//Hitta namnet till tillvalsprodukten
	let selectedStartLocationName = '';

	$: {
		const selectedLocation = data.startLocations.find(
			(location) => location.id === selectedStartLocation
		);
		selectedStartLocationName = selectedLocation ? selectedLocation.location : '';
	}

	$: {
		if (data.startLocations && data.startLocations.length === 1) {
			selectedStartLocation = data.startLocations[0].id;
			selectedStartLocationName = data.startLocations[0].location;
		}
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
		hasGeneratedTimes = true;
		settingsLocked = true;

		scrollToElement('available-times');

		const addonsForRequest = Object.fromEntries(
			Object.entries(selectedAddons).map(([name, quantity]) => {
				// Konvertera namn till det format API:et förväntar sig
				const apiName = `amount${name.replace(/\s+/g, '')}s`;
				return [apiName, quantity];
			})
		);

		try {
			const response = await fetch('/api/check-availability', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					date: startDate,
					bookingLength: selectedBookingLength,
					addons: addonsForRequest,
					experienceId: selectedExperienceId
				})
			});

			const { availableStartTimes, error } = await response.json();

			if (error) {
				console.error('Server error:', error);
				possibleStartTimes = [];
				return;
			}

			possibleStartTimes = availableStartTimes;
			if (possibleStartTimes.length > 0) {
				scrollToElement('available-times');
			}
		} catch (error) {
			console.error('Error checking availability:', error);
			possibleStartTimes = [];
		} finally {
			isLoadingTimes = false;
		}
	}
	function handleSettingChange() {
		if (hasGeneratedTimes) {
			possibleStartTimes = [];
			startTime = null;
			hasGeneratedTimes = false;
			settingsLocked = false;
			hasCheckedTimes = false;
		}
	}

	//Nästa steg för kontaktuppgifter
	function handleNextStep() {
		showContactSection = true;
		scrollToElement('contact-section');
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
		// Ta bort fetchMaxQuantities-anropet här
		const today = new Date();

		if (data.openHours && data.openHours.start_date && data.openHours.end_date) {
			const dbMinDate = new Date(data.openHours.start_date);
			minDate = dbMinDate > today ? dbMinDate : today;
			maxDate = new Date(data.openHours.end_date);
		}

		if (data.blocked_dates) {
			blockedDates = data.blocked_dates.map((blocked) => new Date(blocked.blocked_date));
		}
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

	$: selectedExperienceId = data.experience?.id;

	$: if (startDate && startTime && selectedBookingLength) {
		calculateReturnDate();
	}

	$: if (startTime) {
		scrollToElement('booking-summary');
	}

	$: if (possibleStartTimes.length > 0) {
		scrollToElement('time-selection');
	}

	$: if (startDate && selectedBookingLength && selectedStartLocation) {
		scrollToElement('equipment-section');
	}

	//Skrolla ned funktion:
	function scrollToElement(elementId) {
		if (browser) {
			setTimeout(() => {
				const element = document.getElementById(elementId);
				if (element) {
					element.scrollIntoView({ behavior: 'smooth', block: 'start' });
				}
			}, 100);
		}
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

			// Konvertera selectedAddons till rätt format för API:et
			const addonAmounts = Object.entries(selectedAddons).reduce((acc, [name, quantity]) => {
				// Konvertera namn till det format API:et förväntar sig
				// T.ex. "Kanot" blir "amount_canoes"
				const apiKey = `amount_${name.toLowerCase()}`;
				return {
					...acc,
					[apiKey]: quantity
				};
			}, {});

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
				...addonAmounts, // Sprider ut de konverterade addon-värdena
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
			// Här kan du visa ett felmeddelande för användaren
		}
	}
</script>

{#if data.experience && data.experience.id}
	<div class="max-w-7xl mx-auto p-4 overflow-hidden">
		<!-- Added overflow-hidden -->
		<div
			class="flex flex-col lg:flex-row gap-6 justify-center items-start max-w-5xl mx-auto relative"
		>
			<!-- Added relative -->
			<!-- First card -->
			<Card
				class="w-full lg:w-1/2 transition-all duration-300 ease-in-out {selectedStartLocation &&
				selectedBookingLength
					? 'lg:translate-x-[-5%]'
					: 'lg:translate-x-0'}"
			>
				<CardHeader>
					<CardTitle>{data.experience.name}</CardTitle>
				</CardHeader>
				<CardContent class="space-y-6">
					<!-- StartLocation -->
					<div class="space-y-2">
						<Label for="startLocation">1. Välj startplats</Label>
						{#if data.startLocations.length === 1}
							<div
								class="flex h-10 w-full items-center rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground"
							>
								{data.startLocations[0].location} - {data.startLocations[0].price}kr
							</div>
						{:else}
							<select
								id="startLocation"
								bind:value={selectedStartLocation}
								on:change={() => {
									updatePrice();
									if (hasGeneratedTimes) handleSettingChange();
								}}
								disabled={settingsLocked}
								class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
							>
								<option value="" disabled selected>Välj startplats</option>
								{#each data.startLocations as location}
									<option value={location.id}>
										{location.location} - {location.price}kr
									</option>
								{/each}
							</select>
						{/if}
					</div>

					<!-- Booking Length -->
					<div class="space-y-2">
						<Label for="bookingLength">
							2. Välj bokningslängd
							{#if !selectedStartLocation}
								<span class="text-sm text-muted-foreground ml-2">(Välj startplats först)</span>
							{/if}
						</Label>
						<select
							id="bookingLength"
							bind:value={selectedBookingLength}
							on:change={() => {
								if (hasGeneratedTimes) handleSettingChange();
							}}
							class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
							disabled={!selectedStartLocation || settingsLocked}
						>
							<option value="" disabled selected>Välj bokningslängd</option>
							{#each sortedBookingLengths as duration}
								<option value={duration.length}>
									{duration.length}
								</option>
							{/each}
						</select>
					</div>
				</CardContent>
			</Card>

			{#if selectedStartLocation && selectedBookingLength}
				<div
					class="w-full lg:w-1/2 transition-all duration-300 ease-in-out translate-x-[50%] animate-slideIn"
				>
					<!-- Adjusted from 100% to 50% -->

					<div class="calendar-container mt-4">
						<CardHeader class="mb-4">
							<CardTitle>Välj datum</CardTitle>
						</CardHeader>
						<Calendar
							{minDate}
							{maxDate}
							openingPeriods={[
								{
									start_date: data.openHours.start_date,
									end_date: data.openHours.end_date
								}
							]}
							{blockedDates}
							selectedDate={startDate}
							on:dateSelect={(event) => {
								const date = event.detail;
								const year = date.getFullYear();
								const month = String(date.getMonth() + 1).padStart(2, '0');
								const day = String(date.getDate()).padStart(2, '0');
								startDate = `${year}-${month}-${day}`;
								if (hasGeneratedTimes) handleSettingChange();
							}}
							bookingLength={selectedBookingLength
								? data.bookingLengths.find((b) => b.length === selectedBookingLength)
								: null}
						/>
					</div>
				</div>
			{/if}
		</div>
		{#if startDate && selectedBookingLength}
			<Card id="equipment-section">
				<CardHeader>
					<CardTitle>Välj utrustning och tid</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="grid gap-6">
						<!-- Tillval -->
						<div class="space-y-4">
							<Label>Välj tillval:</Label>
							<div class="grid gap-4 sm:grid-cols-3">
								{#each data.experience.addons as addon}
									<div class="space-y-2">
										<Label for={addon.name}>Antal {addon.name} (max {addon.max_quantity})</Label>
										<div class="flex items-center space-x-2">
											<Button
												variant="outline"
												class="px-3"
												disabled={settingsLocked}
												on:click={() => updateAddonQuantity(addon.name, false)}
											>
												-
											</Button>
											<div class="w-12 text-center">
												{selectedAddons[addon.name] || 0}
											</div>
											<Button
												variant="outline"
												class="px-3"
												disabled={settingsLocked}
												on:click={() => updateAddonQuantity(addon.name, true)}
											>
												+
											</Button>
										</div>
									</div>
								{/each}
							</div>
						</div>

						<!-- Sök tider knapp -->
						<div class="flex gap-2 flex-wrap">
							<Button
								disabled={!startDate ||
									!selectedBookingLength ||
									isLoadingTimes ||
									Object.values(selectedAddons).every((v) => v === 0)}
								variant={isLoadingTimes ? 'outline' : 'default'}
								class="sm:w-auto"
								on:click={generateStartTimes}
							>
								{#if isLoadingTimes}
									<Loader2 class="mr-2 h-4 w-4 animate-spin" />
									Söker tillgängliga tider...
								{:else if Object.values(selectedAddons).every((v) => v === 0)}
									Välj minst en produkt
								{:else}
									Visa tillgängliga tider
								{/if}
							</Button>

							{#if settingsLocked}
								<Button
									variant="outline"
									on:click={() => {
										handleSettingChange();
										scrollToElement('equipment-section');
									}}
								>
									Ändra din bokning
								</Button>
							{/if}
						</div>

						<!-- Tillgängliga tider -->
						{#if possibleStartTimes.length > 0}
							<div class="space-y-2" id="time-selection">
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
							<Alert id="booking-summary">
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
										<br />
										<br />
										Valda tillval:
										{#each Object.entries(selectedAddons).filter(([_, quantity]) => quantity > 0) as [name, quantity]}
											<br />
											{quantity} st {name}
										{/each}
									{/if}
								</AlertDescription>
							</Alert>
						{/if}
					</div>
				</CardContent>
			</Card>
		{/if}

		{#if selectedStartLocation && startTime}
			<Card id="participants-section">
				<CardHeader>
					<CardTitle>Antal deltagare</CardTitle>
				</CardHeader>
				<CardContent class="space-y-4">
					<!-- Adults -->
					<div class="space-y-2">
						<Label for="adults">Antal vuxna</Label>
						<div class="flex items-center space-x-2">
							<Button
								variant="outline"
								class="px-3"
								on:click={() => (numAdults = Math.max(0, numAdults - 1))}
							>
								-
							</Button>
							<div class="w-12 text-center">{numAdults}</div>
							<Button variant="outline" class="px-3" on:click={() => (numAdults = numAdults + 1)}>
								+
							</Button>
						</div>
					</div>

					<!-- Children -->
					<div class="space-y-2">
						<Label for="children">Antal barn (gratis)</Label>
						<div class="flex items-center space-x-2">
							<Button
								variant="outline"
								class="px-3"
								disabled={numAdults === 0}
								on:click={() => (numChildren = Math.max(0, numChildren - 1))}
							>
								-
							</Button>
							<div class="w-12 text-center">{numChildren}</div>
							<Button
								variant="outline"
								class="px-3"
								disabled={numAdults === 0}
								on:click={() => (numChildren = numChildren + 1)}
							>
								+
							</Button>
						</div>
					</div>

					<Alert>
						<AlertTitle>Totalt pris</AlertTitle>
						<AlertDescription>{totalPrice}kr</AlertDescription>
					</Alert>

					<Button class="w-full mt-4" disabled={numAdults === 0} on:click={handleNextStep}>
						{#if numAdults === 0}
							Välj antal deltagare
						{:else}
							Nästa steg
						{/if}
					</Button>
				</CardContent>
			</Card>
		{/if}

		{#if selectedStartLocation && startDate && startTime && selectedBookingLength && showContactSection}
			<Card id="contact-section">
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
							pattern="^\+?[1-9]\d{14}$"
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
	.calendar-container {
		background: white;
		padding: 1rem;
		border-radius: 0.5rem;
		border: 1px solid hsl(var(--border));
		margin-top: 0.5rem;
	}

	.transition-all {
		transition-property: all;
		transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
		transition-duration: 2000ms;
	}
	@keyframes slideIn {
		from {
			transform: translateX(10%);
		}
		to {
			transform: translateX(0);
		}
	}

	.animate-slideIn {
		animation: slideIn 1s forwards;
	}
</style>
