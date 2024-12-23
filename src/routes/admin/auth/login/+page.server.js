import { fail, redirect } from '@sveltejs/kit';
import { AuthApiError } from '@supabase/supabase-js';
import { query } from '$lib/db.js';

export const actions = {
	login: async ({ request, locals: { supabase } }) => {
		const formData = await request.formData();
		const email = String(formData.get('email'));
		const password = String(formData.get('password'));

		// använder fortfarande supabase för autentisering
		const { data, error } = await supabase.auth.signInWithPassword({
			email,
			password
		});

		if (error) {
			if (error instanceof AuthApiError && error.status === 400) {
				return fail(400, {
					error: 'felaktiga inloggningsuppgifter',
					email
				});
			}
			return fail(500, {
				error: 'serverfel. försök igen senare.',
				email
			});
		}

		// verifierar admin-rollen med postgresql
		const { rows: profiles } = await query('SELECT role FROM profiles WHERE id = $1', [
			data.user.id
		]);

		if (!profiles.length || profiles[0].role !== 'admin') {
			await supabase.auth.signOut();
			return fail(403, {
				error: 'otillåten åtkomst',
				email
			});
		}

		throw redirect(303, '/admin');
	}
};

// hoppa över autentiseringskontroll för inloggningssidan
export const load = async () => {
	return {};
};
