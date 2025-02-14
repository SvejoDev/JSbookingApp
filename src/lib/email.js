import sgMail from '@sendgrid/mail';
import dotenv from 'dotenv';
import puppeteer from 'puppeteer-core';
import Handlebars from 'handlebars';
import { Buffer } from 'buffer';
import html_to_pdf from 'html-pdf-node';

dotenv.config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// lägg till felhantering för saknad API-nyckel
if (!process.env.SENDGRID_API_KEY) {
	console.error('Varning: SENDGRID_API_KEY saknas i miljövariablerna');
}

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

async function generatePDF(booking) {
	// registrera handlebars helpers
	Handlebars.registerHelper('formatDateTime', formatDateTime);
	Handlebars.registerHelper('formatPrice', formatPrice);
	Handlebars.registerHelper('formatDate', (date) => new Date(date).toLocaleDateString('sv-SE'));
	Handlebars.registerHelper('gt', function (a, b) {
		return a > b;
	});

	const template = Handlebars.compile(bookingTemplate);
	const html = template({ booking });

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

export async function sendBookingConfirmation(booking) {
	try {
		const pdf = await generatePDF(booking);

		await sgMail.send({
			to: booking.customer_email,
			from: 'info@stisses.se',
			subject: `Bokningsbekräftelse - ${booking.experience}`,
			html: Handlebars.compile(bookingTemplate)({ booking }),
			attachments: [
				{
					content: pdf.toString('base64'),
					filename: `bokningsbekraftelse-${booking.id}.pdf`,
					type: 'application/pdf',
					disposition: 'attachment'
				}
			]
		});

		console.log('✉️ Bokningsbekräftelse skickad till:', booking.customer_email);
	} catch (error) {
		console.error('❌ Fel vid skickande av bokningsbekräftelse:', error);
	}
}
