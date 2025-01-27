<!--src/routes/booking/[id]/+page.svelte-->
<script>
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardHeader,
		CardTitle,
		CardContent,
		CardDescription
	} from '$lib/components/ui/card';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Alert, AlertTitle, AlertDescription } from '$lib/components/ui/alert';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Loader2 } from 'lucide-svelte';
	import Calendar from '$lib/components/calendar/Calendar.svelte';
	import { onMount, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { loadStripe } from '@stripe/stripe-js';
	import InvoiceForm from '$lib/components/InvoiceForm.svelte';

	export let data;

	// ==================
	// tillståndsvariabler
	// ==================

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

	// add these at the top of your script section
	let participantsSection;
	let contactSection;

	// Initialize Stripe
	let stripePromise;

	// Lägg till denna reaktiva validering
	$: isFormValid =
		acceptTerms &&
		userName.trim() !== '' &&
		userLastname.trim() !== '' &&
		userPhone.trim() !== '' &&
		userEmail.trim() !== '';

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
			if (numAdults > 0) {
				updatePrice();
			}
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

	// väljer automatiskt bokningslängd om det bara finns ett alternativ och scrollar till botten
	$: {
		if (sortedBookingLengths.length === 1) {
			selectedBookingLength = sortedBookingLengths[0].length;
		}
		if (selectedBookingLength) {
			tick().then(() => {
				scrollToBottom();
			});
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

	// Add this near the other reactive statements
	$: {
		if (data.experience?.experience_type === 'guided') {
			// For guided experiences, automatically set the first available location and booking length
			selectedStartLocation = data.startLocations[0]?.id;
			selectedBookingLength = data.bookingLengths[0]?.length;

			// Update price when number of adults changes
			if (numAdults >= 0) {
				totalPrice = numAdults * data.startLocations[0]?.price;
			}
		}
	}

	// ==================
	// hjälpfunktioner
	// ==================

	// scrollar till ett specifikt element
	async function scrollToElement(elementId) {
		if (!browser) return;

		// vänta på att DOM:en har uppdaterats
		await tick();
		await new Promise((resolve) => setTimeout(resolve, 100));

		const element = document.getElementById(elementId);
		if (!element) {
			console.warn(`Element med id '${elementId}' hittades inte`);
			return;
		}

		// beräkna position och scrolla
		const headerOffset = 100;
		const elementPosition = element.getBoundingClientRect().top;
		const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

		window.scrollTo({
			top: offsetPosition,
			behavior: 'smooth'
		});
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
	async function handleNextStep() {
		showContactSection = true;
		await tick();
		scrollToBottom();
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

			if (selectedLocation?.price && numAdults > 0) {
				// säkerställ att priset är ett giltigt nummer
				const basePrice = Number(selectedLocation.price) || 0;
				totalPrice = Math.round(numAdults * basePrice);
			} else {
				totalPrice = 0;
			}
		} else {
			totalPrice = 0;
		}

		// säkerställ att totalPrice alltid är ett giltigt nummer
		if (isNaN(totalPrice)) {
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

		// Lock settings immediately when button is clicked
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
				settingsLocked = false;
				return;
			}

			possibleStartTimes = availableStartTimes;
			if (possibleStartTimes.length > 0) {
				await tick();
				scrollToBottom();
			}
		} catch (error) {
			possibleStartTimes = [];
			settingsLocked = false;
		} finally {
			isLoadingTimes = false;
		}
	}

	// beräknar returdatum och tid
	function calculateReturnDate() {
		if (!selectedBookingLength || !startTime || !startDate) {
			console.log('Missing required values:', { selectedBookingLength, startTime, startDate });
			return;
		}

		try {
			const startDateTime = new Date(`${startDate}T${startTime}`);
			let returnDateTime = new Date(startDateTime);

			// för bokningar som är i timmar
			if (selectedBookingLength.includes('h')) {
				const hours = parseInt(selectedBookingLength);
				returnDateTime.setHours(returnDateTime.getHours() + hours);
			}
			// för hela dagen bokningar
			else if (selectedBookingLength === 'Hela dagen') {
				returnDateTime.setHours(17, 0, 0); // sätt till 17:00
			}
			// för övriga bokningslängder (om det finns några)
			else {
				returnDateTime.setHours(17, 0, 0); // default till 17:00
			}

			returnDate = returnDateTime.toISOString().split('T')[0];
			returnTime = returnDateTime.toTimeString().substring(0, 5);

			console.log('Return date calculated:', { returnDate, returnTime });
		} catch (error) {
			console.error('Error calculating return date:', error);
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
			if (!stripe) throw new Error('Stripe not initialized');

			// Skapa checkout data
			const checkoutData = {
				startDate,
				startTime,
				returnDate,
				returnTime,
				selectedBookingLength,
				selectedStartLocation,
				numAdults,
				numChildren,
				// Konvertera addon-värdena till strings för metadata
				...Object.entries(selectedAddons).reduce((acc, [key, value]) => ({
					...acc,
					[key]: value.toString()
				}), {}),
				userName,
				userLastname,
				userPhone,
				userEmail,
				userComment,
				experienceId: selectedExperienceId,
				amount: totalPrice,
				name: data.experience.name
			};

			const response = await fetch('/api/create-checkout-session', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(checkoutData)
			});

			const { sessionId } = await response.json();
			if (!sessionId) throw new Error('No session ID returned');

			const result = await stripe.redirectToCheckout({
				sessionId: sessionId
			});

			if (result.error) {
				throw new Error(result.error.message);
			}
		} catch (error) {
			console.error('Checkout error:', error);
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
		try {
			// initialisera stripe med public key
			const PUBLIC_STRIPE_KEY =
				'pk_test_51Q3N7cP8OFkPaMUNpmkTh09dCDHBxYz4xWIC15fBXB4UerJpV9qXhX5PhT0f1wxwdcGVlenqQaKw0m6GpKUZB0jj00HBzDqWig';
			stripePromise = await loadStripe(PUBLIC_STRIPE_KEY);
			if (!stripePromise) {
				console.error('Failed to initialize Stripe');
			}
		} catch (error) {
			console.error('Error initializing Stripe:', error);
		}

		minDate = new Date();
		maxDate = new Date();
		maxDate.setFullYear(maxDate.getFullYear() + 1);

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

		// Add near the start of your handleBooking function
		console.group('🎫 New Booking Request');
		console.log('📅 Booking Details:', {
			experience: data.experience.name,
			experienceId: selectedExperienceId,
			startDate,
			startTime,
			returnDate,
			returnTime,
			bookingType: selectedBookingLength
		});

		console.log('👥 Participants:', {
			adults: numAdults,
			children: numChildren,
			totalParticipants: numAdults + numChildren
		});

		console.log('💰 Pricing:', {
			basePrice: totalPrice,
			addons: selectedAddons,
			finalTotal: calculateTotalPrice()
		});

		console.log('📍 Location:', {
			name: selectedStartLocationName,
			id: selectedStartLocation
		});
		console.groupEnd();
	});

	function generateForesightBlockedDates(foresightHours) {
		const blockedDates = [];
		const now = new Date();
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		// blockera alla datum fram till igår
		const startDate = new Date(2024, 0, 1);
		const currentDate = new Date(startDate);
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);

		while (currentDate <= yesterday) {
			blockedDates.push(new Date(currentDate));
			currentDate.setDate(currentDate.getDate() + 1);
		}

		// hämta stängningstid från openHours
		const defaultCloseTime = data.openHours.defaultCloseTimes[0] || '16:00';
		const [closeHours, closeMinutes] = defaultCloseTime.split(':').map(Number);

		// beräkna stängningstid för morgondagen
		const tomorrowClose = new Date(today);
		tomorrowClose.setDate(tomorrowClose.getDate() + 1);
		tomorrowClose.setHours(closeHours, closeMinutes, 0, 0);

		// beräkna senaste bokningstid (stängningstid minus framförhållning)
		const latestBookingTime = new Date(tomorrowClose.getTime() - foresightHours * 60 * 60 * 1000);

		// om nuvarande tid är efter senaste bokningstid, blockera morgondagen
		if (now > latestBookingTime) {
			const tomorrow = new Date(today);
			tomorrow.setDate(tomorrow.getDate() + 1);
			blockedDates.push(new Date(tomorrow));
		}

		return blockedDates;
	}

	// scrollar till botten av sidan
	async function scrollToBottom() {
		if (browser) {
			await tick();
			window.scrollTo({
				top: document.documentElement.scrollHeight,
				behavior: 'smooth'
			});
		}
	}

	// Lägg till denna funktion bland dina andra funktioner i script-taggen
	function calculateTotalPrice() {
		let total = totalPrice; // Baspriser för vuxna

		// Lägg till priser för addons
		Object.entries(selectedAddons).forEach(([columnName, quantity]) => {
			const addon = data.experience.addons.find((a) => a.column_name === columnName);
			if (addon && addon.price) {
				total += addon.price * quantity;
			}
		});

		return total;
	}
</script>

{#if data.experience && data.experience.id}
	<div class="max-w-7xl mx-auto px-4 py-6 overflow-hidden">
		<Card class="max-w-3xl mx-auto mb-8 shadow-sm">
			<CardHeader class="py-6">
				<CardTitle class="text-2xl sm:text-3xl font-semibold text-center text-primary">
					{data.experience.name}
				</CardTitle>
				{#if data.experience.description}
					<CardDescription class="text-base sm:text-lg mt-2 text-center text-muted-foreground">
						{data.experience.description}
					</CardDescription>
				{/if}
			</CardHeader>
		</Card>

		{#if data.experience.experience_type === 'guided'}
			<!-- Guided Experience Flow -->
			<div class="flex flex-col gap-6 max-w-3xl mx-auto">
				<!-- Step 1: Date Selection -->
				<Card id="calendar-section">
					<CardHeader>
						<CardTitle>Välj datum</CardTitle>
					</CardHeader>
					<CardContent>
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
							disabled={settingsLocked || startTime !== null}
							bookingLength={selectedBookingLength}
							on:dateSelect={({ detail }) => {
								const { date } = detail;
								const dateObj = new Date(date);
								const year = dateObj.getFullYear();
								const month = String(dateObj.getMonth() + 1).padStart(2, '0');
								const day = String(dateObj.getDate()).padStart(2, '0');
								startDate = `${year}-${month}-${day}`;

								// Reset time-related states when date changes
								startTime = null;
								returnTime = null;
								returnDate = null;
								hasGeneratedTimes = false;
								possibleStartTimes = [];
								settingsLocked = false;

								scrollToBottom();
							}}
						/>
					</CardContent>
				</Card>

				{#if startDate}
					<!-- Booking Summary -->
					<Card class="mt-4">
						<CardHeader>
							<CardTitle>Din bokning</CardTitle>
						</CardHeader>
						<CardContent>
							<div class="space-y-2">
								<p><strong>Datum:</strong> {startDate}</p>
								<p>
									<strong>Tid:</strong>
									{data.openHours.defaultOpenTimes[0]} - {data.openHours.defaultCloseTimes[0]}
								</p>
								<p><strong>Plats:</strong> {data.startLocations[0]?.location}</p>
							</div>
						</CardContent>
					</Card>

					<!-- Step 2: Participants -->
					<Card bind:this={participantsSection} id="participants-section">
						<CardHeader>
							<CardTitle>Antal deltagare</CardTitle>
						</CardHeader>
						<CardContent class="space-y-4">
							<div class="space-y-2">
								<Label for="participants"
									>Antal deltagare ({data.startLocations[0]?.price}kr/person)</Label
								>
								<div class="flex items-center space-x-2">
									<Button
										variant="outline"
										class="px-3"
										on:click={() => (numAdults = Math.max(0, numAdults - 1))}
									>
										-
									</Button>
									<div class="w-12 text-center">{numAdults}</div>
									<Button
										variant="outline"
										class="px-3"
										on:click={() => (numAdults = numAdults + 1)}
									>
										+
									</Button>
								</div>
							</div>

							<Alert>
								<AlertTitle>Totalt pris</AlertTitle>
								<AlertDescription>{totalPrice}kr</AlertDescription>
							</Alert>

							<Button
								class="w-full mt-4"
								disabled={numAdults === 0}
								on:click={async () => {
									showContactSection = true;
									await tick();
									scrollToBottom();
								}}
							>
								{numAdults === 0 ? 'Välj antal deltagare' : 'Nästa steg'}
							</Button>
						</CardContent>
					</Card>

					<!-- Step 3: Contact Information -->
					{#if showContactSection}
						<Card bind:this={contactSection} id="contact-section">
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
									<Label for="terms">I accept the booking agreement and the terms of purchase</Label
									>
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
														disabled={!isFormValid}
														on:click={handleInvoiceSubmission}
													>
														Skicka fakturabegäran ({totalPrice}kr)
													</Button>
												</CardContent>
											</Card>
										{:else if selectedPaymentMethod === 'card'}
											<Button disabled={!isFormValid} on:click={handleCheckout} class="w-full mt-4">
												Gå till kortbetalning ({totalPrice}kr)
											</Button>
										{/if}
									</div>
								{:else}
									<!-- Original payment button for public experiences -->
									<Button disabled={!isFormValid} on:click={handleCheckout} class="w-full">
										Gå till betalning ({totalPrice}kr)
									</Button>
								{/if}
							</CardContent>
						</Card>
					{/if}
				{/if}
			</div>
		{:else}
			<!-- Original booking flow for non-guided experiences -->
			<div
				class="flex flex-col lg:flex-row gap-6 justify-center items-start max-w-5xl mx-auto relative"
			>
				<!-- First card -->
				<Card
					class="w-full lg:w-1/2 transition-all duration-300 ease-in-out {selectedStartLocation &&
					selectedBookingLength
						? 'lg:translate-x-[-5%]'
						: 'lg:translate-x-0'}"
				>
					<CardHeader>
						<CardTitle>1. Välj startplats och bokningslängd</CardTitle>
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
								disabled={settingsLocked || startTime !== null}
								bookingLength={selectedBookingLength}
								on:dateSelect={({ detail }) => {
									const { date } = detail;
									const dateObj = new Date(date);
									const year = dateObj.getFullYear();
									const month = String(dateObj.getMonth() + 1).padStart(2, '0');
									const day = String(dateObj.getDate()).padStart(2, '0');
									startDate = `${year}-${month}-${day}`;

									// Reset time-related states when date changes
									startTime = null;
									returnTime = null;
									returnDate = null;
									hasGeneratedTimes = false;
									possibleStartTimes = [];
									settingsLocked = false;

									scrollToBottom();
								}}
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
											scrollToBottom();
										}}
									>
										Ändra din bokning
									</Button>
								{/if}
							</div>

							<!-- After the available times buttons -->
							<div class="space-y-2" id="time-selection">
								{#if hasGeneratedTimes && !isLoadingTimes}
									{#if possibleStartTimes.length > 0}
										<Label>Tillgängliga starttider:</Label>
										<div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
											{#each possibleStartTimes as time}
												<Button
													variant={startTime === time ? 'default' : 'outline'}
													on:click={async () => {
														startTime = time;
														calculateReturnDate();
														await scrollToElement('participants-section');
													}}
													class="w-full"
												>
													{time}
												</Button>
											{/each}
										</div>
									{:else}
										<Alert variant="destructive">
											<AlertTitle>Inga lediga tider</AlertTitle>
											<AlertDescription>
												Tyvärr hittades inga lediga tider för valt datum och utrustning. Vänligen
												prova ett annat datum eller ändra din utrustning.
											</AlertDescription>
										</Alert>
									{/if}
								{/if}
							</div>

							<!-- Booking summary - only show after start time is selected -->
							{#if startTime && hasGeneratedTimes}
								<Card class="mt-4">
									<CardHeader>
										<CardTitle>Din bokning</CardTitle>
									</CardHeader>
									<CardContent>
										<div class="space-y-2">
											<p><strong>Startdatum:</strong> {startDate}</p>
											<p><strong>Starttid:</strong> {startTime}</p>
											{#if returnDate && returnTime}
												<p><strong>Returdatum:</strong> {returnDate}</p>
												<p><strong>Returtid senast:</strong> {returnTime}</p>
											{/if}
										</div>
									</CardContent>
								</Card>
							{/if}
						</div>
					</CardContent>
				</Card>
			{/if}

			{#if selectedStartLocation && startTime && hasGeneratedTimes}
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
												disabled={!isFormValid}
												on:click={handleInvoiceSubmission}
											>
												Skicka fakturabegäran ({totalPrice}kr)
											</Button>
										</CardContent>
									</Card>
								{:else if selectedPaymentMethod === 'card'}
									<Button disabled={!isFormValid} on:click={handleCheckout} class="w-full mt-4">
										Gå till kortbetalning ({totalPrice}kr)
									</Button>
								{/if}
							</div>
						{:else}
							<!-- Original payment button for public experiences -->
							<Button disabled={!isFormValid} on:click={handleCheckout} class="w-full">
								Gå till betalning ({totalPrice}kr)
							</Button>
						{/if}
					</CardContent>
				</Card>
			{/if}
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
