import { formatDateTime, formatPrice } from './emailTemplates.js';

export const pdfInvoiceTemplate = (bookingData, invoiceData) => {
	// validera data innan vi använder den
	const safeBookingData = {
		booking_name: bookingData.booking_name || 'Gäst',
		id: bookingData.id || 'N/A',
		start_date: bookingData.start_date || 'N/A',
		start_time: bookingData.start_time || 'N/A',
		number_of_adults: bookingData.number_of_adults || 0,
		number_of_children: bookingData.number_of_children || 0,
		amount_total: bookingData.amount_total || 0
	};

	const safeInvoiceData = {
		organization: invoiceData.organization || 'N/A',
		address: invoiceData.address || 'N/A',
		postalCode: invoiceData.postalCode || 'N/A',
		city: invoiceData.city || 'N/A',
		marking: invoiceData.marking || '',
		invoiceEmail: invoiceData.invoiceEmail || ''
	};

	// Formatera addons-information
	const addonsHtml =
		bookingData.addons && bookingData.addons.length > 0
			? `
			<tr>
				<td colspan="2" style="padding: 10px 0; border-top: 1px solid #eee;">
					<strong>Bokade produkter:</strong>
				</td>
			</tr>
			${bookingData.addons
				.filter((addon) => addon.amount > 0)
				.map(
					(addon) => `
					<tr>
						<td style="padding: 5px 0;">${addon.name}</td>
						<td style="padding: 5px 0; text-align: right;">${addon.amount} st</td>
					</tr>
				`
				)
				.join('')}`
			: '';

	return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            /* Behåll befintlig styling */
        </style>
    </head>
    <body>
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Fakturabegäran mottagen</h2>
            
            <p>Hej ${safeBookingData.booking_name},</p>
            
            <p>Vi har mottagit din begäran om PDF-faktura för din bokning.</p>
            
            <h3>Bokningsdetaljer:</h3>
            <ul>
                <li>Bokningsnummer: ${safeBookingData.id}</li>
                <li>Datum: ${safeBookingData.start_date}</li>
                <li>Tid: ${safeBookingData.start_time}</li>
                <li>Antal vuxna: ${safeBookingData.number_of_adults}</li>
                <li>Antal barn: ${safeBookingData.number_of_children}</li>
                <li>Totalt belopp: ${safeBookingData.amount_total} kr</li>
            </ul>
            
            <h3>Faktureringsinformation:</h3>
            <ul>
                <li>Organisation: ${safeInvoiceData.organization}</li>
                <li>Adress: ${safeInvoiceData.address}</li>
                <li>Postnummer: ${safeInvoiceData.postalCode}</li>
                <li>Stad: ${safeInvoiceData.city}</li>
                ${safeInvoiceData.marking ? `<li>Märkning: ${safeInvoiceData.marking}</li>` : ''}
            </ul>
            
            <p>Vi kommer att skicka fakturan till: ${safeInvoiceData.invoiceEmail}</p>
            
            <p>Om du har några frågor, vänligen kontakta oss.</p>
            
            <p>Med vänliga hälsningar,<br>Stisses</p>
        </div>
        
        <!-- Lägg till addons-information före prisinformationen -->
        <table style="width: 100%; margin-top: 20px;">
            ${addonsHtml}
            <!-- Resten av din befintliga tabell -->
        </table>
    </body>
    </html>
    `;
};

// E-faktura template
export const electronicInvoiceTemplate = `
<h2>Ny elektronisk fakturaförfrågan</h2>
<p>En ny elektronisk fakturaförfrågan har inkommit med följande information:</p>

<h3>Bokningsinformation</h3>
<ul>
    <li>Upplevelse: {{experience}}</li>
    <li>Datum: {{start_date}} - {{end_date}}</li>
    <li>Tid: {{start_time}} - {{end_time}}</li>
    <li>Antal vuxna: {{number_of_adults}}</li>
    <li>Antal barn: {{number_of_children}}</li>
    <li>Totalt belopp: {{amount_total}} kr</li>
</ul>

<h3>Fakturainformation</h3>
<ul>
    <li>Organisation: {{organization}}</li>
    <li>GLN/PEPPOL-ID: {{glnPeppolId}}</li>
    <li>Märkning: {{marking}}</li>
    <li>Adress: {{address}}</li>
    <li>Postnummer: {{postal_code}}</li>
    <li>Ort: {{city}}</li>
</ul>

<h3>Kontaktinformation</h3>
<ul>
    <li>Namn: {{booking_name}} {{booking_lastname}}</li>
    <li>E-post: {{customer_email}}</li>
    <li>Telefon: {{customer_phone}}</li>
</ul>

<p>Kommentar: {{customer_comment}}</p>
`;
