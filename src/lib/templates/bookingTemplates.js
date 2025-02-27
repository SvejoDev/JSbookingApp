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
        <h2>Bokningsbekräftelse - Stisses</h2>
        <p>Bokningsnummer: #{{booking.id}}</p>
    </div>

    <div class="section">
        <h3>Bokningsdetaljer</h3>
        <div class="details-grid">
            <p><strong>Upplevelse:</strong> {{booking.experience}}</p>
            <p><strong>Startplats:</strong> {{booking.startLocationName}}</p>
            <p><strong>Datum:</strong> {{formatDate booking.start_date}} kl. {{booking.start_time}}</p>
            <p><strong>Slutdatum:</strong> {{formatDate booking.end_date}} kl. {{booking.end_time}}</p>
            <p><strong>Antal vuxna:</strong> {{booking.number_of_adults}}</p>
            <p><strong>Antal barn:</strong> {{booking.number_of_children}}</p>
        </div>
    </div>

    {{#if booking.payment_method}}
    <div class="section">
        <h3>Betalningsinformation</h3>
        <p><strong>Betalningsmetod:</strong> {{formatPaymentMethod booking.payment_method}}</p>
        
        {{#eq booking.payment_method "invoice"}}
            {{#if booking.invoice_details}}
            <div class="invoice-details">
                <p><strong>Organisation:</strong> {{booking.invoice_details.organization}}</p>
                <p><strong>Adress:</strong> {{booking.invoice_details.address}}</p>
                <p><strong>Postnummer:</strong> {{booking.invoice_details.postal_code}}</p>
                <p><strong>Ort:</strong> {{booking.invoice_details.city}}</p>
                {{#if booking.invoice_details.marking}}
                <p><strong>Märkning:</strong> {{booking.invoice_details.marking}}</p>
                {{/if}}
                {{#if booking.invoice_details.gln_peppol_id}}
                <p><strong>GLN/PEPPOL-ID:</strong> {{booking.invoice_details.gln_peppol_id}}</p>
                {{/if}}
                <p><strong>Faktura skickas till:</strong> {{booking.customer_email}}</p>
            </div>
            {{/if}}
        {{/eq}}
    </div>
    {{/if}}

    {{#if booking.addons}}
    <div class="section">
        <h3>Bokade produkter</h3>
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
        <h3>Tillvalsprodukter</h3>
        <ul>
            {{#each booking.optional_products}}
            <li>{{name}} - {{quantity}}st ({{formatPrice total_price}})</li>
            {{/each}}
        </ul>
    </div>
    {{/if}}

    <div class="price-details">
        <h3>Prisdetaljer</h3>
        
        <!-- Delsumma -->
        <div class="price-row">
            <span>Delsumma (exkl. moms):</span>
            <span>{{formatPrice (multiply booking.amount_total_exc_vat 0.8)}} kr</span>
        </div>
        
        <!-- Moms -->
        <div class="price-row">
            <span>Moms (25%):</span>
            <span>{{formatPrice (multiply booking.amount_total_exc_vat 0.2)}} kr</span>
        </div>
        
        <!-- Totalt -->
        <div class="price-row price-total">
            <span>Totalt att betala:</span>
            <span>{{formatPrice booking.amount_total_inc_vat}} kr</span>
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
