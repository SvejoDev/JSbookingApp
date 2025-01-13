import { generateInvitationToken } from './password.js';
import { query } from '$lib/db';

// funktion för att skapa en ny inbjudan
export async function createInvitation(email, role) {
	const token = generateInvitationToken();

	// sätt utgångsdatum till 7 dagar från nu
	const expiresAt = new Date();
	expiresAt.setDate(expiresAt.getDate() + 7);

	// spara inbjudan i databasen
	const result = await query(
		`INSERT INTO auth_invitation 
        (id, email, role, token, expires_at) 
        VALUES ($1, $2, $3, $4, $5) 
        RETURNING *`,
		[crypto.randomUUID(), email, role, token, expiresAt]
	);

	return result.rows[0];
}

// funktion för att validera en inbjudningstoken
export async function validateInvitation(token) {
	const result = await query(
		`SELECT * FROM auth_invitation 
        WHERE token = $1 
        AND used_at IS NULL 
        AND expires_at > NOW()`,
		[token]
	);

	return result.rows[0] || null;
}

// funktion för att markera en inbjudan som använd
export async function markInvitationAsUsed(token) {
	await query(
		`UPDATE auth_invitation 
        SET used_at = NOW() 
        WHERE token = $1`,
		[token]
	);
}
