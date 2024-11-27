import { redirect } from '@sveltejs/kit';

export const load = async ({ locals, url }) => {
	// Skip auth check for login page
	if (url.pathname === '/admin/auth/login') {
		const {
			data: { user },
			error: userError
		} = await locals.supabase.auth.getUser();

		// If already logged in and is admin, redirect to admin dashboard
		if (user && !userError) {
			const { data: profile } = await locals.supabase
				.from('profiles')
				.select('role')
				.eq('id', user.id)
				.single();

			if (profile?.role === 'admin') {
				throw redirect(303, '/admin');
			}
		}
		return {};
	}

	// For all other admin routes, check authentication
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

	if (!profile || profile.role !== 'admin') {
		await locals.supabase.auth.signOut();
		throw redirect(303, '/admin/auth/login');
	}

	return {
		user
	};
};
