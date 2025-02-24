import { formatDateTime, formatPrice } from './emailTemplates.js';

// flytta bookingTemplate hit från email.js
export const bookingConfirmationTemplate = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; }
        .booking-details { margin: 20px 0; }
        .price-table { width: 100%; border-collapse: collapse; }
        .price-table td, .price-table th { padding: 8px; border-bottom: 1px solid #ddd; }
    </style>
</head>
<body>
    <h2>Bokningsbekräftelse - Stisses</h2>
    
    <div class="booking-details">
        <p><strong>Bokningsnummer:</strong> {{id}}</p>
        <p><strong>Skapades:</strong> {{formatDateTime date_time_created}}</p>
    </div>

    <h3>Bokningsdetaljer</h3>
    <p><strong>Upplevelse:</strong> {{experience}}</p>
    <p><strong>Datum:</strong> {{formatDateTime start_date}}</p>
    <p><strong>Tid:</strong> {{start_time}} - {{end_time}}</p>
    <p><strong>Startplats:</strong> {{startLocationName}}</p>

    <h3>Deltagare och utrustning</h3>
    <table class="price-table">
        <tr>
            <th>Beskrivning</th>
            <th>Antal</th>
            <th>Pris/st</th>
            <th>Totalt</th>
        </tr>
        <tr>
            <td>Vuxna</td>
            <td>{{number_of_adults}}</td>
            <td>{{formatPrice adultPrice}} kr</td>
            <td>{{formatPrice (multiply number_of_adults adultPrice)}} kr</td>
        </tr>
        {{#if number_of_children}}
        <tr>
            <td>Barn</td>
            <td>{{number_of_children}}</td>
            <td>0 kr</td>
            <td>0 kr</td>
        </tr>
        {{/if}}

        {{#each addons}}
        <tr>
            <td>{{name}}</td>
            <td>{{amount}}</td>
            <td>-</td>
            <td>-</td>
        </tr>
        {{/each}}

        {{#each optional_products}}
        <tr>
            <td>{{name}}</td>
            <td>{{quantity}} st</td>
            <td>{{formatPrice price}} kr</td>
            <td>{{formatPrice total_price}} kr</td>
        </tr>
        {{/each}}
    </table>

    {{#if optional_products.length}}
    <h3>Tillvalsprodukter</h3>
    <table class="price-table">
        {{#each optional_products}}
        <tr>
            <td>{{name}}</td>
            <td>{{quantity}} st</td>
            <td>{{formatPrice price}} kr</td>
            <td>{{formatPrice total_price}} kr</td>
        </tr>
        {{/each}}
    </table>
    {{/if}}

    <p><strong>Totalt att betala:</strong> {{formatPrice total}} kr</p>

    <h3>Kontaktinformation</h3>
    <p><strong>Namn:</strong> {{booking_name}} {{booking_lastname}}</p>
    <p><strong>E-post:</strong> {{customer_email}}</p>
    <p><strong>Telefon:</strong> {{customer_phone}}</p>

    {{#if hasRebookingGuarantee}}
    <div style="margin-top: 20px;">
        <a href="{{rebookingLink}}" 
           style="background-color: #4CAF50; 
                  color: white; 
                  padding: 10px 20px; 
                  text-decoration: none; 
                  border-radius: 5px; 
                  display: inline-block;">
            Ändra tid
        </a>
        <p style="font-size: 0.9em; color: #666;">
            Du kan ändra tid fram till 6 timmar innan bokad starttid
        </p>
    </div>
    {{/if}}
</body>
</html>
`;

// Lägg till andra bokningsrelaterade templates här
