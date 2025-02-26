import sgMail from '@sendgrid/mail';
import dotenv from 'dotenv';

// ladda miljövariabler
dotenv.config();

// konfigurera sendgrid med api-nyckel
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

/**
 * skicka e-post med sendgrid
 * @param {Object} options - e-postalternativ
 * @param {string} options.to - mottagarens e-postadress
 * @param {string} options.subject - e-postens ämne
 * @param {string} options.html - e-postens html-innehåll
 * @param {string} [options.type='general'] - typ av e-post (för loggning)
 */
export async function sendEmail({ to, subject, html, type = 'general' }) {
	try {
		// skapa e-postmeddelande
		const msg = {
			to,
			from: process.env.EMAIL_FROM || 'noreply@stisses.se',
			subject,
			html
		};

		// skicka e-post
		const response = await sgMail.send(msg);
		console.log(`✅ ${type} e-post skickad till ${to} (status: ${response[0].statusCode})`);
		return response;
	} catch (error) {
		console.error(`❌ Kunde inte skicka ${type} e-post:`, error);
		if (error.response) {
			console.error('SendGrid API svar:', error.response.body);
		}
		throw error;
	}
}
