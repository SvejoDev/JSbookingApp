import { generateRandomString } from 'lucia/utils';
import { auth } from './lucia';

// funktion för att generera en säker token för inbjudningar
export function generateInvitationToken() {
	return generateRandomString(32);
}

// funktion för att validera ett lösenord
export function validatePassword(password) {
	// lösenordet måste vara minst 8 tecken långt
	if (password.length < 8) {
		return {
			valid: false,
			message: 'lösenordet måste vara minst 8 tecken långt'
		};
	}

	// lösenordet måste innehålla minst en siffra
	if (!/\d/.test(password)) {
		return {
			valid: false,
			message: 'lösenordet måste innehålla minst en siffra'
		};
	}

	return {
		valid: true
	};
}
