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
        }
        .booking-details {
            margin: 20px 0;
            padding: 15px;
            background-color: #f5f5f5;
            border-radius: 5px;
        }
    </style>
</head>
<body>
    <h2>Tack för din bokning!</h2>
    
    <div class="booking-details">
        <h3>Bokningsdetaljer</h3>
        <p>Bokningsnummer: {{id}}</p>
        <p>Upplevelse: {{experience}}</p>
        <p>Datum: {{formatDateTime start_date start_time}}</p>
        {{#if end_date}}
        <p>Sluttid: {{formatDateTime end_date end_time}}</p>
        {{/if}}
        <p>Startplats: {{startLocationName}}</p>
        <p>Antal vuxna: {{number_of_adults}}</p>
        <p>Antal barn: {{number_of_children}}</p>
        <p>Totalt pris: {{formatPrice amount_total}} kr</p>
    </div>

    {{#if addons.length}}
    <div class="addons-section">
        <h3>Valda tillval</h3>
        <ul>
        {{#each addons}}
            <li>{{name}}: {{amount}} st</li>
        {{/each}}
        </ul>
    </div>
    {{/if}}

    <div class="contact-info">
        <h3>Dina uppgifter</h3>
        <p>Namn: {{booking_name}} {{booking_lastname}}</p>
        <p>E-post: {{customer_email}}</p>
        <p>Telefon: {{customer_phone}}</p>
        {{#if customer_comment}}
        <p>Kommentar: {{customer_comment}}</p>
        {{/if}}
    </div>
</body>
</html>
`;

// Lägg till andra bokningsrelaterade templates här
