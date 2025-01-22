<!--src/routes/booking/[id]/+page.svelte-->
<script>
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
	import { loadStripe } from '@stripe/stripe-js';
	import InvoiceForm from '$lib/components/InvoiceForm.svelte';

	export let data;

	// ==================
	// tillståndsvariabler
	// ==================

	// stripe-relaterade variabler
	let stripePromise;

	// bokningsrelaterade variabler
	let blockedDates = []; // datum som är blockerade för bokning
	let startDate = null; // valt startdatum
	let minDate = null; // tidigaste möjliga bokningsdatum
	let maxDate = null; // senaste möjliga bokningsdatum
	let startTime = null; // vald starttid
	let possibleStartTimes = []; // lista med möjliga starttider
	let selectedBookingLength = null;
	let returnDate = null;
	let returnTime = null;
	let selectedStartLocation = null;
	let selectedStartLocationName = '';
	let selectedExperienceId = data.experience?.id;

	// ui-kontrollvariabler
	let isLoadingTimes = false;
	let hasGeneratedTimes = false;
	let settingsLocked = false;
	let hasCheckedTimes = false;
	let showContactSection = false;

	// deltagarvariabler
	let numAdults = 0;
	let numChildren = 0;
	let totalPrice = 0;

	// kunduppgifter
	let userName = '';
	let userLastname = '';
	let userPhone = '';
	let userEmail = '';
	let userComment = '';
	let acceptTerms = false;

	// tillvalshantering
	let selectedAddons = {};
	let sortedBookingLengths = [];

	// Fakturahantering
	let selectedPaymentMethod = null;
	let invoiceData = {
		invoiceType: 'pdf',
		invoiceEmail: '',
		glnPeppolId: '',
		marking: '',
		organization: '',
		address: '',
		postalCode: '',
		city: ''
	};

	// ==================
	// reaktiva uttryck
	// ==================

	// hanterar tillval när experience data laddas
	$: {
		if (data.experience?.addons) {
			selectedAddons = {
				...selectedAddons,
				...Object.fromEntries(
					data.experience.addons.map((addon) => [
						addon.column_name,
						selectedAddons[addon.column_name] || 0
					])
				)
			};
		}
	}

	// uppdaterar startplatsnamn när plats väljs
	$: {
		const selectedLocation = data.startLocations.find(
			(location) => location.id === selectedStartLocation
		);
		selectedStartLocationName = selectedLocation ? selectedLocation.location : '';
	}

	// hanterar automatisk val av startplats om det bara finns en
	$: {
		if (data.startLocations && data.startLocations.length === 1) {
			selectedStartLocation = data.startLocations[0].id;
			selectedStartLocationName = data.startLocations[0].location;
		}
	}

	// sorterar och filtrerar bokningslängder baserat på vald startplats
	$: {
		if (selectedStartLocation) {
			const filtered = data.bookingLengths.filter((bl) => {
				return Number(bl.location_id) === Number(selectedStartLocation);
			});
			sortedBookingLengths = sortBookingLengths(filtered);
		} else {
			sortedBookingLengths = [];
		}
	}

	// väljer automatiskt bokningslängd om det bara finns ett alternativ
	$: {
		if (sortedBookingLengths.length === 1) {
			selectedBookingLength = sortedBookingLengths[0].length;
		}
	}

	// uppdaterar pris när relevanta val ändras
	$: {
		if (selectedStartLocation || numAdults) {
			updatePrice();
		}
	}

	// beräknar returdatum när nödvändig information finns
	$: if (startDate && startTime && selectedBookingLength) {
		calculateReturnDate();
	}

	// automatisk scrollning till relevanta sektioner
	$: if (startTime) {
		scrollToElement('booking-summary');
	}
	$: if (possibleStartTimes.length > 0) {
		scrollToElement('time-selection');
	}
	$: if (startDate && selectedBookingLength && selectedStartLocation) {
		scrollToElement('equipment-section');
	}

	// ==================
	// hjälpfunktioner
	// ==================

	// scrollar till ett specifikt element
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

	// sorterar bokningslängder för bättre presentation
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

	// återställer bokningsinställningar när användaren gör ändringar
	function handleSettingChange() {
		startTime = null;
		hasGeneratedTimes = false;
		settingsLocked = false;
		possibleStartTimes = [];
	}

	// visar kontaktformuläret när användaren går vidare från deltagarval
	function handleNextStep() {
		showContactSection = true;
		scrollToElement('contact-section');
	}

	// Lägg till denna funktion bland de andra hjälpfunktionerna
	function getBookingTypeInfo(bookingLength, defaultOpenTime, defaultCloseTime) {
		// Konverterar öppettider till minuter sedan midnatt
		const openMinutes = timeToMinutes(defaultOpenTime);
		const closeMinutes = timeToMinutes(defaultCloseTime);

		// Beräknar totala antalet 15-minuters slots mellan öppning och stängning
		const totalSlots = Math.floor((closeMinutes - openMinutes) / 15);

		let type;
		if (bookingLength === 'Hela dagen') {
			type = 'full_day';
		} else if (bookingLength.includes('h')) {
			type = 'hourly';
		} else {
			type = 'custom';
		}

		return {
			type,
			totalSlots
		};
	}

	// Hjälpfunktion för att konvertera tid till minuter
	function timeToMinutes(timeStr) {
		const [hours, minutes] = timeStr.split(':').map(Number);
		return hours * 60 + minutes;
	}

	// ==================
	// bokningsrelaterade funktioner
	// ==================

	// uppdaterar antalet av ett specifikt tillval
	function updateAddonQuantity(addonId, increment) {
		console.log('Updating addon quantity:', { addonId, increment });
		const addon = data.experience.addons.find((a) => a.id === addonId);
		console.log('Found addon:', addon);

		if (addon) {
			const currentValue = selectedAddons[addon.column_name] || 0;
			const newValue = increment
				? Math.min(currentValue + 1, addon.max_quantity)
				: Math.max(0, currentValue - 1);

			console.log('Updating values:', {
				columnName: addon.column_name,
				currentValue,
				newValue
			});

			selectedAddons = {
				...selectedAddons,
				[addon.column_name]: newValue
			};
		}
	}

	// beräknar totalpris baserat på val
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

	// ==================
	// tidsrelaterade funktioner
	// ==================

	// beräknar möjliga starttider
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

		try {
			const addonsForRequest = {};
			Object.entries(selectedAddons).forEach(([columnName, quantity]) => {
				if (quantity > 0) {
					addonsForRequest[columnName] = quantity;
				}
			});

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
				possibleStartTimes = [];
				// Instead of console.error, we'll handle the error gracefully
				return;
			}

			possibleStartTimes = availableStartTimes;
			if (possibleStartTimes.length > 0) {
				scrollToElement('available-times');
			}
		} catch (error) {
			possibleStartTimes = [];
			// Handle any unexpected errors silently
		} finally {
			isLoadingTimes = false;
		}
	}

	// beräknar returdatum och tid
	function calculateReturnDate() {
		// Debug logging to check values
		console.log('Calculating return date with:', {
			selectedBookingLength,
			startTime,
			startDate,
			openHours: data.openHours
		});

		// Early return if required data is missing
		if (!selectedBookingLength || !startTime || !startDate) {
			console.error('saknar grundläggande bokningsdata:', {
				selectedBookingLength,
				startTime,
				startDate
			});
			return;
		}

		// Check if openHours exists and has required properties
		if (!data.openHours?.defaultCloseTime) {
			console.error('saknar öppettider:', data.openHours);
			return;
		}

		const bookingLength = data.bookingLengths.find((b) => b.length === selectedBookingLength);
		if (!bookingLength) {
			console.error('kunde inte hitta bokningslängd:', selectedBookingLength);
			return;
		}

		try {
			const startDateTime = new Date(`${startDate}T${startTime}`);
			if (isNaN(startDateTime.getTime())) {
				console.error('ogiltigt startdatum eller starttid:', { startDate, startTime });
				return;
			}

			let returnDateTime = new Date(startDateTime);

			if (bookingLength.overnight) {
				returnDateTime.setDate(returnDateTime.getDate() + bookingLength.return_day_offset);
				const closeTimeParts = data.openHours.defaultCloseTime.split(':');
				returnDateTime.setHours(parseInt(closeTimeParts[0]), parseInt(closeTimeParts[1]), 0, 0);
			} else if (bookingLength.length === 'Hela dagen') {
				const closeTimeParts = data.openHours.defaultCloseTime.split(':');
				returnDateTime.setHours(parseInt(closeTimeParts[0]), parseInt(closeTimeParts[1]), 0, 0);
			} else {
				const hoursToAdd = parseInt(bookingLength.length);
				returnDateTime.setHours(returnDateTime.getHours() + hoursToAdd);

				const closeTime = new Date(`${startDate}T${data.openHours.defaultCloseTime}`);
				if (returnDateTime > closeTime) {
					returnDateTime = closeTime;
				}
			}

			returnDate = returnDateTime.toISOString().split('T')[0];
			returnTime = returnDateTime.toTimeString().substring(0, 5);

			// Debug log successful calculation
			console.log('Beräknat returdatum:', { returnDate, returnTime });

			// Calculate booking type info
			const bookingTypeInfo = getBookingTypeInfo(
				bookingLength.length,
				data.openHours.defaultOpenTime,
				data.openHours.defaultCloseTime
			);

			return {
				startSlot: timeToSlot(startTime),
				endSlot: timeToSlot(returnTime),
				bookingType: bookingTypeInfo.type,
				totalSlots: bookingTypeInfo.totalSlots
			};
		} catch (error) {
			console.error('fel vid beräkning av returdatum:', error);
			return;
		}
	}

	// konverterar tid till tidsluckor
	function timeToSlot(timeStr) {
		const [hours, minutes] = timeStr.split(':').map(Number);
		return Math.floor((hours * 60 + minutes) / 15);
	}

	// ==================
	// betalningsrelaterade funktioner
	// ==================

	// hanterar stripe-betalning
	async function handleCheckout() {
		try {
			const stripe = await stripePromise;

			const slotInfo = calculateReturnDate();

			const addonAmounts = {};
			for (const [columnName, quantity] of Object.entries(selectedAddons)) {
				if (quantity > 0) {
					addonAmounts[columnName] = quantity;
				}
			}

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
				start_slot: slotInfo.startSlot,
				end_slot: slotInfo.endSlot,
				booking_type: slotInfo.bookingType,
				total_slots: slotInfo.totalSlots,
				number_of_adults: numAdults,
				number_of_children: numChildren,
				...addonAmounts,
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

	//Hantera faktura
	async function handleInvoiceSubmission() {
		try {
			const requestData = {
				...invoiceData,
				experience_id: data.experience.id,
				experience: data.experience.name,
				startLocation: selectedStartLocationName,
				start_date: startDate,
				start_time: startTime,
				end_date: returnDate,
				end_time: returnTime,
				start_slot: slotInfo.startSlot,
				end_slot: slotInfo.endSlot,
				booking_type: slotInfo.bookingType,
				total_slots: slotInfo.totalSlots,
				number_of_adults: numAdults,
				number_of_children: numChildren,
				amount_total: totalPrice,
				booking_name: userName,
				booking_lastname: userLastname,
				customer_comment: userComment,
				customer_email: userEmail
			};

			const response = await fetch('/api/handle-invoice', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestData)
			});

			if (!response.ok) {
				throw new Error('Failed to submit invoice booking');
			}

			// Redirect to success page
			window.location.href = '/success?booking_type=invoice';
		} catch (error) {
			console.error('Error submitting invoice booking:', error);
			// Handle error (show error message to user)
		}
	}

	// ==================
	// livscykelhantering
	// ==================

	onMount(async () => {
		stripePromise = await loadStripe(
			'pk_test_51Q3N7cP8OFkPaMUNpmkTh09dCDHBxYz4xWIC15fBXB4UerJpV9qXhX5PhT0f1wxwdcGVlenqQaKw0m6GpKUZB0jj00HBzDqWig'
		);

		const today = new Date();
		const foresightHours = data.experience.booking_foresight_hours || 0;
		const minDateTime = new Date(today.getTime() + foresightHours * 60 * 60 * 1000);

		if (data.openHours && data.openHours.start_date && data.openHours.end_date) {
			const dbMinDate = new Date(data.openHours.start_date);
			minDate = dbMinDate > minDateTime ? dbMinDate : minDateTime;
			maxDate = new Date(data.openHours.end_date);
		}

		// Combine regular blocked dates with foresight blocked dates
		const foresightBlocked = generateForesightBlockedDates(data.experience.booking_foresight_hours);
		blockedDates = [
			...foresightBlocked,
			...(data.blocked_dates?.map((blocked) => new Date(blocked.blocked_date)) || [])
		];

		// Remove duplicates
		blockedDates = [...new Set(blockedDates.map((date) => date.toISOString()))].map(
			(date) => new Date(date)
		);
	});

	function generateForesightBlockedDates(foresightHours) {
		const blockedDates = [];
		const today = new Date();
		today.setHours(0, 0, 0, 0); // Reset time to start of day

		// Block all past dates up to yesterday
		const startDate = new Date(2024, 0, 1);
		const currentDate = new Date(startDate);
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);

		while (currentDate <= yesterday) {
			blockedDates.push(new Date(currentDate));
			currentDate.setDate(currentDate.getDate() + 1);
		}

		// Don't block today if foresight hours is less than 24
		if (foresightHours >= 24) {
			const foresightDays = Math.floor(foresightHours / 24);
			for (let i = 0; i < foresightDays; i++) {
				const date = new Date(today);
				date.setDate(date.getDate() + i);
				blockedDates.push(new Date(date));
			}
		}

		return blockedDates;
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
						{#if sortedBookingLengths.length === 1}
							<div
								class="flex h-10 w-full items-center rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground"
							>
								{sortedBookingLengths[0].length}
							</div>
						{:else}
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
						{/if}
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
							openingPeriods={{
								periods: data.openHours.periods || [],
								specificDates:
									data.openHours.specificDates.map((date) => ({
										...date,
										date: new Date(date.date).toISOString().split('T')[0]
									})) || [],
								defaultOpenTimes: data.openHours.defaultOpenTimes || [''],
								defaultCloseTimes: data.openHours.defaultCloseTimes || ['']
							}}
							{blockedDates}
							selectedDate={startDate}
							on:dateSelect={(event) => {
								const { date, timeSlots } = event.detail;
								const dateObj = new Date(date);
								const year = dateObj.getFullYear();
								const month = String(dateObj.getMonth() + 1).padStart(2, '0');
								const day = String(dateObj.getDate()).padStart(2, '0');
								startDate = `${year}-${month}-${day}`;
								if (hasGeneratedTimes) handleSettingChange();
							}}
							bookingLength={selectedBookingLength}
						/>
					</div>
				</div>
			{/if}
		</div>
		{#if startDate && selectedBookingLength}
			<Card id="equipment-section">
				<CardHeader>
					<CardTitle>Välj utrustning</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="grid gap-6">
						<!-- Tillval -->
						<div class="space-y-4">
							<div class="grid gap-4 sm:grid-cols-3">
								{#each data.experience.addons as addon (addon.id)}
									<div class="space-y-2">
										<Label for={addon.name}>Antal {addon.name} (max {addon.max_quantity})</Label>
										<div class="flex items-center space-x-2">
											<Button
												variant="outline"
												class="px-3"
												disabled={settingsLocked}
												on:click={() => updateAddonQuantity(addon.id, false)}
											>
												-
											</Button>
											<div class="w-12 text-center">
												{selectedAddons[addon.column_name] || 0}
											</div>
											<Button
												variant="outline"
												class="px-3"
												disabled={settingsLocked}
												on:click={() => updateAddonQuantity(addon.id, true)}
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
											on:click={() => {
												startTime = time;
												console.log('Selected time:', time); // Add this debug line
											}}
											class="w-full"
										>
											{time}
										</Button>
									{/each}
								</div>
							</div>
						{:else if hasCheckedTimes && !isLoadingTimes}
							<Alert variant="destructive">
								<AlertDescription>
									<p class="mb-2">Ditt önskemål kunde inte tillgodoses. Det kan bero på:</p>
									<ul class="list-disc pl-6 space-y-1">
										<li>Bokningslängd (Det intervall du önskat kan vara fullbokat)</li>
										<li>Val av datum (Det datum du önskat kan vara fullbokat)</li>
										<li>
											Det antal enheter av utrustning du valt finns inte tillgängligt under den
											tiden
										</li>
									</ul>
									<b>Prova att ändra din bokning enligt annat önskemål</b>
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
										{#each Object.entries(selectedAddons).filter(([_, quantity]) => quantity > 0) as [columnName, quantity]}
											<br />
											{quantity} st {data.experience.addons.find(
												(addon) => addon.column_name === columnName
											)?.name}
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

					<!-- Payment Section -->
					{#if data.experience.experience_type === 'business_school'}
						<div class="space-y-4">
							<div class="flex gap-4">
								<Button
									variant={selectedPaymentMethod === 'card' ? 'default' : 'outline'}
									on:click={() => (selectedPaymentMethod = 'card')}
									class="flex-1"
								>
									Betala med kort
								</Button>
								<Button
									variant={selectedPaymentMethod === 'invoice' ? 'default' : 'outline'}
									on:click={() => (selectedPaymentMethod = 'invoice')}
									class="flex-1"
								>
									Betala med faktura
								</Button>
							</div>

							{#if selectedPaymentMethod === 'invoice'}
								<Card class="mt-4">
									<CardHeader>
										<CardTitle>Fakturauppgifter</CardTitle>
									</CardHeader>
									<CardContent>
										<InvoiceForm bind:invoiceData />

										<Button
											class="w-full mt-4"
											disabled={!acceptTerms}
											on:click={handleInvoiceSubmission}
										>
											Skicka fakturabegäran ({totalPrice}kr)
										</Button>
									</CardContent>
								</Card>
							{:else if selectedPaymentMethod === 'card'}
								<Button disabled={!acceptTerms} on:click={handleCheckout} class="w-full mt-4">
									Gå till kortbetalning ({totalPrice}kr)
								</Button>
							{/if}
						</div>
					{:else}
						<!-- Original payment button for public experiences -->
						<Button disabled={!acceptTerms} on:click={handleCheckout} class="w-full">
							Gå till betalning ({totalPrice}kr)
						</Button>
					{/if}
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
