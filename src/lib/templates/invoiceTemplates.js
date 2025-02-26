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

	// formatera bokade produkter (addons) på samma sätt som i bookingConfirmationTemplate
	const addonsSection =
		bookingData.addons && bookingData.addons.length > 0
			? `
		<div style="margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 20px;">
			<h3>Bokade produkter</h3>
			<ul>
				${bookingData.addons
					.filter((addon) => addon.amount > 0)
					.map((addon) => `<li>${addon.name}: ${addon.amount} st</li>`)
					.join('')}
			</ul>
		</div>`
			: '';

	// formatera tillvalsprodukter på samma sätt som i bookingConfirmationTemplate
	const optionalProductsSection =
		bookingData.optional_products && bookingData.optional_products.length > 0
			? `
		<div style="margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 20px;">
			<h3>Tillvalsprodukter</h3>
			<ul>
				${bookingData.optional_products
					.map(
						(product) =>
							`<li>${product.name} - ${product.quantity}st (${formatPrice(product.total_price)} kr)</li>`
					)
					.join('')}
			</ul>
		</div>`
			: '';

	return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
            }
            .header {
                background-color: #f8f9fa;
                padding: 20px;
                margin-bottom: 30px;
                border-radius: 5px;
            }
            .section {
                margin-bottom: 30px;
                border-bottom: 1px solid #eee;
                padding-bottom: 20px;
            }
            .price-row {
                display: flex;
                justify-content: space-between;
                margin-bottom: 8px;
            }
            .price-total {
                font-weight: bold;
                border-top: 1px solid #eee;
                padding-top: 8px;
                margin-top: 8px;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h2>Fakturabegäran mottagen</h2>
            <p>Bokningsnummer: #${safeBookingData.id}</p>
        </div>
            
        <div class="section">
            <h3>Bokningsdetaljer</h3>
            <p><strong>Upplevelse:</strong> ${bookingData.experience || 'Ej angiven'}</p>
            <p><strong>Startplats:</strong> ${bookingData.startLocationName || bookingData.startLocation || 'Ej angiven'}</p>
            <p><strong>Datum:</strong> ${safeBookingData.start_date} kl. ${safeBookingData.start_time}</p>
            <p><strong>Antal vuxna:</strong> ${safeBookingData.number_of_adults}</p>
            <p><strong>Antal barn:</strong> ${safeBookingData.number_of_children}</p>
        </div>
        
        <!-- bokade produkter (addons) -->
        ${addonsSection}
        
        <!-- tillvalsprodukter -->
        ${optionalProductsSection}
        
        <div class="section">
            <h3>Prisdetaljer</h3>
            <div class="price-row">
                <span>Delsumma (exkl. moms):</span>
                <span>${formatPrice(bookingData.subtotal || 0)} kr</span>
            </div>
            <div class="price-row">
                <span>Moms (25%):</span>
                <span>${formatPrice(bookingData.vat || 0)} kr</span>
            </div>
            <div class="price-row price-total">
                <span>Totalt att betala:</span>
                <span>${formatPrice(bookingData.total || safeBookingData.amount_total)} kr</span>
            </div>
        </div>
            
        <div class="section">
            <h3>Faktureringsinformation</h3>
            <p><strong>Organisation:</strong> ${safeInvoiceData.organization}</p>
            <p><strong>Adress:</strong> ${safeInvoiceData.address}</p>
            <p><strong>Postnummer:</strong> ${safeInvoiceData.postalCode}</p>
            <p><strong>Stad:</strong> ${safeInvoiceData.city}</p>
            ${safeInvoiceData.marking ? `<p><strong>Märkning:</strong> ${safeInvoiceData.marking}</p>` : ''}
            <p><strong>E-post för faktura:</strong> ${safeInvoiceData.invoiceEmail}</p>
        </div>
        
        <div class="section">
            <h3>Kontaktinformation</h3>
            <p><strong>Namn:</strong> ${bookingData.booking_name || ''} ${bookingData.booking_lastname || ''}</p>
            <p><strong>E-post:</strong> ${bookingData.customer_email || ''}</p>
            <p><strong>Telefon:</strong> ${bookingData.customer_phone || ''}</p>
            ${bookingData.customer_comment ? `<p><strong>Meddelande:</strong> ${bookingData.customer_comment}</p>` : ''}
        </div>
        
        <p>Om du har några frågor, vänligen kontakta oss.</p>
        
        <p>Med vänliga hälsningar,<br>Stisses</p>
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
