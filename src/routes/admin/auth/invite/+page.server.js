// src/routes/admin/auth/invite/+page.server.js
import { supabaseAdmin } from '$lib/supabaseAdmin';
import { error, redirect } from '@sveltejs/kit';

export const actions = {
	invite: async ({ request, locals }) => {
		const session = await locals.getSession();

		// Verify if the current user is an admin
		const { data: adminProfile } = await supabaseAdmin
			.from('profiles')
			.select('role')
			.eq('id', session.user.id)
			.single();

		if (!adminProfile || adminProfile.role !== 'admin') {
			throw error(403, 'Unauthorized');
		}

		const formData = await request.formData();
		const email = formData.get('email');
		const role = formData.get('role');

		// Generate a signup link with Supabase
		const { data, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);

		if (inviteError) {
			throw error(400, inviteError.message);
		}

		// Pre-create the profile with the desired role
		const { error: profileError } = await supabaseAdmin.from('profiles').insert([
			{
				email,
				role
			}
		]);

		if (profileError) {
			throw error(400, profileError.message);
		}

		return { success: true };
	}
};
