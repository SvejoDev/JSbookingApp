// src/routes/admin/+page.server.js
import { redirect } from '@sveltejs/kit';

export const load = async ({ locals }) => {
	const session = await locals.getSession();

	if (!session) {
		throw redirect(303, '/admin/auth/login');
	}

	// Check if user is admin
	const { data: profile } = await locals.supabase
		.from('profiles')
		.select('*')
		.eq('id', session.user.id)
		.single();

	if (!profile || profile.role !== 'admin') {
		throw redirect(303, '/admin/auth/login');
	}

	return {
		profile
	};
};
