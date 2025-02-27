import sgMail from '@sendgrid/mail';
import { logger } from '$lib/utils/logger';
import dotenv from 'dotenv';
import Handlebars from 'handlebars';
import html_to_pdf from 'html-pdf-node';
import { query } from '$lib/db.js';

import { bookingConfirmationTemplate } from './templates/bookingTemplates.js';
import { pdfInvoiceTemplate, electronicInvoiceTemplate } from './templates/invoiceTemplates.js';
import { formatDateTime, formatPrice, formatDate } from './templates/emailTemplates.js';

dotenv.config();

// Registrera alla Handlebars helpers först
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
			logger.error('Fel vid datumformatering:', error);
			return '';
		}
	},

	formatDate: function (date) {
		if (!date) return '';
		try {
			const dateObj = new Date(date);
			return dateObj.toLocaleDateString('sv-SE', {
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			});
		} catch (error) {
			logger.error('Fel vid datumformatering:', error);
			return '';
		}
	},

	// Använd den förbättrade formatPrice-funktionen från emailTemplates.js
	formatPrice: function (price) {
		return formatPrice(price);
	},

	// Lägg till en hjälpfunktion för att formatera betalningsmetod
	formatPaymentMethod: function (method) {
		if (!method) return 'Ej angiven';

		switch (method.toLowerCase()) {
			case 'card':
			case 'stripe':
				return 'Kortbetalning';
			case 'invoice':
				return 'Faktura';
			default:
				return method;
		}
	},

	// Uppdatera eq helper
	eq: function (v1, v2, options) {
		if (options && typeof options.fn === 'function') {
			// Block helper användning (för {{#eq}}...{{/eq}})
			return v1 === v2 ? options.fn(this) : options.inverse(this);
		}
		// Vanlig helper användning (för (eq a b))
		return v1 === v2;
	},

	// Lägg till subtract helper som saknas
	subtract: function (a, b) {
		return (a || 0) - (b || 0);
	},

	// Lägg till multiply helper som saknas
	multiply: function (a, b) {
		return (a || 0) * (b || 0);
	},

	// Lägg till ceil helper som saknas
	ceil: function (number) {
		return Math.ceil(number || 0);
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

// Lägg till dessa hjälpfunktioner för Handlebars
const handlebarsHelpers = {
	formatDate: (date) => {
		if (!date) return '';
		const d = new Date(date);
		return d.toLocaleDateString('sv-SE');
	},
	formatPrice: (price) => {
		if (price === undefined || price === null) return '0';
		return Math.round(price)
			.toString()
			.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
	},
	default: (value, defaultValue) => {
		return value !== undefined && value !== null ? value : defaultValue;
	}
};

// registrera handlebars helpers
Handlebars.registerHelper('multiply', function (a, b) {
	return parseFloat(a) * parseFloat(b);
});

Handlebars.registerHelper('formatPrice', function (price) {
	if (price === undefined || price === null) return '0';
	return Math.round(price)
		.toString()
		.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
});

Handlebars.registerHelper('subtract', function (a, b) {
	return a - b;
});

Handlebars.registerHelper('default', function (value, defaultValue) {
	return value !== undefined && value !== null ? value : defaultValue;
});

// Lägg till ceil helper
Handlebars.registerHelper('ceil', function (number) {
	return Math.ceil(number);
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

// Lägg till en ny funktion som skapar template-strängen med rätt kontext
function createInvoiceRequestTemplate(bookingData) {
	const isInvoiceBooking = bookingData.payment_method === 'invoice';

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
				max-width: 800px;
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
			.section-title {
				font-size: 18px;
				font-weight: bold;
				margin-bottom: 10px;
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
			<h1>Ny fakturaförfrågan</h1>
			<p>Bokningsnummer: #{{booking.id}}</p>
			<p>Skapades: {{formatDateTime booking.date_time_created}}</p>
		</div>
		
		<div class="section">
			<div class="section-title">Bokningsinformation</div>
			<div class="details-grid">
				<p><strong>Upplevelse:</strong> {{booking.experience}}</p>
				<p><strong>Startplats:</strong> {{booking.startLocationName}}</p>
				<p><strong>Datum:</strong> {{formatDate booking.start_date}} kl. {{booking.start_time}}</p>
				<p><strong>Slutdatum:</strong> {{formatDate booking.end_date}} kl. {{booking.end_time}}</p>
				<p><strong>Antal vuxna:</strong> {{booking.number_of_adults}}</p>
				{{#if booking.number_of_children}}
				<p><strong>Antal barn:</strong> {{booking.number_of_children}}</p>
				{{/if}}
			</div>
		</div>

		{{#if booking.addons}}
		<div class="section">
			<div class="section-title">Bokade produkter</div>
			<ul>
				{{#each booking.addons}}
				{{#if amount}}
				<li>{{name}}: {{amount}} st</li>
				{{/if}}
				{{/each}}
			</ul>
		</div>
		{{/if}}

		{{#if booking.optional_products}}
		<div class="section">
			<div class="section-title">Tillvalsprodukter</div>
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
						<td>{{formatPrice price}} kr</td>
						<td>{{formatPrice total_price}} kr</td>
					</tr>
					{{/each}}
				</tbody>
			</table>
		</div>
		{{/if}}

		<div class="price-details">
			<h3>Prisdetaljer</h3>
			
			<!-- Delsumma -->
			<div class="price-row">
				<span>Delsumma (exkl. moms):</span>
				<span>${formatPrice(
					isInvoiceBooking
						? bookingData.amount_total_exc_vat
						: bookingData.amount_total_exc_vat - bookingData.amount_total_exc_vat * 0.2
				)} kr</span>
			</div>
			
			<!-- Moms -->
			<div class="price-row">
				<span>Moms (25%):</span>
				<span>${formatPrice(
					Math.ceil(
						isInvoiceBooking
							? Math.ceil(bookingData.amount_total_inc_vat * 1.25) * 0.2
							: Math.ceil(bookingData.amount_total_inc_vat) * 0.2
					)
				)} kr</span>
			</div>
			
			<!-- Totalt -->
			<div class="price-row price-total">
				<span>Totalt att betala:</span>
				<span>${formatPrice(
					isInvoiceBooking
						? Math.ceil(bookingData.amount_total_inc_vat * 1.25)
						: Math.ceil(bookingData.amount_total_inc_vat)
				)} kr</span>
			</div>
		</div>

		<div class="section">
			<div class="section-title">Fakturainformation</div>
			<div class="details-grid">
				<p><strong>Fakturatyp:</strong> {{invoice.invoiceType}}</p>
				<p><strong>Organisation:</strong> {{invoice.organization}}</p>
				{{#if invoice.invoiceEmail}}
				<p><strong>E-postadress för faktura:</strong> {{invoice.invoiceEmail}}</p>
				{{/if}}
				{{#if invoice.glnPeppolId}}
				<p><strong>GLN/PEPPOL-ID:</strong> {{invoice.glnPeppolId}}</p>
				{{/if}}
				{{#if invoice.marking}}
				<p><strong>Märkning:</strong> {{invoice.marking}}</p>
				{{/if}}
				<p><strong>Adress:</strong> {{invoice.address}}</p>
				<p><strong>Postnummer:</strong> {{invoice.postalCode}}</p>
				<p><strong>Ort:</strong> {{invoice.city}}</p>
			</div>
		</div>

		<div class="section">
			<div class="section-title">Kontaktinformation</div>
			<div class="details-grid">
				<p><strong>Namn:</strong> {{booking.booking_name}} {{booking.booking_lastname}}</p>
				<p><strong>E-post:</strong> {{booking.customer_email}}</p>
				<p><strong>Telefon:</strong> {{booking.customer_phone}}</p>
				{{#if booking.customer_comment}}
				<p><strong>Kommentar:</strong> {{booking.customer_comment}}</p>
				{{/if}}
			</div>
		</div>
	</body>
	</html>
	`;
}

// Uppdatera sendInvoiceRequest funktionen
export async function sendInvoiceRequest(bookingData, invoiceData) {
	try {
		logger.info('Förbereder fakturabegäran med data:', { bookingData, invoiceData });

		// Skapa template med rätt kontext
		const template = Handlebars.compile(createInvoiceRequestTemplate(bookingData));

		// säkerställ att vi har startLocationName
		let startLocationName = bookingData.startLocationName || '';
		if (!startLocationName && bookingData.startlocation) {
			try {
				const {
					rows: [location]
				} = await query('SELECT location FROM start_locations WHERE id = $1', [
					bookingData.startlocation
				]);
				if (location) {
					startLocationName = location.location;
				}
			} catch (error) {
				logger.error('Fel vid hämtning av startplats:', error);
			}
		}

		// Konvertera addons-objekt till array om det behövs
		let addonsArray = [];
		if (bookingData.addons) {
			if (Array.isArray(bookingData.addons)) {
				// Om det redan är en array, använd den
				addonsArray = bookingData.addons;
			} else if (typeof bookingData.addons === 'object') {
				// Konvertera från objekt till array
				addonsArray = Object.entries(bookingData.addons)
					.filter(([key, value]) => value > 0 && key.startsWith('amount_'))
					.map(([key, value]) => {
						// Extrahera namnet från nyckeln (t.ex. amount_canoes -> canoes)
						const name = key.replace('amount_', '');
						return {
							name: name.charAt(0).toUpperCase() + name.slice(1), // Första bokstaven stor
							amount: value
						};
					});
			}
		}

		// beräkna priser om de saknas
		const subtotal = bookingData.amount_total_exc_vat;
		const total = Math.ceil(bookingData.amount_total_inc_vat * 1.25); // Alltid faktura här
		const vat = Math.ceil(total * 0.2);

		// förbered data för templaten
		const templateData = {
			booking: {
				...bookingData,
				startLocationName: startLocationName || bookingData.startLocation || 'Ej angiven',
				date_time_created: bookingData.date_time_created || new Date().toISOString(),
				subtotal: subtotal,
				vat: vat,
				total: total,
				// använd den konverterade addons-arrayen
				addons: addonsArray,
				// säkerställ att optional_products är en array
				optional_products: Array.isArray(bookingData.optional_products)
					? bookingData.optional_products
					: []
			},
			invoice: invoiceData
		};

		logger.info('Renderar e-postmall med data:', JSON.stringify(templateData, null, 2));
		logger.info('Addons efter konvertering:', JSON.stringify(templateData.booking.addons, null, 2));

		// rendera html innehåll
		const htmlContent = template(templateData);

		// skicka e-post
		await sendEmail({
			to: process.env.INVOICE_EMAIL || EMAIL_CONFIG.INVOICE_RECIPIENTS,
			subject: `Ny fakturabegäran - ${bookingData.booking_name} ${bookingData.booking_lastname}`,
			html: htmlContent,
			type: 'invoice'
		});

		logger.info('Fakturabegäran skickad framgångsrikt');
	} catch (error) {
		logger.error('Fel vid sändning av fakturabegäran:', error);
		throw error;
	}
}

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
		logger.error('Fel vid generering av PDF:', error);
		throw error;
	}
}

// Definiera sendEmail funktionen
async function sendEmail({ to, subject, html, type = 'booking' }) {
	try {
		logger.info('Attempting to send email:', {
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
		logger.info('Verifierar e-postinställningar:', {
			toAddress: msg.to,
			fromAddress: msg.from.email,
			apiKeyLength: apiKey.length,
			subject: msg.subject
		});

		const response = await sgMail.send(msg);
		logger.info('SendGrid response:', response[0].statusCode);
		return response;
	} catch (error) {
		// Förbättrad felhantering
		const errorDetails = {
			code: error.code,
			message: error.message,
			response: error.response?.body,
			stack: error.stack
		};
		logger.error('Detaljerat SendGrid-fel:', JSON.stringify(errorDetails, null, 2));
		throw error;
	}
}

// Uppdatera sendBookingConfirmation funktionen
export async function sendBookingConfirmation(bookingData, isInvoiceBooking = false) {
	try {
		// detaljerad loggning av inkommande data
		logger.info('=== BOKNINGSBEKRÄFTELSE STARTAR ===');
		logger.info('Inkommande bokningsdata:', JSON.stringify(bookingData, null, 2));

		// Hämta den senaste bokningsdatan från databasen för att säkerställa korrekt belopp
		if (bookingData.id) {
			try {
				const {
					rows: [latestBooking]
				} = await query('SELECT amount_total_inc_vat FROM bookings WHERE id = $1', [
					bookingData.id
				]);

				if (latestBooking && latestBooking.amount_total_inc_vat) {
					logger.info('Uppdaterar amount_total från databasen:', {
						original: bookingData.amount_total,
						fromDb: latestBooking.amount_total_inc_vat
					});
					// Använd amount_total_inc_vat istället för amount_total
					bookingData.amount_total = latestBooking.amount_total_inc_vat;
				}
			} catch (dbError) {
				logger.error('Fel vid hämtning av senaste bokningsdata:', dbError);
			}
		}

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

		// kontrollera att alla nödvändiga fält finns
		for (const field of requiredFields) {
			if (bookingData[field] === undefined) {
				logger.warn(`Varning: Fältet ${field} saknas i bokningsdata`);
			}
		}

		// hämta startplatsnamn om det finns ett startlocation-id
		let startLocationName = '';
		let startLocationId = bookingData.startlocation || bookingData.selectedStartLocation;

		if (startLocationId) {
			try {
				const {
					rows: [location]
				} = await query('SELECT location FROM start_locations WHERE id = $1', [startLocationId]);
				if (location) {
					startLocationName = location.location;
				}
			} catch (error) {
				logger.error('Fel vid hämtning av startplats:', error);
			}
		}

		// Konvertera addons-objekt till array om det behövs
		let addonsArray = [];
		if (bookingData.addons) {
			if (Array.isArray(bookingData.addons)) {
				// Om det redan är en array, använd den
				addonsArray = bookingData.addons;
			} else if (typeof bookingData.addons === 'object') {
				// Konvertera från objekt till array
				addonsArray = Object.entries(bookingData.addons)
					.filter(([key, value]) => value > 0 && key.startsWith('amount_'))
					.map(([key, value]) => {
						// Extrahera namnet från nyckeln (t.ex. amount_canoes -> canoes)
						const name = key.replace('amount_', '');
						return {
							name: name.charAt(0).toUpperCase() + name.slice(1), // Första bokstaven stor
							amount: value
						};
					});
			}
		}

		// Hämta fakturauppgifter om det är en fakturabetald bokning
		let invoiceDetails = bookingData.invoice_details || {};

		// Om vi inte har invoice_details men har ett bookingId, försök hämta från databasen
		if (
			bookingData.payment_method === 'invoice' &&
			bookingData.id &&
			Object.keys(invoiceDetails).length === 0
		) {
			try {
				const { rows } = await query(
					`SELECT 
						invoice_type, invoice_email, gln_peppol_id, marking, 
						organization, address, postal_code, city 
					FROM invoice_details 
					WHERE booking_id = $1`,
					[bookingData.id]
				);

				if (rows.length > 0) {
					invoiceDetails = rows[0];
					logger.info('Hämtade fakturauppgifter från databasen:', invoiceDetails);
				}
			} catch (error) {
				logger.error('Fel vid hämtning av fakturauppgifter:', error);
			}
		}

		// skapa en berikad version av bokningsdatan
		const enrichedBookingData = {
			...bookingData,
			startLocationName: startLocationName || 'Ej angiven',
			startlocation: startLocationId,
			adultPrice: bookingData.adultPrice || bookingData.adult_price || 0,
			date_time_created: bookingData.date_time_created || new Date().toISOString(),

			// Kontrollera betalningsmetod först
			payment_method: bookingData.payment_method || 'card'
		};

		// Definiera isInvoiceBooking baserat på payment_method
		const isInvoiceBooking = enrichedBookingData.payment_method === 'invoice';

		// Beräkna priserna exakt som i +page.server.js
		if (isInvoiceBooking) {
			// beräkningar för fakturabetalning
			enrichedBookingData.subtotal = bookingData.amount_total_exc_vat;
			enrichedBookingData.total = Math.ceil(bookingData.amount_total_inc_vat * 1.25);
			enrichedBookingData.vat = Math.ceil(enrichedBookingData.total * 0.2);
		} else {
			// beräkningar för kortbetalning/direktbetalning
			enrichedBookingData.subtotal =
				bookingData.amount_total_exc_vat - bookingData.amount_total_exc_vat * 0.2;
			enrichedBookingData.total = Math.ceil(bookingData.amount_total_inc_vat);
			enrichedBookingData.vat = Math.ceil(enrichedBookingData.total * 0.2);
		}

		// Beräkna totalpris för tillvalsprodukter om det finns
		enrichedBookingData.optional_products_total = Array.isArray(bookingData.optional_products)
			? bookingData.optional_products.reduce(
					(sum, product) => sum + parseInt(product.total_price || 0),
					0
				)
			: 0;

		// Använd den konverterade addons-arrayen
		enrichedBookingData.addons = addonsArray;

		// Lägg till fakturauppgifter
		enrichedBookingData.invoice_details = invoiceDetails;

		// Lägg till loggning för att se exakta värden
		logger.info('Prisberäkning i e-post:', {
			amount_total: bookingData.amount_total,
			amount_total_exc_vat: bookingData.amount_total_exc_vat,
			amount_total_inc_vat: bookingData.amount_total_inc_vat,
			optional_products_total: enrichedBookingData.optional_products_total,
			subtotal: enrichedBookingData.subtotal,
			vat: enrichedBookingData.vat,
			total: enrichedBookingData.total
		});

		logger.info('Berikad bokningsdata:', JSON.stringify(enrichedBookingData, null, 2));
		logger.info('Addons efter konvertering:', JSON.stringify(enrichedBookingData.addons, null, 2));
		logger.info('Invoice details:', JSON.stringify(enrichedBookingData.invoice_details, null, 2));

		// Lägg till före template-kompilering
		logger.info('Payment Method Type:', {
			paymentMethod: bookingData.payment_method,
			type: typeof bookingData.payment_method
		});

		logger.info('Formatted Booking Data:', {
			payment_method: enrichedBookingData.payment_method,
			type: typeof enrichedBookingData.payment_method,
			fullData: enrichedBookingData
		});

		// Registrera Handlebars-hjälpfunktioner
		Handlebars.registerHelper('eq', function (a, b, options) {
			logger.info('EQ Helper Called:', {
				value1: a,
				value2: b,
				value1Type: typeof a,
				value2Type: typeof b,
				hasInverse: !!options.inverse
			});
			return a === b ? options.fn(this) : options.inverse(this);
		});

		Handlebars.registerHelper('formatPaymentMethod', function (method) {
			if (method === 'invoice') return 'Faktura';
			if (method === 'card' || method === 'stripe') return 'Kortbetalning';
			return method || 'Okänd';
		});

		// kompilera mallen med handlebars
		const template = Handlebars.compile(bookingConfirmationTemplate);
		const html = template({
			booking: enrichedBookingData
		});

		// logga hela html för felsökning
		logger.info('HELA HTML FÖR BOKNINGSBEKRÄFTELSE:');
		logger.info(html);

		// skicka e-post
		await sendEmail({
			to: enrichedBookingData.customer_email,
			subject: 'Bokningsbekräftelse - Stisses',
			html,
			type: 'booking'
		});

		logger.info('✉️ Bokningsbekräftelse skickad till:', enrichedBookingData.customer_email);
		logger.info('=== BOKNINGSBEKRÄFTELSE SLUTFÖRD ===');

		logger.info('Booking data för e-post:', {
			rawData: bookingData,
			formattedData: enrichedBookingData,
			addons: enrichedBookingData.addons,
			optionalProducts: bookingData.optional_products,
			invoiceDetails: enrichedBookingData.invoice_details
		});
	} catch (error) {
		logger.error('Detaljerat fel i sendBookingConfirmation:', error);
		logger.error('Felstack:', error.stack);
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

// Samla alla exporter i ett uttryck
export { sendEmail, generatePDF };
