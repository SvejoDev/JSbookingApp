// hjälpfunktioner för att hantera tidsslots
export function timeToSlot(time) {
	const [hours, minutes] = time.split(':').map(Number);
	return (hours * 60 + minutes) / 15;
}

export function calculateTotalSlots(startSlot, endSlot, isOvernight) {
	if (isOvernight) {
		return 96 - startSlot; // 96 slots per dag (24 timmar * 4 slots per timme)
	}
	return endSlot - startSlot;
}

export function timeToMinutes(time) {
	const [hours, minutes] = time.split(':').map(Number);
	return hours * 60 + minutes;
}
