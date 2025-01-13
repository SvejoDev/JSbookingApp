// src/routes/admin/+layout.server.js
import { redirect } from '@sveltejs/kit';
import { query } from '$lib/db.js';

export const load = async ({ locals, url }) => {
	if (url.pathname === '/admin/auth/login') {
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

	if (!locals.user) {
		throw redirect(303, '/admin/auth/login');
	}

	// Hämta fullständig användardata
	const {
		rows: [userProfile]
	} = await query('SELECT id, email, role FROM auth_user WHERE id = $1', [locals.user.userId]);

	if (!userProfile || userProfile.role !== 'admin') {
		throw redirect(303, '/admin/auth/login');
	}

	// Returnera komplett användardata
	// Returnera komplett användardata
	return {
		user: {
			userId: locals.user.userId,
			email: userProfile.email,
			role: userProfile.role
		}
	};
};
