import { error, fail } from '@sveltejs/kit';
import { createInvitation } from '$lib/server/invitation';
import { query } from '$lib/db';
import { Roles } from '$lib/server/lucia';

// konstant för site url
const SITE_URL = process.env.SITE_URL || 'http://localhost:5173';

export const actions = {
	invite: async ({ request, locals }) => {
		const session = await locals.auth.validate();
		if (!session) throw error(401, 'obehörig');

		// verifiera att användaren är admin
		const { rows: adminProfiles } = await query('SELECT role FROM auth_user WHERE id = $1', [
			session.user.userId
		]);

		if (!adminProfiles.length || adminProfiles[0].role !== Roles.ADMIN) {
			throw error(403, 'otillåten åtkomst');
		}

		const formData = await request.formData();
		const email = formData.get('email');
		const role = formData.get('role');

		// validera input
		if (!email || !role || !Object.values(Roles).includes(role)) {
			return fail(400, {
				error: 'ogiltig input',
				email: email
			});
		}

		try {
			// skapa inbjudan
			const invitation = await createInvitation(email, role);

			// skapa inbjudningslänk
			const inviteUrl = `${SITE_URL}/admin/auth/signup?token=${invitation.token}`;

			// här skulle du normalt skicka ett email med länken
			console.log('inbjudningslänk:', inviteUrl);

			return {
				success: true,
				message: 'inbjudan har skickats'
			};
		} catch (err) {
			console.error('fel vid inbjudan:', err);
			return fail(500, {
				error: 'kunde inte skapa inbjudan',
				email: email
			});
		}
	}
};
