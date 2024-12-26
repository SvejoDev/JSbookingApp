import { redirect } from '@sveltejs/kit';

export const POST = async ({ locals }) => {
	// invalidera den nuvarande sessionen
	await locals.auth.invalidate();

	// ta bort session-cookien
	locals.auth.setSession(null);

	// omdirigera till login-sidan
	throw redirect(302, '/admin/auth/login');
};
