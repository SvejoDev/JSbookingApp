// src/routes/admin/+layout.server.js
import { redirect } from '@sveltejs/kit';
import { query } from '$lib/db.js';

export const load = async ({ locals, url }) => {
	// hoppa över autentiseringskontroll för inloggningssidan
	if (url.pathname === '/admin/auth/login') {
		// om användaren redan är inloggad
		if (locals.user) {
			const { rows: profiles } = await query('SELECT role FROM auth_user WHERE id = $1', [
				locals.user.userId
			]);

			if (profiles.length && profiles[0].role === 'admin') {
				throw redirect(303, '/admin');
			}
		}
		return {};
	}

	// för alla andra admin-rutter, kontrollera autentisering
	if (!locals.user) {
		throw redirect(303, '/admin/auth/login');
	}

	// kontrollera om användaren är admin
	const { rows: profiles } = await query('SELECT role FROM auth_user WHERE id = $1', [
		locals.user.userId
	]);

	if (!profiles.length || profiles[0].role !== 'admin') {
		throw redirect(303, '/admin/auth/login');
	}

	return {
		user: locals.user
	};
};
