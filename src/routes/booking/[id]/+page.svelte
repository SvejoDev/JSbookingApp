<script>
	import flatpickr from 'flatpickr';
	import 'flatpickr/dist/flatpickr.css';
	import { onMount } from 'svelte';
	import { loadStripe } from '@stripe/stripe-js';

	export let data;
	let maxCanoes = 0;
	let maxKayaks = 0;
	let maxSUPs = 0;

	$: {
		const canoesAddon = data.experienceAddons.find((addon) => addon.addons.name === 'Kanot');
		const kayaksAddon = data.experienceAddons.find((addon) => addon.addons.name === 'Kajak');
		const supsAddon = data.experienceAddons.find((addon) => addon.addons.name === 'SUP');

		maxCanoes = canoesAddon ? canoesAddon.addons.max_quantity : 0;
		maxKayaks = kayaksAddon ? kayaksAddon.addons.max_quantity : 0;
		maxSUPs = supsAddon ? supsAddon.addons.max_quantity : 0;
	}

	let amountCanoes = 0;
	let amountKayaks = 0;
	let amountSUPs = 0;

	let blockedDates = [];
	let startDate = null;
	let minDate = null;
	let maxDate = null;
	let startTime = null;
	let selectedBookingLength = null;
	let returnDate = null;
	let returnTime = null;
	let selectedStartLocation = null;
	let numAdults = 0;
	let numChildren = 0;
	let totalPrice = 0;

	let selectedStartLocationName = '';

	$: {
		const selectedLocation = data.startLocations.find(
			(location) => location.id === selectedStartLocation
		);
		selectedStartLocationName = selectedLocation ? selectedLocation.location : '';
	}

	let userName = '';
	let userLastname = '';
	let userPhone = '';
	let userEmail = '';
	let userComment = '';
	let acceptTerms = false;

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

	$: if (selectedStartLocation) {
		sortedBookingLengths = sortBookingLengths(
			data.bookingLengths.filter((bl) => bl.location_id == selectedStartLocation)
		);
	} else {
		sortedBookingLengths = [];
	}

	let calendarInput;
	let flatpickrInstance;

	$: if (calendarInput && selectedStartLocation) {
		if (flatpickrInstance) {
			flatpickrInstance.destroy();
		}
		flatpickrInstance = flatpickr(calendarInput, {
			disableMobile: 'true',
			minDate: minDate,
			maxDate: maxDate,
			disable: blockedDates,
			dateFormat: 'Y-m-d',
			onChange: (selectedDates, dateStr) => {
				startDate = dateStr;
			}
		});
	}

	onMount(() => {
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
				// Add any additional price calculations here (e.g., for equipment)
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

	function checkEquipmentChanged() {
		if (startDate && selectedBookingLength) {
			allStartTimes = generateAllStartTimes();
			fetchAvailableStartTimes().then((times) => {
				availableStartTimes = times;
			});
		}
	}

	function generateAllStartTimes() {
		if (!data.openHours || !data.openHours.open_time || !data.openHours.close_time) {
			console.error('Data för öppettider saknas eller är ofullständig');
			return [];
		}

		const openTime = new Date(`${startDate}T${data.openHours.open_time}`);
		const closeTime = new Date(`${startDate}T${data.openHours.close_time}`);

		if (isNaN(openTime.getTime()) || isNaN(closeTime.getTime())) {
			console.error('Ogiltig öppnings- eller stängningstid', openTime, closeTime);
			return [];
		}

		const times = [];
		let currentTime = new Date(openTime);
		while (currentTime <= closeTime) {
			times.push(currentTime.toTimeString().substring(0, 5));
			currentTime.setMinutes(currentTime.getMinutes() + 30);
		}

		return times;
	}

	let showStartTimes = false;
	let allStartTimes = [];
	let availableStartTimes = [];

	async function handleNextButton() {
		if (!startDate || !selectedBookingLength || (!amountCanoes && !amountKayaks && !amountSUPs)) {
			console.error('Missing data for availability check');
			return;
		}

		showStartTimes = true;
		allStartTimes = generateAllStartTimes();
		availableStartTimes = await fetchAvailableStartTimes();
	}

	async function fetchAvailableStartTimes() {
		try {
			const response = await fetch('/api/check-availability', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					experienceId: data.experience.id,
					date: startDate,
					bookingLength: selectedBookingLength,
					selectedEquipment: {
						canoes: amountCanoes,
						kayaks: amountKayaks,
						sups: amountSUPs
					}
				})
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error(`Server error (${response.status}):`, errorText);
				throw new Error(`Server error: ${response.status} ${errorText}`);
			}

			const result = await response.json();
			console.log('Server response:', result);

			if (!result.availableStartTimes) {
				console.error('Unexpected server response:', result);
				throw new Error('Unexpected server response');
			}

			return result.availableStartTimes;
		} catch (error) {
			console.error('Error fetching available start times:', error);
			return [];
		}
	}

	$: canProceed = amountCanoes > 0 || amountKayaks > 0 || amountSUPs > 0;
</script>

<main>
	{#if data.experience}
		<h1>{data.experience.name}</h1>

		<!-- Step 1: Choose start place -->
		<div class="booking-step">
			<h2>1. Välj startplats</h2>
			<label for="startLocation">Startplats:</label>
			<select id="startLocation" bind:value={selectedStartLocation} on:change={updatePrice}>
				<option value="" disabled selected>Välj startplats</option>
				{#each data.startLocations as location}
					<option value={location.id}>{location.location} - {location.price}kr</option>
				{/each}
			</select>
		</div>

		{#if selectedStartLocation}
			<!-- Step 2: Choose date -->
			<div class="booking-step">
				<h2>2. Välj datum</h2>
				<label for="bookingDate">Datum:</label>
				<input id="bookingDate" bind:this={calendarInput} type="text" placeholder="Välj datum" />
			</div>

			{#if startDate}
				<!-- Step 3: Choose booking length -->
				<div class="booking-step">
					<h2>3. Välj bokningslängd</h2>
					<label for="bookingLength">Bokningslängd:</label>
					<select id="bookingLength" bind:value={selectedBookingLength}>
						<option value="" disabled selected>Välj längd</option>
						{#each sortedBookingLengths as duration}
							<option value={duration.length}>{duration.length}</option>
						{/each}
					</select>
				</div>

				{#if selectedBookingLength}
					<!-- Step 4: Choose amount of canoe/kayak/sup -->
					<div class="booking-step">
						<h2>4. Välj utrustning</h2>
						<div class="equipment-selection">
							<div>
								<label for="canoes">Antal kanadensare:</label>
								<input
									id="canoes"
									type="number"
									min="0"
									max={maxCanoes}
									bind:value={amountCanoes}
									on:change={checkEquipmentChanged}
								/>
							</div>
							<div>
								<label for="kayaks">Antal kajaker:</label>
								<input
									id="kayaks"
									type="number"
									min="0"
									max={maxKayaks}
									bind:value={amountKayaks}
									on:change={checkEquipmentChanged}
								/>
							</div>
							<div>
								<label for="sups">Antal SUP:ar:</label>
								<input
									id="sups"
									type="number"
									min="0"
									max={maxSUPs}
									bind:value={amountSUPs}
									on:change={checkEquipmentChanged}
								/>
							</div>
						</div>
						<button on:click={handleNextButton} disabled={!canProceed}
							>Visa tillgängliga tider</button
						>
					</div>

					<!-- Step 5: Show possible start times -->
					{#if showStartTimes}
						<div class="booking-step">
							<h2>5. Välj starttid</h2>
							{#if allStartTimes.length > 0}
								<div class="start-times">
									{#each allStartTimes as time}
										<button
											class="time-button {availableStartTimes.includes(time)
												? 'available'
												: 'unavailable'}"
											on:click={() => (startTime = time)}
											disabled={!availableStartTimes.includes(time)}
										>
											{time}
										</button>
									{/each}
								</div>
							{:else}
								<p>Inga tider tillgängliga för valt datum och utrustning.</p>
							{/if}
						</div>
					{/if}

					{#if startTime}
						<div class="booking-summary">
							<h2>Bokningsöversikt</h2>
							<p>Vald starttid: {startTime}</p>
							{#if returnDate && returnTime}
								<p>Returdatum: {returnDate}</p>
								<p>Returtid senast: {returnTime}</p>
							{/if}
						</div>

						<!-- Step 6: Choose amount of adults/children -->
						<div class="booking-step">
							<h2>6. Antal personer</h2>
							<div>
								<label for="adults">Antal vuxna:</label>
								<input
									id="adults"
									type="number"
									min="0"
									bind:value={numAdults}
									on:change={updatePrice}
								/>
							</div>
							<div>
								<label for="children">Antal barn (gratis):</label>
								<input
									id="children"
									type="number"
									min="0"
									bind:value={numChildren}
									on:change={updatePrice}
								/>
							</div>
						</div>

						<div class="price-summary">
							<p>Totalt pris: {totalPrice}kr</p>
						</div>

						<!-- Step 7: Display "Kontaktuppgifter" and payment -->
						<div class="booking-step">
							<h2>7. Kontaktuppgifter</h2>
							<div class="contact-form">
								<div>
									<label for="firstName">Förnamn:</label>
									<input id="firstName" type="text" bind:value={userName} required />
								</div>
								<div>
									<label for="lastName">Efternamn:</label>
									<input id="lastName" type="text" bind:value={userLastname} required />
								</div>
								<div>
									<label for="phone">Telefonnummer:</label>
									<input
										id="phone"
										type="tel"
										bind:value={userPhone}
										pattern="^\+?[1-9]\d{(1, 14)}$"
										required
									/>
								</div>
								<div>
									<label for="email">Epostadress:</label>
									<input id="email" type="email" bind:value={userEmail} required />
								</div>
								<div>
									<label for="comment">Kommentar (valfri):</label>
									<textarea id="comment" bind:value={userComment}></textarea>
								</div>
							</div>
						</div>

						<div class="terms-and-checkout">
							<div>
								<input id="terms" type="checkbox" bind:checked={acceptTerms} required />
								<label for="terms">Jag accepterar bokningsavtalet och köpvillkoren</label>
							</div>

							<button disabled={!acceptTerms} on:click={handleCheckout}>
								Gå till betalning ({totalPrice}kr)
							</button>
						</div>
					{/if}
				{/if}
			{/if}
		{/if}
	{:else}
		<p>Upplevelsen hittades inte</p>
	{/if}
</main>

<style>
	main {
		max-width: 800px;
		margin: 0 auto;
		padding: 20px;
	}

	.booking-step {
		margin-bottom: 20px;
		padding: 15px;
		border: 1px solid #ddd;
		border-radius: 5px;
	}

	.equipment-selection {
		display: flex;
		justify-content: space-between;
		margin-bottom: 15px;
	}

	.equipment-selection > div {
		flex: 1;
		margin-right: 10px;
	}

	.start-times {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 10px;
	}

	.time-button {
		padding: 8px 12px;
		border: 1px solid #ccc;
		border-radius: 4px;
		background-color: #f0f0f0;
		cursor: pointer;
	}

	.time-button.available {
		background-color: green;
	}

	.time-button.unavailable {
		background-color: #f7e0e0;
		text-decoration: line-through;
		opacity: 0.7;
		cursor: not-allowed;
	}

	.booking-summary,
	.price-summary {
		background-color: #f8f8f8;
		padding: 10px;
		border-radius: 5px;
		margin-bottom: 20px;
	}

	.contact-form {
		display: grid;
		gap: 10px;
	}

	.terms-and-checkout {
		margin-top: 20px;
	}

	button {
		padding: 10px 15px;
		background-color: #4caf50;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}

	button:disabled {
		background-color: #cccccc;
		cursor: not-allowed;
	}

	input[type='text'],
	input[type='tel'],
	input[type='email'],
	input[type='number'],
	select,
	textarea {
		width: 100%;
		padding: 8px;
		margin-top: 5px;
		margin-bottom: 10px;
		display: inline-block;
		border: 1px solid #ccc;
		border-radius: 4px;
		box-sizing: border-box;
	}
</style>
