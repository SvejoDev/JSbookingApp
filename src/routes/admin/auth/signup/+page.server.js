import { auth } from '$lib/server/lucia';
import { fail, redirect } from '@sveltejs/kit';
import { validateInvitation, markInvitationAsUsed } from '$lib/server/invitation';
import { validatePassword } from '$lib/server/password';

export const load = async ({ url }) => {
	const token = url.searchParams.get('token');

	if (!token) {
		throw redirect(302, '/admin/auth/login');
	}

	// validera inbjudningstoken
	const invitation = await validateInvitation(token);
	if (!invitation) {
		throw redirect(302, '/admin/auth/login');
	}

	return {
		email: invitation.email,
		token: token
	};
};

export const actions = {
	default: async ({ request }) => {
		const formData = await request.formData();
		const email = formData.get('email');
		const password = formData.get('password');
		const token = formData.get('token');

		// validera input
		if (typeof email !== 'string' || typeof password !== 'string' || typeof token !== 'string') {
			return fail(400, {
				message: 'ogiltig input'
			});
		}

		// validera lösenord
		const passwordValidation = validatePassword(password);
		if (!passwordValidation.valid) {
			return fail(400, {
				message: passwordValidation.message
			});
		}

		// validera inbjudan
		const invitation = await validateInvitation(token);
		if (!invitation || invitation.email !== email) {
			return fail(400, {
				message: 'ogiltig eller utgången inbjudan'
			});
		}

		try {
			// skapa användare
			const user = await auth.createUser({
				key: {
					providerId: 'email',
					providerUserId: email,
					password
				},
				attributes: {
					email,
					role: invitation.role
				}
			});

			// markera inbjudan som använd
			await markInvitationAsUsed(token);

			// skapa session och logga in användaren
			const session = await auth.createSession({
				userId: user.userId,
				attributes: {}
			});

			return {
				headers: {
					'Set-Cookie': session.cookie
				}
			};
		} catch (error) {
			console.error(error);
			return fail(500, {
				message: 'kunde inte skapa konto'
			});
		}

		throw redirect(302, '/admin');
	}
};
