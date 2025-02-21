import sgMail from '@sendgrid/mail';
import dotenv from 'dotenv';
import puppeteer from 'puppeteer-core';
import Handlebars from 'handlebars';
import { Buffer } from 'buffer';
import html_to_pdf from 'html-pdf-node';

import { bookingConfirmationTemplate } from './templates/bookingTemplates.js';
import { pdfInvoiceTemplate, electronicInvoiceTemplate } from './templates/invoiceTemplates.js';
import { formatDateTime, formatPrice } from './templates/emailTemplates.js';

dotenv.config();

// Konfigurera Handlebars helpers
Handlebars.registerHelper('formatDateTime', formatDateTime);
Handlebars.registerHelper('formatPrice', formatPrice);

// e-post konfiguration
const EMAIL_CONFIG = {
	FROM: {
		email: 'info@stisses.se',
		name: 'Stisses'
	},
	INVOICE_RECIPIENTS: ['johan.svensson@svejo.se', 'info@stisses.se']
};

// konfigurera sendgrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// formatera datum och tid för e-post
function formatDateTime(date, time) {
	if (!date || !time) return 'Ej angivet';
	try {
		const dateObj = new Date(date);
		const formattedDate = dateObj.toLocaleDateString('sv-SE', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
		const formattedTime = time.split(':').slice(0, 2).join(':');
		return `${formattedDate} kl. ${formattedTime}`;
	} catch (error) {
		console.error('Fel vid datumformatering:', error);
		return 'Ogiltigt datum/tid';
	}
}

// formatera pris med två decimaler
function formatPrice(price) {
	return typeof price === 'number' ? price.toFixed(2) : '0.00';
}

// html-mall för både e-post och pdf
const bookingTemplate = `
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
		.products-table {
			width: 100%;
			border-collapse: collapse;
			margin: 20px 0;
		}
		.products-table th, .products-table td {
			padding: 8px;
			text-align: left;
			border-bottom: 1px solid #ddd;
		}
		.products-table th {
			background-color: #f5f5f5;
		}
		.total-section {
			margin-top: 20px;
			border-top: 1px solid #ddd;
			padding-top: 20px;
		}
		.total-row {
			display: flex;
			justify-content: space-between;
			margin: 5px 0;
		}
		.bold {
			font-weight: bold;
		}
	</style>
</head>
<body>
	<div class="logo">
		<img src="https://stisses.se/Logga.svg" alt="Stisses" />
	</div>
	
	<div class="header">
		<h1>Bekräftelse & Kvitto</h1>
		<p>Tack för din bokning!</p>
	</div>

	<div class="booking-details">
		<h2>Din bokning #{{booking.id}}</h2>
		<p><strong>Skapades:</strong> {{formatDate booking.date_time_created}}</p>
		<p><strong>Kund:</strong> {{booking.booking_name}} {{booking.booking_lastname}}</p>
		{{#if booking.startLocation}}
			<p><strong>Startplats:</strong> {{booking.startLocation}}</p>
		{{/if}}
		{{#if booking.customer_comment}}
			<p><strong>Meddelande:</strong> {{booking.customer_comment}}</p>
		{{/if}}
		
		<p><strong>Start:</strong> {{formatDateTime booking.start_date booking.start_time}}</p>
		<p><strong>Slut:</strong> {{formatDateTime booking.end_date booking.end_time}}</p>
	</div>

	<table class="products-table">
		<thead>
			<tr>
				<th>Produkt</th>
				<th>Antal</th>
				<th>Á Pris exkl. moms</th>
				<th>Totalt exkl. moms</th>
			</tr>
		</thead>
		<tbody>
			<tr>
				<td>{{booking.experience}}</td>
				<td>1</td>
				<td>0 kr</td>
				<td>0 kr</td>
			</tr>
			
			{{#each booking.addons}}
				{{#if (gt amount 0)}}
					<tr>
						<td>{{name}}</td>
						<td>{{amount}}</td>
						<td>0 kr</td>
						<td>0 kr</td>
					</tr>
				{{/if}}
			{{/each}}
			
			<tr>
				<td>Antal vuxna</td>
				<td>{{booking.number_of_adults}}</td>
				<td>{{formatPrice booking.adultPriceExclVat}} kr</td>
				<td>{{formatPrice booking.totalAdultsExclVat}} kr</td>
			</tr>
			
			{{#if (gt booking.number_of_children 0)}}
				<tr>
					<td>Antal barn</td>
					<td>{{booking.number_of_children}}</td>
					<td>0 kr</td>
					<td>0 kr</td>
				</tr>
			{{/if}}
		</tbody>
	</table>

	<div class="total-section">
		<div class="total-row">
			<span>Totalt (exkl. moms)</span>
			<span>{{formatPrice booking.subtotal}} kr</span>
		</div>
		<div class="total-row">
			<span>Moms (25%)</span>
			<span>{{formatPrice booking.vat}} kr</span>
		</div>
		<div class="total-row bold">
			<span>Totalt pris</span>
			<span>{{formatPrice booking.total}} kr</span>
		</div>
	</div>
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
		<p><strong>Startdatum:</strong> {{formatDateTime booking.start_date booking.start_time}}</p>
		<p><strong>Slutdatum:</strong> {{formatDateTime booking.end_date booking.end_time}}</p>
		<p><strong>Antal vuxna:</strong> {{booking.number_of_adults}}</p>
		<p><strong>Antal barn:</strong> {{booking.number_of_children}}</p>
		<p><strong>Totalt pris:</strong> {{booking.amount_total}} kr</p>
	</div>

	<div class="section">
		<div class="section-title">Kontaktuppgifter</div>
		<p><strong>Namn:</strong> {{booking.booking_name}} {{booking.booking_lastname}}</p>
		<p><strong>E-post:</strong> {{booking.customer_email}}</p>
		<p><strong>Telefon:</strong> {{booking.customer_phone}}</p>
		{{#if booking.customer_comment}}
		<p><strong>Kommentar:</strong> {{booking.customer_comment}}</p>
		{{/if}}
	</div>

	<div class="section">
		<div class="section-title">Faktureringsinformation</div>
		<p><strong>Fakturatyp:</strong> {{invoice.invoiceType}}</p>
		{{#if invoice.invoiceEmail}}
		<p><strong>Faktura e-post:</strong> {{invoice.invoiceEmail}}</p>
		{{/if}}
		{{#if invoice.glnPeppolId}}
		<p><strong>GLN/PEPPOL-ID:</strong> {{invoice.glnPeppolId}}</p>
		{{/if}}
		{{#if invoice.marking}}
		<p><strong>Märkning:</strong> {{invoice.marking}}</p>
		{{/if}}
		<p><strong>Organisation:</strong> {{invoice.organization}}</p>
		<p><strong>Adress:</strong> {{invoice.address}}</p>
		<p><strong>Postnummer:</strong> {{invoice.postalCode}}</p>
		<p><strong>Ort:</strong> {{invoice.city}}</p>
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

// Lägg till Handlebars helper för att jämföra värden
Handlebars.registerHelper('eq', function (a, b) {
	return a === b;
});

async function generatePDF(booking, template = bookingTemplate) {
	// registrera handlebars helpers
	Handlebars.registerHelper('formatDateTime', formatDateTime);
	Handlebars.registerHelper('formatPrice', formatPrice);
	Handlebars.registerHelper('formatDate', (date) => new Date(date).toLocaleDateString('sv-SE'));
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

export async function sendBookingConfirmation(bookingData, isInvoiceBooking = false) {
	try {
		if (!bookingData.customer_email) {
			throw new Error('kundens e-postadress saknas');
		}

		// välj rätt mall baserat på bokningstyp
		const template = Handlebars.compile(
			isInvoiceBooking ? invoiceBookingTemplate : bookingTemplate
		);

		// kompilera template med all bokningsdata
		const html = template({
			booking: bookingData,
			invoice: isInvoiceBooking ? bookingData : null
		});

		await sendEmail({
			to: bookingData.customer_email,
			subject: 'Bokningsbekräftelse - Stisses',
			html,
			type: 'booking'
		});

		console.log('✉️ bokningsbekräftelse skickad till:', bookingData.customer_email);
	} catch (error) {
		console.error('fel vid skickande av bokningsbekräftelse:', error);
		throw error;
	}
}

// Lägg till dessa mallar i början av filen, efter imports
const electronicInvoiceTemplate = `
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

// uppdatera sendEmail funktionen för att hantera olika typer av e-post
async function sendEmail({ to, subject, html, attachments = [], type = 'booking' }) {
	try {
		// bestäm mottagare baserat på typ
		const recipients = type === 'invoice' ? EMAIL_CONFIG.INVOICE_RECIPIENTS : to;

		if (!recipients) {
			throw new Error('saknar mottagaradress');
		}

		const msg = {
			to: recipients,
			from: EMAIL_CONFIG.FROM,
			subject,
			html,
			attachments
		};

		// logga för debugging
		console.log('📧 försöker skicka e-post:', {
			type,
			to: msg.to,
			from: EMAIL_CONFIG.FROM.email,
			subject
		});

		await sgMail.send(msg);
		console.log('✉️ e-post skickad:', {
			type,
			to: msg.to
		});
	} catch (error) {
		console.error('❌ fel vid skickande av e-post:', {
			error: error.message,
			type,
			to,
			subject
		});
		throw error;
	}
}

// uppdatera sendInvoiceRequest funktionen
export async function sendInvoiceRequest(bookingData, invoiceData) {
	try {
		const template =
			invoiceData.invoiceType === 'pdf'
				? pdfInvoiceTemplate(bookingData, invoiceData)
				: electronicInvoiceTemplate(bookingData, invoiceData);

		await sendEmail({
			to: null, // vi behöver inte skicka 'to' för fakturor
			subject: `Fakturabegäran - ${bookingData.booking_name} ${bookingData.booking_lastname}`,
			html: template,
			type: 'invoice'
		});
	} catch (error) {
		console.error('Error in sendInvoiceRequest:', error);
		throw error;
	}
}

// Se till att exportera funktionen så den kan användas av andra moduler
export { sendEmail };
