import { auth } from '$lib/server/lucia';
import { fail, redirect } from '@sveltejs/kit';
import { LuciaError } from 'lucia';

// om användaren redan är inloggad, skicka dem till admin-sidan
export const load = async ({ locals }) => {
	const session = await locals.auth.validate();
	if (session) throw redirect(302, '/admin');
	return {};
};

export const actions = {
	default: async ({ request, locals }) => {
		const formData = await request.formData();
		const email = formData.get('email');
		const password = formData.get('password');

		// validera att email och lösenord finns
		if (typeof email !== 'string' || typeof password !== 'string') {
			return fail(400, {
				message: 'ogiltig inmatning'
			});
		}

		try {
			// försök logga in användaren
			const key = await auth.useKey('email', email, password);
			const session = await auth.createSession({
				userId: key.userId,
				attributes: {}
			});
			locals.auth.setSession(session);
		} catch (error) {
			if (
				error instanceof LuciaError &&
				(error.message === 'AUTH_INVALID_KEY_ID' || error.message === 'AUTH_INVALID_PASSWORD')
			) {
				return fail(400, {
					message: 'fel email eller lösenord'
				});
			}
			return fail(500, {
				message: 'ett oväntat fel uppstod'
			});
		}
		throw redirect(302, '/admin');
	}
};
