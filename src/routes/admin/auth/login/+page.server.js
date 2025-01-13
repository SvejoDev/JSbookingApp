import { auth } from '$lib/server/lucia';
import { fail } from '@sveltejs/kit';
import { LuciaError } from 'lucia';

export const actions = {
	default: async ({ request, locals }) => {
		const formData = await request.formData();
		const email = formData.get('email');
		const password = formData.get('password');

		if (typeof email !== 'string' || typeof password !== 'string') {
			return fail(400, { message: 'ogiltig inmatning' });
		}

		try {
			const key = await auth.useKey('email', email, password);
			const session = await auth.createSession({
				userId: key.userId,
				attributes: {}
			});
			locals.auth.setSession(session);

			return {
				success: true,
				location: '/admin'
			};
		} catch (error) {
			console.error('Login error:', error);
			if (
				error instanceof LuciaError &&
				(error.message === 'AUTH_INVALID_KEY_ID' || error.message === 'AUTH_INVALID_PASSWORD')
			) {
				return fail(400, { message: 'fel email eller lösenord' });
			}
			return fail(500, { message: 'ett oväntat fel uppstod' });
		}
	}
};
