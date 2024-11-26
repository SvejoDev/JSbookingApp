// src/routes/admin/+layout.server.js
import { redirect } from '@sveltejs/kit';

export const load = async ({ locals, url }) => {
	// Skip auth check for login page
	if (url.pathname === '/admin/auth/login') {
		const session = await locals.getSession();

		// If already logged in and is admin, redirect to admin dashboard
		if (session) {
			const { data: profile } = await locals.supabase
				.from('profiles')
				.select('role')
				.eq('id', session.user.id)
				.single();

			if (profile?.role === 'admin') {
				throw redirect(303, '/admin');
			}
		}
		return {};
	}

	// For all other admin routes, check authentication
	const session = await locals.getSession();
	if (!session) {
		throw redirect(303, '/admin/auth/login');
	}

	// Get authenticated user data
	const {
		data: { user },
		error: userError
	} = await locals.supabase.auth.getUser();
	if (userError || !user) {
		await locals.supabase.auth.signOut();
		throw redirect(303, '/admin/auth/login');
	}

	// Check if user is admin
	const { data: profile } = await locals.supabase
		.from('profiles')
		.select('role')
		.eq('id', user.id)
		.single();

	return {
		user: session.user
	};
};
