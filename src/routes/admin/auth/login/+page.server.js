import { fail, redirect } from '@sveltejs/kit';
import { AuthApiError } from '@supabase/supabase-js';

export const actions = {
	login: async ({ request, locals: { supabase } }) => {
		const formData = await request.formData();
		const email = String(formData.get('email'));
		const password = String(formData.get('password'));

		const { data, error } = await supabase.auth.signInWithPassword({
			email,
			password
		});

		if (error) {
			if (error instanceof AuthApiError && error.status === 400) {
				return fail(400, {
					error: 'Invalid credentials',
					email
				});
			}
			return fail(500, {
				error: 'Server error. Try again later.',
				email
			});
		}

		// Verify if user is admin
		const { data: profile, error: profileError } = await supabase
			.from('profiles')
			.select('role')
			.eq('id', data.user.id)
			.single();

		if (profileError || !profile || profile.role !== 'admin') {
			await supabase.auth.signOut();
			return fail(403, {
				error: 'Unauthorized access',
				email
			});
		}

		throw redirect(303, '/admin');
	}
};

// Skip auth check for login page
export const load = async () => {
	return {};
};
