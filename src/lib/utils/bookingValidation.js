import { logger } from '$lib/utils/logger';

export function validateBookingData(bookingData) {
	const requiredFields = [
		'startlocation',
		'adultPrice',
		'start_date',
		'start_time',
		'number_of_adults'
	];

	const missingFields = requiredFields.filter((field) => !bookingData[field]);

	if (missingFields.length > 0) {
		logger.warn('Missing required booking fields:', missingFields);
		return false;
	}

	return true;
}
