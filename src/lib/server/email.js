import { Resend } from 'resend';
import { env } from '$env/dynamic/private';

const resend = new Resend(env.RESEND_API_KEY);

export async function sendBookingConfirmation(booking, experienceDetails) {
	const {
		booking_name,
		booking_lastname,
		customer_email,
		start_date,
		start_time,
		end_date,
		end_time,
		experience,
		startLocation,
		number_of_adults,
		number_of_children,
		amount_canoes,
		amount_kayak,
		amount_sup
	} = booking;

	const emailHtml = `
        <h1>Bokningsbekräftelse - ${experience}</h1>
        
        <p>Hej ${booking_name} ${booking_lastname}!</p>
        
        <h2>Din bokning</h2>
        <ul>
            <li>Start: ${start_date} kl ${start_time}</li>
            <li>Slut: ${end_date} kl ${end_time}</li>
            <li>Startplats: ${startLocation}</li>
            <li>Antal vuxna: ${number_of_adults}</li>
            <li>Antal barn: ${number_of_children}</li>
        </ul>

        <h2>Utrustning</h2>
        <ul>
            ${amount_canoes > 0 ? `<li>Kanoter: ${amount_canoes}</li>` : ''}
            ${amount_kayak > 0 ? `<li>Kajaker: ${amount_kayak}</li>` : ''}
            ${amount_sup > 0 ? `<li>SUP: ${amount_sup}</li>` : ''}
        </ul>

        <h2>Viktig information</h2>
        <p>${experienceDetails.booking_confirmation_details}</p>

        <p>Vid frågor, kontakta oss på info@stisses.se</p>
    `;

	try {
		console.log('Försöker skicka email till:', customer_email);
		const result = await resend.emails.send({
			from: 'onboarding@resend.dev', // VIKTIGT: Ändra till denna temporärt
			to: customer_email,
			subject: `Bokningsbekräftelse - ${experience}`,
			html: emailHtml
		});
		console.log('Email skickat:', result);
	} catch (error) {
		console.error('Email sending failed:', error);
		throw error;
	}
}
