async function validateRebooking(bookingId) {
	const {
		rows: [settings]
	} = await query('SELECT setting_value FROM system_settings WHERE setting_key = $1', [
		'rebooking_deadline_hours'
	]);

	const deadlineHours = parseInt(settings.setting_value);

	// Hämta bokning och kontrollera tidsgräns
	const {
		rows: [booking]
	} = await query(
		`
    SELECT 
      b.*,
      EXISTS(
        SELECT 1 FROM booking_optional_products bop
        JOIN optional_products op ON op.id = bop.optional_product_id
        WHERE bop.booking_id = b.id 
        AND op.name = 'Ombokningsgaranti'
      ) as has_rebooking_guarantee
    FROM bookings b 
    WHERE b.id = $1
  `,
		[bookingId]
	);

	if (!booking.has_rebooking_guarantee) {
		throw new Error('Bokningen saknar ombokningsgaranti');
	}

	const startDateTime = new Date(`${booking.start_date}T${booking.start_time}`);
	const hoursUntilStart = (startDateTime - new Date()) / (1000 * 60 * 60);

	if (hoursUntilStart < deadlineHours) {
		throw new Error(`Ombokning måste göras minst ${deadlineHours}h innan start`);
	}

	return true;
}
