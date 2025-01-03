import { redirect } from '@sveltejs/kit';
import { hasPermission } from '$lib/server/rbac';

// helper funktion för att kontrollera behörighet i +page.server.js filer
export function requirePermission(permission) {
	return async ({ locals }) => {
		const { user } = locals;

		if (!user) {
			throw redirect(303, '/admin/auth/login');
		}

		if (!hasPermission(user.role, permission)) {
			throw redirect(303, '/admin');
		}

		return { user };
	};
}

// helper funktion för att skydda api endpoints
export function requirePermissionForApi(permission) {
	return async ({ locals }) => {
		const { user } = locals;

		if (!user || !hasPermission(user.role, permission)) {
			return new Response(JSON.stringify({ error: 'unauthorized' }), {
				status: 403,
				headers: {
					'Content-Type': 'application/json'
				}
			});
		}
	};
}
