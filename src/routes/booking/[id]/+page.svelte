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
	import { Badge } from '$lib/components/ui/badge';

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
	let endTime = null; // lägg till denna rad bland de andra variablerna

	// ui-kontrollvariabler
	let isLoadingTimes = false;
	let hasGeneratedTimes = false;
	let settingsLocked = false;
	let hasCheckedTimes = false;
	let showContactSection = false;
	let showContactSectionGuided = false;

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

	// Uppdatera den reaktiva valideringen för att inkludera alla obligatoriska fält
	$: isFormValid =
		userName?.trim() &&
		userLastname?.trim() &&
		userEmail?.trim() &&
		userPhone?.trim() &&
		acceptTerms;

	// Lägg till bland de andra reaktiva variablerna
	$: isInvoiceFormValid = validateInvoiceForm(invoiceData);

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

	// hantera guidade upplevelser
	$: {
		if (data.experience?.experience_type === 'guided') {
			if (data.startLocations?.length > 0) {
				// Only log errors for invalid values in guided experiences
				if (!selectedStartLocation || numAdults < 0 || !data.openHours?.guidedHours) {
					console.error('Guided Experience Error:', {
						missingStartLocation: !selectedStartLocation,
						missingOpenHours: !data.openHours?.guidedHours,
						invalidAdults: numAdults < 0,
						currentState: {
							startLocation: selectedStartLocation,
							openHours: data.openHours?.guidedHours,
							numAdults
						}
					});
				}

				// sätt bara värden om de inte redan är satta
				if (!selectedStartLocation) {
					selectedStartLocation = data.startLocations[0]?.id;
				}

				if (!selectedBookingLength && data.bookingLengths?.length > 0) {
					const guidedBookingLength = data.bookingLengths.find(
						(bl) => Number(bl.location_id) === Number(data.startLocations[0]?.id)
					);
					selectedBookingLength = guidedBookingLength?.length;
				}

				// uppdatera pris endast om vi har alla nödvändiga värden
				if (selectedStartLocation && numAdults >= 0) {
					const location = data.startLocations.find((loc) => loc.id === selectedStartLocation);
					totalPrice = location ? numAdults * location.price : 0;
				}

				// vänta på att DOM:en uppdateras innan scroll
				if (selectedStartLocation && selectedBookingLength) {
					tick().then(async () => {
						await new Promise((resolve) => setTimeout(resolve, 100));
						await scrollToElement('equipment-section');
					});
				}
			} else {
				console.warn('Varning: Inga öppettider konfigurerade för guidad upplevelse');
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
		const addon = data.experience.addons.find((a) => a.id === addonId);

		if (addon) {
			const currentValue = selectedAddons[addon.column_name] || 0;
			const newValue = increment
				? Math.min(currentValue + 1, addon.max_quantity)
				: Math.max(0, currentValue - 1);

			selectedAddons = {
				...selectedAddons,
				[addon.column_name]: newValue
			};
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
			if (
				data.experience?.experience_type === 'public' ||
				data.experience?.experience_type === 'business_school'
			) {
				// samla ihop valda tillägg för tillgänglighetskontroll
				const addonsForRequest = Object.entries(selectedAddons)
					.filter(([_, quantity]) => quantity > 0)
					.reduce((acc, [columnName, quantity]) => {
						acc[columnName] = quantity;
						return acc;
					}, {});

				const response = await fetch('/api/check-availability', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						date: startDate,
						bookingLength: selectedBookingLength,
						addons: addonsForRequest,
						experienceId: data.experience.id
					})
				});

				const { availableStartTimes, error } = await response.json();
				possibleStartTimes = error ? [] : availableStartTimes;
			} else {
				// för guidade upplevelser, använd enkla tidsintervall
				const intervals = getAvailableTimeIntervals(startDate, data.openHours);
				possibleStartTimes = intervals.map((interval) => interval.startTime);
			}
		} catch (error) {
			possibleStartTimes = [];
		} finally {
			isLoadingTimes = false;
		}
	}

	// beräknar returdatum och tid
	function calculateReturnDate() {
		// kontrollera att vi har all nödvändig data
		if (!selectedBookingLength || !startTime || !startDate || !data.openHours) {
			return;
		}

		try {
			const startDateTime = new Date(`${startDate}T${startTime}`);
			let returnDateTime = new Date(startDateTime);

			const intervals = getAvailableTimeIntervals(returnDate || startDate, data.openHours);

			if (!intervals || intervals.length === 0) {
				return;
			}

			const closeTime = intervals[0].endTime;
			if (!closeTime) {
				return;
			}

			// för övernattningar
			if (selectedBookingLength.includes('övernattning')) {
				const nights = parseInt(selectedBookingLength);
				returnDateTime.setDate(returnDateTime.getDate() + nights);
				const [hours, minutes] = closeTime.split(':').map(Number);
				returnDateTime.setHours(hours, minutes, 0);
			}
			// för bokningar som är i timmar
			else if (selectedBookingLength.includes('h')) {
				const hours = parseInt(selectedBookingLength);
				returnDateTime.setHours(returnDateTime.getHours() + hours);
			}
			// för hela dagen bokningar
			else if (selectedBookingLength === 'Hela dagen') {
				const [hours, minutes] = closeTime.split(':').map(Number);
				returnDateTime.setHours(hours, minutes, 0);
			}

			returnDate = returnDateTime.toISOString().split('T')[0];
			returnTime = returnDateTime.toTimeString().substring(0, 5);
		} catch (error) {
			// hantera fel tyst men logga för felsökning i produktion
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
			// validera nödvändig data
			if (!startDate || !startTime || !selectedStartLocation) {
				throw new Error('Vänligen fyll i alla bokningsdetaljer');
			}

			const checkoutData = {
				experienceId: data.experience.id,
				name: data.experience.name,
				startDate,
				endDate: returnDate || startDate,
				startTime,
				returnTime,
				closeTime: data.openHours?.defaultCloseTimes?.[0] || '17:00:00',
				is_overnight: false, // sätt ett standardvärde
				booking_length: selectedBookingLength || '3h', // sätt ett standardvärde
				numAdults,
				numChildren: 0,
				userName,
				userLastname,
				userEmail,
				userPhone,
				userComment,
				selectedStartLocation,
				amount: calculateTotalPrice(),
				...selectedAddons
			};

			const response = await fetch('/api/create-checkout-session', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(checkoutData)
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Kunde inte skapa checkout-session');
			}

			const result = await response.json();

			if (!result.url) {
				throw new Error('Ingen checkout-URL returnerades');
			}

			window.location.href = result.url;
		} catch (error) {
			console.error('Checkout error:', error);
			alert(`Ett fel uppstod vid checkout: ${error.message}`);
		}
	}

	// Lägg till denna variabel bland de andra tillståndsvariablerna
	let isSubmittingInvoice = false;

	// Uppdatera handleInvoiceSubmission funktionen
	async function handleInvoiceSubmission() {
		if (isSubmittingInvoice) return;

		try {
			isSubmittingInvoice = true;

			// Logga för att se vad vi har
			console.log('Selected addons before submission:', selectedAddons);

			const bookingData = {
				experience_id: data.experience.id,
				experience: data.experience.name,
				startLocation: selectedStartLocationName,
				start_date: startDate,
				start_time: startTime,
				end_date: returnDate,
				end_time: returnTime,
				number_of_adults: numAdults,
				number_of_children: numChildren,
				amount_total: totalPrice,
				booking_name: userName,
				booking_lastname: userLastname,
				customer_email: userEmail,
				customer_phone: userPhone,
				customer_comment: userComment,
				selectedStartLocation: selectedStartLocation,
				// Lägg till addons här
				addons: selectedAddons
			};

			console.log('Sending booking data:', bookingData);

			// Lägg till denna logg innan fetch-anropet
			console.log('Invoice data innan submission:', invoiceData);

			const response = await fetch('/api/handle-invoice', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					bookingData,
					invoiceData: {
						invoiceType: invoiceData.invoiceType,
						invoiceEmail: invoiceData.invoiceEmail,
						glnPeppolId: invoiceData.glnPeppolId || '',
						marking: invoiceData.marking || '',
						organization: invoiceData.organization,
						address: invoiceData.address,
						postalCode: invoiceData.postalCode,
						city: invoiceData.city
					}
				})
			});

			if (!response.ok) {
				throw new Error('Failed to submit invoice booking');
			}

			const result = await response.json();
			window.location.href = `/success?booking_type=invoice&booking_id=${result.bookingId}`;
		} catch (error) {
			console.error('Error submitting invoice booking:', error);
			alert('Ett fel uppstod vid bokningen. Vänligen försök igen.');
		} finally {
			isSubmittingInvoice = false;
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

	function getDateString(date, addDays = 0) {
		// Ensure we're working with a Date object
		const newDate = new Date(date);
		// Add the specified number of days without timezone adjustments
		newDate.setUTCDate(newDate.getUTCDate() + addDays);
		// Return the date in YYYY-MM-DD format
		return newDate.toISOString().split('T')[0];
	}

	function calculateEndDate(startDate, nights) {
		const date = new Date(startDate);
		date.setDate(date.getDate() + nights);
		return date.toISOString().split('T')[0];
	}

	function generateDateRange(startDate, endDate) {
		const dates = [];
		const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
		const [endYear, endMonth, endDay] = endDate.split('-').map(Number);

		const currentDate = new Date(Date.UTC(startYear, startMonth - 1, startDay));
		const lastDate = new Date(Date.UTC(endYear, endMonth - 1, endDay));

		while (currentDate <= lastDate) {
			dates.push(
				`${currentDate.getUTCFullYear()}-${String(currentDate.getUTCMonth() + 1).padStart(2, '0')}-${String(currentDate.getUTCDate()).padStart(2, '0')}`
			);
			currentDate.setUTCDate(currentDate.getUTCDate() + 1);
		}

		return dates;
	}

	function getAvailableTimeIntervals(date, openHours) {
		// only log if there's an issue with the time intervals
		if (!date || !openHours || (!openHours.specificDates.length && !openHours.periods.length)) {
			console.error('Time Intervals Error:', {
				missingDate: !date,
				missingOpenHours: !openHours,
				noAvailableDates: !openHours?.specificDates.length && !openHours?.periods.length,
				currentState: {
					date,
					hasSpecificDates: openHours?.specificDates.length > 0,
					hasPeriods: openHours?.periods.length > 0
				}
			});
			return [];
		}

		// Check for specific date first
		const specificDate = openHours.specificDates?.find((d) => d.date === date);
		if (specificDate) {
			return [
				{
					startTime: specificDate.open_time,
					endTime: specificDate.close_time
				}
			];
		}

		// Check periods
		const matchingPeriod = openHours.periods?.find((period) => {
			const startDate = new Date(period.start_date);
			const endDate = new Date(period.end_date);
			const checkDate = new Date(date);
			return checkDate >= startDate && checkDate <= endDate;
		});

		if (matchingPeriod) {
			// Generate time slots every 30 minutes
			const slots = [];
			const startTime = new Date(`1970-01-01T${matchingPeriod.open_time}`);
			const endTime = new Date(`1970-01-01T${matchingPeriod.close_time}`);

			while (startTime < endTime) {
				slots.push({
					startTime: startTime.toTimeString().slice(0, 8),
					endTime: matchingPeriod.close_time
				});
				startTime.setMinutes(startTime.getMinutes() + 30);
			}

			return slots;
		}

		return [];
	}

	function findTimeInterval(selectedTime, openHours) {
		const intervals = getAvailableTimeIntervals(startDate, openHours);
		return intervals.find((interval) => interval.startTime === selectedTime);
	}

	function calculateGuidedReturnDate(startDate, startTime, endTime) {
		const [startHour, startMinute] = startTime.split(':').map(Number);
		const [endHour, endMinute] = endTime.split(':').map(Number);

		// om sluttiden är före starttiden, lägg till en dag
		if (endHour < startHour || (endHour === startHour && endMinute < startMinute)) {
			const date = new Date(startDate);
			date.setDate(date.getDate() + 1);
			return date.toISOString().split('T')[0];
		}

		return startDate;
	}
	// Lägg till bland variablerna
	let availableSpots = 0;
	let availableCapacity = null;
	let maxCapacity = null;

	// Lägg till i click-hanteraren för tidsval
	async function handleTimeSelection(time) {
		if (data.experience?.experience_type === 'guided') {
			try {
				const response = await fetch(
					`/api/capacity?experienceId=${data.experience.id}&date=${startDate}&time=${time}`
				);
				const result = await response.json();

				if (result.error) {
					console.error('kapacitetsfel:', result.error);
					return;
				}

				availableCapacity = result.availableCapacity;
				maxCapacity = result.maxCapacity;
				availableSpots = result.availableCapacity;

				startTime = time;
				endTime = data.openHours.guidedHours.closeTime;
				returnDate = startDate;
				returnTime = endTime;

				await tick();
				await scrollToElement('participants-section');
			} catch (error) {
				console.error('fel vid kapacitetskontroll:', error);
			}
		} else {
			startTime = time;
			calculateReturnDate();
			await scrollToElement('participants-section');
		}
	}

	// Lägg till denna funktion för guidade upplevelser
	function handleNextStepGuided() {
		if (numAdults > 0) {
			showContactSection = true;
			// vänta på att DOM:en uppdateras och scrolla sedan till kontaktsektionen
			tick().then(() => {
				scrollToElement('contact-section-guided');
			});
		}
	}

	// Lägg till denna variabel bland de andra tillståndsvariablerna
	let closeTime = null;

	// Uppdatera när openHours ändras
	$: if (data.experience?.openHours) {
		const intervals = getAvailableTimeIntervals(startDate, data.experience.openHours);
		if (intervals.length > 0) {
			closeTime = intervals[0].endTime;
		}
	}

	// Uppdatera returnTime när bokningslängd ändras
	$: if (selectedBookingLength && startDate) {
		if (selectedBookingLength.includes('övernattning')) {
			returnTime = closeTime; // Använd stängningstid för övernattningar
		} else {
			// Behåll existerande logik för dagsbokningar
			const interval = findTimeInterval(startTime, data.openHours);
			if (interval) {
				returnTime = interval.endTime;
			}
		}
	}

	// funktion för att hämta kapacitet
	async function checkCapacity() {
		try {
			const response = await fetch(
				`/api/capacity?experienceId=${data.experience.id}&date=${startDate}&time=${startTime}`
			);
			const result = await response.json();

			if (result.error) {
				throw new Error(result.error);
			}

			availableCapacity = result.availableCapacity;
			maxCapacity = result.maxCapacity;
			availableSpots = availableCapacity;
		} catch (error) {
			console.error('Kapacitetsfel:', error);
			availableCapacity = 0;
			maxCapacity = 0;
			availableSpots = 0;
		}
	}

	// lägg till i reaktiva uttryck
	$: {
		if (startDate && data.experience?.experience_type === 'guided') {
			const guidedHours = data.openHours?.guidedHours;
			if (!guidedHours) {
				console.error('Varning: Inga öppettider konfigurerade för guidad upplevelse');
			} else {
				possibleStartTimes = generateGuidedTimes(guidedHours.openTime, guidedHours.closeTime);
			}
		}
	}

	// Add this function after the existing functions
	function generateGuidedTimes(openTime, closeTime) {
		try {
			if (!openTime || !closeTime) {
				console.error('Missing open or close time');
				return [];
			}

			const [openHour, openMinute] = openTime.split(':').map(Number);
			const [closeHour, closeMinute] = closeTime.split(':').map(Number);

			// Beräkna bokningstid i timmar
			let hours = closeHour - openHour;
			if (closeMinute < openMinute) {
				hours--;
			}

			// Returnera endast starttiden för guidade upplevelser
			return [openTime];
		} catch (error) {
			console.error('Error generating guided times:', error);
			return [];
		}
	}

	// Lägg till denna variabel bland dina andra state-variabler
	let acceptedTerms = false;

	// Uppdatera validateInvoiceForm funktionen
	function validateInvoiceForm(data) {
		// kontrollera att data existerar
		if (!data) return false;

		// gemensamma obligatoriska fält för båda fakturatyper
		const hasBasicFields =
			data.organization?.trim() &&
			data.address?.trim() &&
			data.postalCode?.trim() &&
			data.city?.trim();

		// specifika fält beroende på fakturatyp
		if (data.invoiceType === 'pdf') {
			return hasBasicFields && data.invoiceEmail?.trim();
		} else if (data.invoiceType === 'electronic') {
			return hasBasicFields && data.glnPeppolId?.trim() && data.marking?.trim();
		}

		return false;
	}

	// Lägg till bland de andra tillståndsvariablerna
	let selectedOptionalProducts = {};
	let showOptionalProducts = false;

	// Lägg till denna reaktiva beräkning för totalpris med tillval
	$: {
		if (data.optionalProducts) {
			// initialisera selectedOptionalProducts om det behövs
			data.optionalProducts.forEach((product) => {
				if (selectedOptionalProducts[product.id] === undefined) {
					selectedOptionalProducts[product.id] = product.type === 'per_person' ? 0 : false;
				}
			});
		}
	}

	// Uppdatera beräkningen av totalpris för att inkludera tillvalsprodukter
	function calculateOptionalProductsTotal() {
		if (!data.optionalProducts) return 0;

		return data.optionalProducts.reduce((total, product) => {
			const selected = selectedOptionalProducts[product.id];
			if (product.type === 'per_person') {
				return total + selected * product.price;
			} else {
				return total + (selected ? (numAdults + numChildren) * product.price : 0);
			}
		}, 0);
	}

	// Uppdatera den befintliga updatePrice funktionen
	function updatePrice() {
		if (selectedStartLocation && data.startLocations) {
			const selectedLocation = data.startLocations.find(
				(location) => location.id === selectedStartLocation
			);

			if (selectedLocation?.price && numAdults > 0) {
				const basePrice = Number(selectedLocation.price) || 0;
				const optionalProductsTotal = calculateOptionalProductsTotal();
				totalPrice = Math.round(numAdults * basePrice + optionalProductsTotal);
			} else {
				totalPrice = 0;
			}
		} else {
			totalPrice = 0;
		}

		if (isNaN(totalPrice)) {
			totalPrice = 0;
		}
	}

	// Lägg till en watch för att uppdatera pris när tillval ändras
	$: {
		if (selectedOptionalProducts && Object.keys(selectedOptionalProducts).length > 0) {
			updatePrice();
		}
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
				<!-- Step 1: Date and Time Selection -->
				<Card id="calendar-section">
					<CardHeader>
						<CardTitle>Välj datum och tid</CardTitle>
					</CardHeader>
					<CardContent>
						<!-- kalender-komponenten -->
						<Calendar
							{minDate}
							{maxDate}
							{data}
							openingPeriods={{
								periods: data.openHours?.periods || [],
								specificDates: data.openHours?.specificDates || [],
								defaultOpenTimes: data.openHours?.defaultOpenTimes || [],
								defaultCloseTimes: data.openHours?.defaultCloseTimes || [],
								isGuided: data.experience?.experience_type === 'guided'
							}}
							{blockedDates}
							selectedDate={startDate}
							endDate={returnDate}
							bookingLength={{
								length:
									data.experience?.experience_type === 'guided' ? 'guided' : selectedBookingLength,
								overnight: selectedBookingLength?.includes('övernattning'),
								return_day_offset: selectedBookingLength?.includes('övernattning')
									? parseInt(selectedBookingLength)
									: 0
							}}
							disabled={settingsLocked || startTime !== null}
							on:dateSelect={async ({ detail }) => {
								const { date } = detail;
								// Ensure we're using the correct date by setting hours to noon to avoid timezone issues
								const selectedDate = new Date(date);
								selectedDate.setHours(12, 0, 0, 0);
								const newDateStr = selectedDate.toISOString().split('T')[0];

								// Only update if we don't have a date yet or if it's a different date
								if (!startDate || startDate !== newDateStr) {
									startDate = newDateStr;
									// Reset time-related states
									startTime = null;
									returnTime = null;
									returnDate = null;
									hasGeneratedTimes = false;
									possibleStartTimes = [];
									settingsLocked = false;

									// Vänta på att DOM:en uppdateras och scrolla sedan till equipment-section
									await tick();
									await scrollToElement('equipment-section');
								}
							}}
						/>

						{#if startDate}
							{#if data.experience?.experience_type === 'guided'}
								<div class="mt-6 space-y-4" id="time-selection">
									<Label>Välj starttid:</Label>
									<div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
										<Button
											variant={startTime === data.openHours.guidedHours.openTime
												? 'default'
												: 'outline'}
											on:click={() => handleTimeSelection(data.openHours.guidedHours.openTime)}
										>
											{data.openHours.guidedHours.openTime}
										</Button>
									</div>
								</div>
							{:else}
								<!-- Original time selection for public experiences -->
								<div class="space-y-4" id="time-selection">
									<div class="flex justify-between items-center">
										<Button
											disabled={isLoadingTimes ||
												Object.values(selectedAddons).every((v) => v === 0)}
											on:click={async () => {
												await generateStartTimes();
												// vänta på att dom:en uppdateras
												await tick();
												// vänta lite extra för att säkerställa att allt har renderats
												await new Promise((resolve) => setTimeout(resolve, 100));
												// skrolla till tidsväljaren
												const timeSelection = document.getElementById('time-selection');
												if (timeSelection) {
													timeSelection.scrollIntoView({ behavior: 'smooth', block: 'center' });
												}
											}}
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
									</div>

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
							{/if}
						{/if}
					</CardContent>
				</Card>

				{#if startDate && startTime}
					<!-- Booking Summary -->
					<Card class="mt-4" id="booking-summary">
						<CardHeader>
							<CardTitle class="text-2xl font-semibold">Din bokning</CardTitle>
						</CardHeader>
						<CardContent>
							<div class="space-y-4">
								<!-- startdatum och tid -->
								{#if startDate}
									<div>
										<p class="font-medium">Startdatum: {startDate}</p>
									</div>
								{/if}

								{#if startTime}
									<div>
										<p class="font-medium">Starttid: {startTime}</p>
									</div>
								{/if}

								<!-- returdatum och tid -->
								{#if returnDate && returnTime}
									<div>
										<p class="font-medium">Returdatum: {returnDate}</p>
									</div>
									<div>
										<p class="font-medium">Returtid senast: {returnTime}</p>
									</div>
								{/if}
							</div>
						</CardContent>
					</Card>

					<!-- Participants Section -->
					<Card class="mt-4" id="participants-section">
						<CardHeader>
							<CardTitle>Antal deltagare</CardTitle>
						</CardHeader>
						<CardContent class="space-y-4">
							<div class="space-y-2">
								<Label for="adults">
									Antal personer ({availableSpots}
									{availableSpots === 1 ? 'plats' : 'platser'} kvar)
								</Label>
								<div class="flex items-center space-x-2">
									<Button
										variant="outline"
										class="px-3"
										on:click={() => {
											numAdults = Math.max(0, numAdults - 1);
											updatePrice();
										}}
									>
										-
									</Button>
									<div class="w-12 text-center">{numAdults}</div>
									<Button
										variant="outline"
										class="px-3"
										disabled={numAdults >= availableSpots}
										on:click={() => {
											numAdults = Math.min(availableSpots, numAdults + 1);
											updatePrice();
										}}
									>
										+
									</Button>
								</div>
							</div>

							<Alert>
								<AlertTitle>Totalt pris</AlertTitle>
								<AlertDescription>{totalPrice}kr</AlertDescription>
							</Alert>

							<div class="mb-4">
								<Alert>
									<AlertTitle>Tillgängliga platser</AlertTitle>
									<AlertDescription>
										{#if availableCapacity === null}
											Kontrollerar tillgänglighet...
										{:else}
											{availableCapacity} av {maxCapacity} platser kvar
										{/if}
									</AlertDescription>
								</Alert>
							</div>

							<Button
								class="w-full mt-4"
								disabled={numAdults === 0}
								on:click={() => {
									if (data.experience.experience_type === 'business_school') {
										showOptionalProducts = true;
									} else {
										showContactSection = true;
									}
								}}
							>
								{#if numAdults === 0}
									Välj antal deltagare
								{:else}
									Nästa steg
								{/if}
							</Button>
						</CardContent>
					</Card>

					<!-- Optional Products Section -->
					{#if data.experience.experience_type === 'business_school' && numAdults > 0 && showOptionalProducts}
						<Card class="mt-6">
							<CardHeader>
								<CardTitle>Tillvalsprodukter</CardTitle>
								<CardDescription
									>Välj extra produkter eller tjänster till din bokning</CardDescription
								>
							</CardHeader>
							<CardContent>
								<div class="grid gap-6">
									{#each data.optionalProducts as product (product.id)}
										<div class="flex items-start space-x-4 p-4 border rounded-lg">
											{#if product.image_url}
												<img
													src={product.image_url}
													alt={product.name}
													class="w-20 h-20 object-cover rounded"
												/>
											{/if}
											<div class="flex-1">
												<div class="flex justify-between items-start">
													<div>
														<h3 class="font-medium">{product.name}</h3>
														<p class="text-sm text-muted-foreground">{product.description}</p>
													</div>
													<Badge variant="outline">
														{product.price} kr{product.type === 'per_person' ? '/st' : '/person'}
													</Badge>
												</div>
												<div class="mt-4">
													{#if product.type === 'per_person'}
														<div class="flex items-center space-x-2">
															<Button
																variant="outline"
																size="sm"
																on:click={() => {
																	selectedOptionalProducts[product.id] = Math.max(
																		0,
																		selectedOptionalProducts[product.id] - 1
																	);
																}}
																disabled={selectedOptionalProducts[product.id] <= 0}
															>
																-
															</Button>
															<span class="w-8 text-center">
																{selectedOptionalProducts[product.id]}
															</span>
															<Button
																variant="outline"
																size="sm"
																on:click={() => {
																	selectedOptionalProducts[product.id] =
																		selectedOptionalProducts[product.id] + 1;
																}}
															>
																+
															</Button>
														</div>
													{:else}
														<Checkbox
															checked={selectedOptionalProducts[product.id]}
															on:change={(e) => {
																selectedOptionalProducts[product.id] = e.target.checked;
															}}
														>
															Lägg till ({product.price} kr/person)
														</Checkbox>
													{/if}
												</div>
											</div>
										</div>
									{/each}
								</div>
								<Button class="w-full mt-6" on:click={() => (showContactSection = true)}>
									Gå vidare till kontaktuppgifter
								</Button>
							</CardContent>
						</Card>
					{/if}

					{#if showContactSection}
						<Card id="contact-section-guided">
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

								<div class="flex items-center gap-2 mb-4">
									<Checkbox id="terms" bind:checked={acceptTerms} />
									<label for="terms" class="text-sm">
										Jag accepterar <a
											href="/terms"
											class="text-primary hover:underline"
											target="_blank">bokningsvillkoren och köpvillkoren</a
										>
									</label>
								</div>

								<div class="flex flex-col gap-4 mt-6">
									{#if data.experience.experience_type !== 'business_school'}
										<Button
											disabled={!acceptTerms || isSubmittingInvoice}
											on:click={handleInvoiceSubmission}
											variant="outline"
											class="w-full"
										>
											{#if isSubmittingInvoice}
												<Loader2 class="mr-2 h-4 w-4 animate-spin" />
											{/if}
											{#if !isFormValid}
												Fyll i alla kontaktuppgifter
											{:else if !isInvoiceFormValid}
												{#if invoiceData.invoiceType === 'pdf'}
													Fyll i alla fakturauppgifter (PDF)
												{:else}
													Fyll i alla fakturauppgifter (Elektronisk)
												{/if}
											{:else}
												Skicka fakturabegäran ({totalPrice}kr)
											{/if}
										</Button>

										<Button disabled={!acceptTerms} on:click={handleCheckout} class="w-full">
											Betala med kort
										</Button>
									{:else}
										<!-- För business_school visas endast fakturabetalning -->
										<Button
											class="w-full mt-4"
											disabled={!isFormValid || !isInvoiceFormValid || isSubmittingInvoice}
											on:click={handleInvoiceSubmission}
										>
											{#if isSubmittingInvoice}
												<Loader2 class="mr-2 h-4 w-4 animate-spin" />
											{/if}
											{#if !isFormValid}
												Fyll i alla kontaktuppgifter
											{:else if !isInvoiceFormValid}
												{#if invoiceData.invoiceType === 'pdf'}
													Fyll i alla fakturauppgifter (PDF)
												{:else}
													Fyll i alla fakturauppgifter (Elektronisk)
												{/if}
											{:else}
												Skicka fakturabegäran ({totalPrice}kr)
											{/if}
										</Button>
									{/if}
								</div>
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
								{data}
								openingPeriods={{
									periods: data.openHours?.periods || [],
									specificDates: data.openHours?.specificDates || [],
									defaultOpenTimes: data.openHours?.defaultOpenTimes || [],
									defaultCloseTimes: data.openHours?.defaultCloseTimes || [],
									isGuided: data.experience?.experience_type === 'guided'
								}}
								{blockedDates}
								selectedDate={startDate}
								endDate={returnDate}
								bookingLength={{
									length:
										data.experience?.experience_type === 'guided'
											? 'guided'
											: selectedBookingLength,
									overnight: selectedBookingLength?.includes('övernattning'),
									return_day_offset: selectedBookingLength?.includes('övernattning')
										? parseInt(selectedBookingLength)
										: 0
								}}
								disabled={settingsLocked || startTime !== null}
								on:dateSelect={async ({ detail }) => {
									const { date } = detail;
									// Ensure we're using the correct date by setting hours to noon to avoid timezone issues
									const selectedDate = new Date(date);
									selectedDate.setHours(12, 0, 0, 0);
									const newDateStr = selectedDate.toISOString().split('T')[0];

									// Only update if we don't have a date yet or if it's a different date
									if (!startDate || startDate !== newDateStr) {
										startDate = newDateStr;
										// Reset time-related states
										startTime = null;
										returnTime = null;
										returnDate = null;
										hasGeneratedTimes = false;
										possibleStartTimes = [];
										settingsLocked = false;

										// Vänta på att DOM:en uppdateras och scrolla sedan till equipment-section
										await tick();
										await scrollToElement('equipment-section');
									}
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
									on:click={async () => {
										await generateStartTimes();
										// vänta på att dom:en uppdateras
										await tick();
										// vänta lite extra för att säkerställa att allt har renderats
										await new Promise((resolve) => setTimeout(resolve, 100));
										// skrolla till tidsväljaren
										const timeSelection = document.getElementById('time-selection');
										if (timeSelection) {
											timeSelection.scrollIntoView({ behavior: 'smooth', block: 'center' });
										}
									}}
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

						<Button
							class="w-full mt-4"
							disabled={numAdults === 0}
							on:click={() => {
								if (data.experience.experience_type === 'business_school') {
									showOptionalProducts = true;
								} else {
									showContactSection = true;
								}
							}}
						>
							{#if numAdults === 0}
								Välj antal deltagare
							{:else}
								Nästa steg
							{/if}
						</Button>
					</CardContent>
				</Card>
			{/if}

			{#if data.experience.experience_type === 'business_school' && numAdults > 0 && showOptionalProducts}
				<Card class="mt-6">
					<CardHeader>
						<CardTitle>Tillvalsprodukter</CardTitle>
						<CardDescription>Välj extra produkter eller tjänster till din bokning</CardDescription>
					</CardHeader>
					<CardContent>
						<div class="grid gap-6">
							{#each data.optionalProducts as product (product.id)}
								<div class="flex items-start space-x-4 p-4 border rounded-lg">
									{#if product.image_url}
										<img
											src={product.image_url}
											alt={product.name}
											class="w-20 h-20 object-cover rounded"
										/>
									{/if}
									<div class="flex-1">
										<div class="flex justify-between items-start">
											<div>
												<h3 class="font-medium">{product.name}</h3>
												<p class="text-sm text-muted-foreground">{product.description}</p>
											</div>
											<Badge variant="outline">
												{product.price} kr{product.type === 'per_person' ? '/st' : '/person'}
											</Badge>
										</div>
										<div class="mt-4">
											{#if product.type === 'per_person'}
												<div class="flex items-center space-x-2">
													<Button
														variant="outline"
														size="sm"
														on:click={() => {
															selectedOptionalProducts[product.id] = Math.max(
																0,
																selectedOptionalProducts[product.id] - 1
															);
														}}
														disabled={selectedOptionalProducts[product.id] <= 0}
													>
														-
													</Button>
													<span class="w-8 text-center">
														{selectedOptionalProducts[product.id]}
													</span>
													<Button
														variant="outline"
														size="sm"
														on:click={() => {
															selectedOptionalProducts[product.id] =
																selectedOptionalProducts[product.id] + 1;
														}}
													>
														+
													</Button>
												</div>
											{:else}
												<Checkbox
													checked={selectedOptionalProducts[product.id]}
													on:change={(e) => {
														selectedOptionalProducts[product.id] = e.target.checked;
													}}
												>
													Lägg till ({product.price} kr/person)
												</Checkbox>
											{/if}
										</div>
									</div>
								</div>
							{/each}
						</div>
						<Button class="w-full mt-6" on:click={() => (showContactSection = true)}>
							Gå vidare till kontaktuppgifter
						</Button>
					</CardContent>
				</Card>
			{/if}

			{#if showContactSection}
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

						<div class="flex items-center gap-2 mb-4">
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
										disabled={!isFormValid}
									>
										{#if !isFormValid}
											Fyll i alla obligatoriska fält
										{:else}
											Betala med kort
										{/if}
									</Button>
									<Button
										variant={selectedPaymentMethod === 'invoice' ? 'default' : 'outline'}
										on:click={async () => {
											selectedPaymentMethod = 'invoice';
											await tick();
											scrollToElement('invoice-form');
										}}
										class="flex-1"
										disabled={!isFormValid}
									>
										{#if !isFormValid}
											Fyll i alla obligatoriska fält
										{:else}
											Betala med faktura
										{/if}
									</Button>
								</div>

								{#if selectedPaymentMethod === 'invoice'}
									<Card class="mt-4" id="invoice-form">
										<CardHeader>
											<CardTitle>Fakturauppgifter</CardTitle>
										</CardHeader>
										<CardContent>
											<InvoiceForm bind:invoiceData />

											<Button
												class="w-full mt-4"
												disabled={!isFormValid || !isInvoiceFormValid || isSubmittingInvoice}
												on:click={handleInvoiceSubmission}
											>
												{#if isSubmittingInvoice}
													<Loader2 class="mr-2 h-4 w-4 animate-spin" />
												{/if}
												{#if !isFormValid}
													Fyll i alla kontaktuppgifter
												{:else if !isInvoiceFormValid}
													{#if invoiceData.invoiceType === 'pdf'}
														Fyll i alla fakturauppgifter (PDF)
													{:else}
														Fyll i alla fakturauppgifter (Elektronisk)
													{/if}
												{:else}
													Skicka fakturabegäran ({totalPrice}kr)
												{/if}
											</Button>
										</CardContent>
									</Card>
								{/if}
							</div>
						{:else}
							<!-- Original payment button for public experiences -->
							<Button
								disabled={!isFormValid || !acceptTerms}
								on:click={handleCheckout}
								class="w-full"
							>
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

{#if isSubmittingInvoice}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
		<div class="bg-white p-8 rounded-lg shadow-xl flex flex-col items-center">
			<Loader2 class="h-8 w-8 animate-spin mb-4" />
			<p class="text-lg font-semibold">Bearbetar din bokning...</p>
			<p class="text-sm text-gray-500">Vänligen vänta medan vi behandlar din förfrågan</p>
		</div>
	</div>
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

	/* Om du vill styla disabled-tillståndet ytterligare */
	:global(button:disabled) {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
