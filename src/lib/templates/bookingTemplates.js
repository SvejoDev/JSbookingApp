import { formatDateTime, formatPrice } from './emailTemplates.js';

// flytta bookingTemplate hit från email.js
export const bookingConfirmationTemplate = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        /* befintlig styling */
        .products-table {
            width: 100%;
            margin-top: 10px;
            border-collapse: collapse;
        }
        .products-table th {
            text-align: left;
            padding: 5px 0;
            border-bottom: 2px solid #eee;
        }
        .products-table td {
            padding: 5px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Befintlig bokningsinformation -->
        
        {{#if optional_products.length}}
            <div class="section">
                <h3>Tillvalsprodukter</h3>
                <table class="products-table">
                    <thead>
                        <tr>
                            <th>Produkt</th>
                            <th style="text-align: right;">Antal</th>
                            <th style="text-align: right;">Pris</th>
                        </tr>
                    </thead>
                    <tbody>
                        {{{formatOptionalProducts optional_products}}}
                    </tbody>
                </table>
            </div>
        {{/if}}
        
        <!-- Resten av mallen -->
    </div>
</body>
</html>
`;

// Lägg till andra bokningsrelaterade templates här

// Uppdatera bookingTemplate för att inkludera tillvalsprodukter
export const bookingTemplate = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        /* Behåll samma styling som tidigare */
    </style>
</head>
<body>
    <!-- Behåll samma HTML-struktur som tidigare -->

    <!-- Tillvalsprodukter -->
    {{#if booking.optional_products}}
        <div class="section">
            <h3>Tillvalsprodukter</h3>
            <table class="products-table">
                <thead>
                    <tr>
                        <th>Produkt</th>
                        <th>Antal</th>
                        <th>Pris</th>
                    </tr>
                </thead>
                <tbody>
                    {{{formatOptionalProducts booking.optional_products}}}
                </tbody>
            </table>
        </div>
    {{/if}}
</body>
</html>
`;
