// src/routes/admin/+layout.server.js
import { redirect } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/supabaseAdmin';

export const load = async ({ locals, url }) => {
	// Skip auth check for login page
	if (url.pathname === '/admin/auth/login') {
		return {};
	}

	const session = await locals.getSession();

	if (!session) {
		throw redirect(303, '/admin/auth/login');
	}

	// Verify if user is an admin
	const { data: profile, error } = await supabaseAdmin
		.from('profiles')
		.select('role')
		.eq('id', session.user.id)
		.single();

	if (error || !profile || profile.role !== 'admin') {
		throw redirect(303, '/admin/auth/login');
	}

	return {
		user: session.user
	};
};
