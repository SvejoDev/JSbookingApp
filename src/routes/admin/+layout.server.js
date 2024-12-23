import { redirect } from '@sveltejs/kit';
import { query } from '$lib/db.js';

export const load = async ({ locals, url }) => {
	// hoppa över autentiseringskontroll för inloggningssidan
	if (url.pathname === '/admin/auth/login') {
		const {
			data: { user },
			error: userError
		} = await locals.supabase.auth.getUser();

		// om redan inloggad och är admin, omdirigera till admin-dashboard
		if (user && !userError) {
			const { rows: profiles } = await query('SELECT role FROM profiles WHERE id = $1', [user.id]);

			if (profiles.length && profiles[0].role === 'admin') {
				throw redirect(303, '/admin');
			}
		}
		return {};
	}

	// för alla andra admin-rutter, kontrollera autentisering
	const {
		data: { user },
		error: userError
	} = await locals.supabase.auth.getUser();

	if (userError || !user) {
		await locals.supabase.auth.signOut();
		throw redirect(303, '/admin/auth/login');
	}

	// kontrollera om användaren är admin
	const { rows: profiles } = await query('SELECT role FROM profiles WHERE id = $1', [user.id]);

	if (!profiles.length || profiles[0].role !== 'admin') {
		await locals.supabase.auth.signOut();
		throw redirect(303, '/admin/auth/login');
	}

	return {
		user
	};
};
