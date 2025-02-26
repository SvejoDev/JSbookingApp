import sgMail from '@sendgrid/mail';
import dotenv from 'dotenv';
import Handlebars from 'handlebars';
import html_to_pdf from 'html-pdf-node';
import { query } from '$lib/db.js';

import { bookingConfirmationTemplate } from './templates/bookingTemplates.js';
import { pdfInvoiceTemplate, electronicInvoiceTemplate } from './templates/invoiceTemplates.js';
import { formatDateTime, formatPrice, formatDate } from './templates/emailTemplates.js';

dotenv.config();

// registrera alla handlebars helpers först
Handlebars.registerHelper({
	formatDateTime: function (date, time) {
		try {
			if (!date) return '';
			const dateObj = new Date(date);
			const timeStr = time || '00:00';
			return new Intl.DateTimeFormat('sv-SE', {
				year: 'numeric',
				month: 'long',
				day: 'numeric',
				hour: 'numeric',
				minute: 'numeric'
			}).format(dateObj);
		} catch (error) {
			console.error('Fel vid datumformatering:', error);
			return '';
		}
	},

	formatPrice: function (price) {
		try {
			return new Intl.NumberFormat('sv-SE', {
				style: 'currency',
				currency: 'SEK',
				minimumFractionDigits: 0,
				maximumFractionDigits: 0
			}).format(price || 0);
		} catch (error) {
			console.error('Fel vid prisformatering:', error);
			return '0 kr';
		}
	},

	formatDate: function (date) {
		try {
			if (!date) return '';
			return new Intl.DateTimeFormat('sv-SE', {
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			}).format(new Date(date));
		} catch (error) {
			console.error('Fel vid datumformatering:', error);
			return '';
		}
	},

	multiply: function (a, b) {
		return (Number(a) || 0) * (Number(b) || 0);
	},

	eq: function (a, b) {
		return a === b;
	}
});

// e-post konfiguration
const EMAIL_CONFIG = {
	FROM: {
		email: process.env.SENDGRID_FROM_EMAIL || 'info@stisses.se',
		name: 'Stisses'
	},
	INVOICE_RECIPIENTS: ['johan.svensson@svejo.se', 'info@stisses.se']
};

// lägg till verifiering av api-nyckel
const apiKey = process.env.SENDGRID_API_KEY?.trim();
if (!apiKey) {
	throw new Error('SendGrid API-nyckel saknas');
}

// konfigurera sendgrid
sgMail.setApiKey(apiKey);

// lägg till denna hjälpfunktion för att formatera priser
Handlebars.registerHelper('formatPrice', function (price) {
	return new Intl.NumberFormat('sv-SE', {
		style: 'currency',
		currency: 'SEK',
		minimumFractionDigits: 0,
		maximumFractionDigits: 0
	}).format(price || 0);
});

// uppdatera bokningsbekräftelsemallen
const bookingTemplate = `
<!DOCTYPE html>
<html>
<head>
	<style>
		/* stilar för en tydligare och mer strukturerad layout */
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
		.details-grid {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 10px;
			margin-bottom: 20px;
		}
		.detail-item {
			margin-bottom: 10px;
		}
		.detail-label {
			font-weight: bold;
			color: #666;
		}
		.price-table {
			width: 100%;
			border-collapse: collapse;
			margin-bottom: 20px;
		}
		.price-table th, .price-table td {
			padding: 10px;
			border-bottom: 1px solid #eee;
			text-align: left;
		}
		.total-price {
			font-size: 1.2em;
			font-weight: bold;
			text-align: right;
			padding: 10px;
			background-color: #f8f9fa;
		}
	</style>
</head>
<body>
	<div class="header">
		<h2>Bokningsbekräftelse - Stisses</h2>
		<p>Bokningsnummer: {{booking.id}}</p>
		<p>Skapades: {{formatDateTime booking.date_time_created}}</p>
	</div>

	<div class="section">
		<h3>Bokningsdetaljer</h3>
		<div class="details-grid">
			<div class="detail-item">
				<div class="detail-label">Upplevelse</div>
				<div>{{booking.experience}}</div>
			</div>
			<div class="detail-item">
				<div class="detail-label">Datum</div>
				<div>{{formatDate booking.start_date}}</div>
			</div>
			<div class="detail-item">
				<div class="detail-label">Tid</div>
				<div>{{booking.start_time}} - {{booking.end_time}}</div>
			</div>
			<div class="detail-item">
				<div class="detail-label">Startplats</div>
				<div>{{booking.startLocation}}</div>
			</div>
		</div>
	</div>

	<div class="section">
		<h3>Deltagare och utrustning</h3>
		<table class="price-table">
			<thead>
				<tr>
					<th>Beskrivning</th>
					<th>Antal</th>
					<th>Pris/st</th>
					<th>Totalt</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td>Vuxna</td>
					<td>{{booking.number_of_adults}}</td>
					<td>{{formatPrice booking.price_per_adult}}</td>
					<td>{{formatPrice (multiply booking.number_of_adults booking.price_per_adult)}}</td>
				</tr>
				{{#if booking.number_of_children}}
				<tr>
					<td>Barn</td>
					<td>{{booking.number_of_children}}</td>
					<td>{{formatPrice booking.price_per_child}}</td>
					<td>{{formatPrice (multiply booking.number_of_children booking.price_per_child)}}</td>
				</tr>
				{{/if}}
				{{#if booking.amount_canoes}}
				<tr>
					<td>Kanadensare</td>
					<td>{{booking.amount_canoes}}</td>
					<td>-</td>
					<td>Ingår</td>
				</tr>
				{{/if}}
				{{#if booking.amount_kayak}}
				<tr>
					<td>Kajaker</td>
					<td>{{booking.amount_kayak}}</td>
					<td>-</td>
					<td>Ingår</td>
				</tr>
				{{/if}}
				{{#if booking.amount_sup}}
				<tr>
					<td>SUP</td>
					<td>{{booking.amount_sup}}</td>
					<td>-</td>
					<td>Ingår</td>
				</tr>
				{{/if}}
			</tbody>
		</table>
	</div>

	{{#if booking.optional_products.length}}
	<div class="section">
		<h3>Tillvalsprodukter</h3>
		<table class="price-table">
			<thead>
				<tr>
					<th>Produkt</th>
					<th>Antal</th>
					<th>Pris/st</th>
					<th>Totalt</th>
				</tr>
			</thead>
			<tbody>
				{{#each booking.optional_products}}
				<tr>
					<td>{{name}}</td>
					<td>{{quantity}}</td>
					<td>{{formatPrice price}}</td>
					<td>{{formatPrice total_price}}</td>
				</tr>
				{{/each}}
			</tbody>
		</table>
	</div>
	{{/if}}

	<div class="total-price">
		Totalt att betala: {{formatPrice booking.amount_total}}
	</div>

	<div class="section">
		<h3>Kontaktinformation</h3>
		<div class="details-grid">
			<div class="detail-item">
				<div class="detail-label">Namn</div>
				<div>{{booking.booking_name}} {{booking.booking_lastname}}</div>
			</div>
			<div class="detail-item">
				<div class="detail-label">E-post</div>
				<div>{{booking.customer_email}}</div>
			</div>
			<div class="detail-item">
				<div class="detail-label">Telefon</div>
				<div>{{booking.customer_phone}}</div>
			</div>
			{{#if booking.customer_comment}}
			<div class="detail-item">
				<div class="detail-label">Meddelande</div>
				<div>{{booking.customer_comment}}</div>
			</div>
			{{/if}}
		</div>
	</div>

	{{#if booking.payment_method}}
	<div class="section">
		<h3>Betalningsinformation</h3>
		<p>Betalningsmetod: {{#if (eq booking.payment_method "invoice")}}Faktura{{else}}Kortbetalning{{/if}}</p>
	</div>
	{{/if}}
</body>
</html>
`;

// lägg till denna mall efter bookingTemplate
const invoiceRequestTemplate = `
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<style>
		body {
			font-family: Arial, sans-serif;
			max-width: 800px;
			margin: 0 auto;
			padding: 20px;
		}
		.section {
			margin-bottom: 20px;
			padding: 15px;
			background-color: #f5f5f5;
			border-radius: 5px;
		}
		.section-title {
			font-size: 18px;
			font-weight: bold;
			margin-bottom: 10px;
		}
	</style>
</head>
<body>
	<h1>Ny fakturaförfrågan</h1>
	
	<div class="section">
		<div class="section-title">Bokningsinformation</div>
		<p><strong>Upplevelse:</strong> {{booking.experience}}</p>
		<p><strong>Startplats:</strong> {{booking.startLocation}}</p>
		<p><strong>Datum:</strong> {{booking.start_date}}{{#if booking.end_date}} - {{booking.end_date}}{{/if}}</p>
		<p><strong>Tid:</strong> {{booking.start_time}} - {{booking.end_time}}</p>
		<p><strong>Antal vuxna:</strong> {{booking.number_of_adults}}</p>
		{{#if booking.number_of_children}}
		<p><strong>Antal barn:</strong> {{booking.number_of_children}}</p>
		{{/if}}
		<p><strong>Totalt belopp:</strong> {{booking.amount_total}} kr</p>
	</div>

	<div class="section">
		<div class="section-title">Fakturainformation</div>
		<p><strong>Fakturatyp:</strong> {{invoice.invoiceType}}</p>
		<p><strong>Organisation:</strong> {{invoice.organization}}</p>
		<p><strong>GLN/PEPPOL-ID:</strong> {{invoice.glnPeppolId}}</p>
		<p><strong>Märkning:</strong> {{invoice.marking}}</p>
		<p><strong>Adress:</strong> {{invoice.address}}</p>
		<p><strong>Postnummer:</strong> {{invoice.postalCode}}</p>
		<p><strong>Ort:</strong> {{invoice.city}}</p>
	</div>

	<div class="section">
		<div class="section-title">Kontaktinformation</div>
		<p><strong>Namn:</strong> {{booking.booking_name}} {{booking.booking_lastname}}</p>
		<p><strong>E-post:</strong> {{booking.customer_email}}</p>
		<p><strong>Telefon:</strong> {{booking.customer_phone}}</p>
		{{#if booking.customer_comment}}
		<p><strong>Kommentar:</strong> {{booking.customer_comment}}</p>
		{{/if}}
	</div>
</body>
</html>
`;

// lägg till denna nya mall efter invoiceRequestTemplate
const invoiceBookingTemplate = `
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<style>
		body {
			font-family: Arial, sans-serif;
			max-width: 800px;
			margin: 0 auto;
			padding: 20px;
		}
		.logo {
			text-align: center;
			padding: 20px;
			background-color: #000000;
		}
		.logo img {
			height: 80px;
		}
		.header {
			text-align: center;
			margin: 20px 0;
		}
		.booking-details {
			background-color: #f5f5f5;
			padding: 20px;
			border-radius: 5px;
			margin: 20px 0;
		}
		.important-notice {
			background-color: #fff3cd;
			border: 1px solid #ffeeba;
			color: #856404;
			padding: 15px;
			border-radius: 5px;
			margin: 20px 0;
		}
	</style>
</head>
<body>
	<div class="header">
		<h1>Bokningsbekräftelse</h1>
		<p>Tack för din bokning hos Stisses!</p>
	</div>

	<div class="invoice-info">
		<h2>Fakturainformation</h2>
		{{#if invoice}}
			{{#if (eq invoice.invoiceType 'pdf')}}
			<div class="invoice-details">
				<p><strong>Fakturatyp:</strong> PDF-faktura</p>
				<p><strong>E-postadress för faktura:</strong> {{invoice.invoiceEmail}}</p>
				<p><strong>Organisation:</strong> {{invoice.organization}}</p>
				<p><strong>Adress:</strong> {{invoice.address}}</p>
				<p><strong>Postnummer:</strong> {{invoice.postalCode}}</p>
			</div>
			{{else}}
			<div class="invoice-details">
				<p><strong>Fakturatyp:</strong> Elektronisk faktura</p>
				<p><strong>GLN/PEPPOL-ID:</strong> {{invoice.glnPeppolId}}</p>
				<p><strong>Märkning:</strong> {{invoice.marking}}</p>
				<p><strong>Organisation:</strong> {{invoice.organization}}</p>
				<p><strong>Adress:</strong> {{invoice.address}}</p>
				<p><strong>Postnummer:</strong> {{invoice.postalCode}}</p>
				<p><strong>Ort:</strong> {{invoice.city}}</p>
			</div>
			{{/if}}
		{{/if}}
	</div>

	<div class="important-notice">
		<strong>Viktig information:</strong>
		<p>Din bokning är mottagen och vi kommer att skicka en faktura till dig inom kort. 
		Bokningen är preliminär tills fakturan är betald.</p>
	</div>

	<div class="booking-details">
		<h2>Din bokningsinformation</h2>
		<p><strong>Bokningsnummer:</strong> #{{booking.id}}</p>
		<p><strong>Upplevelse:</strong> {{booking.experience}}</p>
		<p><strong>Startplats:</strong> {{booking.startLocation}}</p>
		<p><strong>Datum:</strong> {{formatDateTime booking.start_date booking.start_time}}</p>
		{{#if booking.end_date}}
		<p><strong>Slutdatum:</strong> {{formatDateTime booking.end_date booking.end_time}}</p>
		{{/if}}
		<p><strong>Antal vuxna:</strong> {{booking.number_of_adults}}</p>
		<p><strong>Antal barn:</strong> {{booking.number_of_children}}</p>

		{{#if booking.optional_products.length}}
		<h3>Tillvalsprodukter</h3>
		<table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
			<tr style="border-bottom: 1px solid #ddd;">
				<th style="text-align: left; padding: 5px;">Produkt</th>
				<th style="text-align: right; padding: 5px;">Antal</th>
				<th style="text-align: right; padding: 5px;">Totalt</th>
			</tr>
			{{#each booking.optional_products}}
			<tr style="border-bottom: 1px solid #eee;">
				<td style="padding: 5px;">{{name}}</td>
				<td style="text-align: right; padding: 5px;">{{quantity}}</td>
				<td style="text-align: right; padding: 5px;">{{formatPrice total_price}} kr</td>
			</tr>
			{{/each}}
		</table>
		{{/if}}

		<p><strong>Totalt belopp att fakturera:</strong> {{booking.amount_total}} kr</p>
	</div>

	<div class="contact-details">
		<h2>Dina uppgifter</h2>
		<p><strong>Namn:</strong> {{booking.booking_name}} {{booking.booking_lastname}}</p>
		<p><strong>E-post:</strong> {{booking.customer_email}}</p>
		<p><strong>Telefon:</strong> {{booking.customer_phone}}</p>
		{{#if booking.customer_comment}}
		<p><strong>Meddelande:</strong> {{booking.customer_comment}}</p>
		{{/if}}
	</div>

	<div class="footer">
		<p>Om du har några frågor, kontakta oss gärna på:</p>
		<p>E-post: info@stisses.se</p>
		<p>Telefon: 0730-540 540</p>
	</div>
</body>
</html>
`;

async function generatePDF(booking, template = bookingTemplate) {
	// registrera handlebars helpers
	Handlebars.registerHelper('formatDateTime', formatDateTime);
	Handlebars.registerHelper('formatPrice', formatPrice);
	Handlebars.registerHelper('formatDate', formatDate);
	Handlebars.registerHelper('gt', function (a, b) {
		return a > b;
	});

	const compiledTemplate = Handlebars.compile(template);
	const html = compiledTemplate({ booking });

	const options = {
		format: 'A4',
		margin: {
			top: '20px',
			right: '20px',
			bottom: '20px',
			left: '20px'
		},
		printBackground: true
	};

	try {
		const buffer = await html_to_pdf.generatePdf({ content: html }, options);
		return buffer;
	} catch (error) {
		console.error('Fel vid generering av PDF:', error);
		throw error;
	}
}

// Definiera sendEmail funktionen
async function sendEmail({ to, subject, html, type = 'booking' }) {
	try {
		console.log('Attempting to send email:', {
			to,
			subject,
			type,
			fromEmail: EMAIL_CONFIG.FROM.email
		});

		const msg = {
			to: type === 'invoice' ? process.env.INVOICE_EMAIL : to,
			from: EMAIL_CONFIG.FROM,
			subject,
			html
		};

		// Lägg till verifiering innan sändning
		console.log('Verifierar e-postinställningar:', {
			toAddress: msg.to,
			fromAddress: msg.from.email,
			apiKeyLength: apiKey.length,
			subject: msg.subject
		});

		const response = await sgMail.send(msg);
		console.log('SendGrid response:', response[0].statusCode);
		return response;
	} catch (error) {
		// Förbättrad felhantering
		const errorDetails = {
			code: error.code,
			message: error.message,
			response: error.response?.body,
			stack: error.stack
		};
		console.error('Detaljerat SendGrid-fel:', JSON.stringify(errorDetails, null, 2));
		throw error;
	}
}

// uppdatera sendBookingConfirmation funktionen
export async function sendBookingConfirmation(bookingData, isInvoiceBooking = false) {
	try {
		// detaljerad loggning av inkommande data
		console.log('=== BOKNINGSBEKRÄFTELSE STARTAR ===');
		console.log('Inkommande bokningsdata:', JSON.stringify(bookingData, null, 2));

		// validera nödvändiga fält
		const requiredFields = [
			'id',
			'experience',
			'start_date',
			'end_date',
			'start_time',
			'end_time',
			'number_of_adults',
			'customer_email',
			'booking_name',
			'booking_lastname'
		];

		const missingFields = requiredFields.filter((field) => !bookingData[field]);
		if (missingFields.length > 0) {
			console.warn('saknade obligatoriska fält i bokningsdata:', missingFields);
		}

		// standardisera startlocation-fälten
		let startLocationId = bookingData.startlocation;
		let startLocationName = bookingData.startLocationName;

		// hämta startplatsinfo om id finns men namn saknas
		if (startLocationId && !startLocationName) {
			try {
				const {
					rows: [location]
				} = await query(
					'SELECT sl.price, sl.location as name FROM start_locations sl WHERE id = $1',
					[startLocationId]
				);

				if (location) {
					startLocationName = location.name;
					bookingData.adultPrice = bookingData.adultPrice || location.price || 0;
				}
			} catch (locError) {
				console.error('fel vid hämtning av startplats:', locError);
			}
		}

		// skapa en berikad version av bokningsdatan
		const enrichedBookingData = {
			...bookingData,
			startLocationName: startLocationName || 'Ej angiven',
			startlocation: startLocationId, // behåll originalfältet
			adultPrice: bookingData.adultPrice || 0,
			date_time_created: bookingData.date_time_created || new Date().toISOString()
		};

		console.log('Berikad bokningsdata:', JSON.stringify(enrichedBookingData, null, 2));

		// kompilera mallen med handlebars
		const template = Handlebars.compile(bookingConfirmationTemplate);
		const html = template({
			booking: enrichedBookingData
		});

		// logga html för felsökning
		console.log(
			'Genererad HTML för bokningsbekräftelse (första 500 tecken):',
			html.substring(0, 500) + '...'
		);

		// skicka e-post
		await sendEmail({
			to: enrichedBookingData.customer_email,
			subject: 'Bokningsbekräftelse - Stisses',
			html,
			type: 'booking'
		});

		console.log('✉️ Bokningsbekräftelse skickad till:', enrichedBookingData.customer_email);
		console.log('=== BOKNINGSBEKRÄFTELSE SLUTFÖRD ===');

		console.log('Booking data för e-post:', {
			rawData: bookingData,
			formattedData: enrichedBookingData,
			addons: bookingData.addons_info,
			optionalProducts: bookingData.optional_products
		});
	} catch (error) {
		console.error('Detaljerat fel i sendBookingConfirmation:', error);
		console.error('Felstack:', error.stack);
		throw error;
	}
}

// hjälpfunktion för att generera e-postinnehållet
async function generateBookingConfirmationEmail(bookingData) {
	// registrera handlebars helpers
	Handlebars.registerHelper('multiply', function (a, b) {
		return (a || 0) * (b || 0);
	});

	Handlebars.registerHelper('eq', function (a, b) {
		return a === b;
	});

	const template = Handlebars.compile(bookingTemplate);
	return template({ booking: bookingData });
}

// Uppdatera sendInvoiceRequest funktionen
export async function sendInvoiceRequest(bookingData, invoiceData) {
	try {
		console.log('Förbereder fakturabegäran med data:', { bookingData, invoiceData });

		// kompilera handlebars template
		const template = Handlebars.compile(invoiceRequestTemplate);

		// formatera datum och tid
		const formattedStartDate = new Date(bookingData.start_date).toLocaleDateString('sv-SE');
		const formattedEndDate = new Date(bookingData.end_date).toLocaleDateString('sv-SE');

		// förbered data för templaten
		const templateData = {
			booking: {
				...bookingData,
				// lägg till saknad information
				experience: bookingData.experience,
				start_date: bookingData.start_date,
				end_date: bookingData.end_date,
				start_time: bookingData.start_time,
				end_time: bookingData.end_time,
				number_of_adults: bookingData.number_of_adults,
				number_of_children: bookingData.number_of_children,
				amount_total: bookingData.amount_total,
				// addon information
				addons_info: bookingData.addons_info || [],
				// optional products
				optional_products: bookingData.optional_products || [],
				// startplats information
				startlocation_name: bookingData.startlocation_name,
				adult_price: bookingData.adult_price
			},
			// lägg till priser och summering
			summary: {
				subtotal: Math.round(bookingData.amount_total / 1.25),
				vat: Math.round(bookingData.amount_total - bookingData.amount_total / 1.25),
				total: bookingData.amount_total
			}
		};

		console.log('Renderar e-postmall med data:', templateData);

		// rendera html innehåll
		const htmlContent = template(templateData);

		// skicka e-post
		await sendEmail({
			to: process.env.INVOICE_EMAIL,
			subject: `Ny fakturabegäran - ${bookingData.booking_name} ${bookingData.booking_lastname}`,
			html: htmlContent
		});

		console.log('Fakturabegäran skickad framgångsrikt');
	} catch (error) {
		console.error('Fel vid sändning av fakturabegäran:', error);
		throw error;
	}
}

// Exportera både sendEmail och sendInvoiceRequest
export { sendEmail };
export { sendInvoiceRequest };
