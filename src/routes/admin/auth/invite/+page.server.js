import { error } from '@sveltejs/kit';
import { query, transaction } from '$lib/db.js';

export const actions = {
	invite: async ({ request, locals }) => {
		const {
			data: { session },
			error: sessionError
		} = await locals.supabase.auth.getSession();

		if (!session || sessionError) {
			throw error(401, 'obehörig');
		}

		// verifiera att användaren är admin med postgresql
		const { rows: adminProfiles } = await query('SELECT role FROM profiles WHERE id = $1', [
			session.user.id
		]);

		if (!adminProfiles.length || adminProfiles[0].role !== 'admin') {
			throw error(403, 'otillåten åtkomst');
		}

		const formData = await request.formData();
		const email = String(formData.get('email'));
		const role = String(formData.get('role'));

		try {
			// använd supabase för att skicka inbjudan
			const { data, error: inviteError } =
				await locals.supabase.auth.admin.inviteUserByEmail(email);

			if (inviteError) {
				throw error(400, inviteError.message);
			}

			// använd postgresql transaktion för att skapa profilen
			await transaction(async (client) => {
				// kontrollera om profilen redan finns
				const { rows: existingProfiles } = await client.query(
					'SELECT id FROM profiles WHERE email = $1',
					[email]
				);

				if (existingProfiles.length === 0) {
					// skapa ny profil
					await client.query(
						'INSERT INTO profiles (email, role, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())',
						[email, role]
					);
				} else {
					// uppdatera existerande profil
					await client.query('UPDATE profiles SET role = $1, updated_at = NOW() WHERE email = $2', [
						role,
						email
					]);
				}
			});

			return { success: true };
		} catch (err) {
			console.error('fel vid inbjudan:', err);
			throw error(400, err.message);
		}
	}
};
