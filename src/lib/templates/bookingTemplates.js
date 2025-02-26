import { formatDateTime, formatPrice } from './emailTemplates.js';

// flytta bookingTemplate hit från email.js
export const bookingConfirmationTemplate = `
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
        .details-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-bottom: 20px;
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
            <p><strong>Upplevelse:</strong> {{booking.experience}}</p>
            <p><strong>Datum:</strong> {{formatDate booking.start_date}}</p>
            <p><strong>Tid:</strong> {{booking.start_time}} - {{booking.end_time}}</p>
            <p><strong>Startplats:</strong> {{booking.startLocationName}}</p>
        </div>
    </div>

    <div class="section">
        <h3>Deltagare och utrustning</h3>
        <div class="details-grid">
            <p><strong>Antal vuxna:</strong> {{booking.number_of_adults}}</p>
            <p><strong>Pris per vuxen:</strong> {{formatPrice booking.adultPrice}}</p>
            {{#if booking.number_of_children}}
            <p><strong>Antal barn:</strong> {{booking.number_of_children}}</p>
            {{/if}}
        </div>

        {{#if booking.addons.length}}
        <h4>Utrustning</h4>
        <ul>
            {{#each booking.addons}}
            <li>{{name}}: {{amount}}</li>
            {{/each}}
        </ul>
        {{/if}}
    </div>

    {{#if booking.optional_products.length}}
    <div class="section">
        <h3>Tillvalsprodukter</h3>
        <ul>
            {{#each booking.optional_products}}
            <li>{{name}} - {{quantity}}st ({{formatPrice total_price}})</li>
            {{/each}}
        </ul>
    </div>
    {{/if}}

    <div class="section">
        <h3>Prissammanställning</h3>
        <div class="details-grid">
            <p><strong>Delsumma:</strong> {{formatPrice booking.subtotal}}</p>
            <p><strong>Moms (25%):</strong> {{formatPrice booking.vat}}</p>
            <p><strong>Totalt:</strong> {{formatPrice booking.total}}</p>
        </div>
    </div>

    <div class="section">
        <h3>Kontaktinformation</h3>
        <div class="details-grid">
            <p><strong>Namn:</strong> {{booking.booking_name}} {{booking.booking_lastname}}</p>
            <p><strong>E-post:</strong> {{booking.customer_email}}</p>
            <p><strong>Telefon:</strong> {{booking.customer_phone}}</p>
            {{#if booking.customer_comment}}
            <p><strong>Meddelande:</strong> {{booking.customer_comment}}</p>
            {{/if}}
        </div>
    </div>
</body>
</html>
`;
