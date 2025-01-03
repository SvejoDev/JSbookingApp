import { auth } from '$lib/server/lucia';
import { redirect } from '@sveltejs/kit';
import { canAccessRoute } from '$lib/server/rbac';

// definiera vilka sidor som inte kräver autentisering
const PUBLIC_ROUTES = [
	'/admin/auth/login',
	'/admin/auth/signup',
	'/admin/auth/callback',
	'/booking/'
];

export const handle = async ({ event, resolve }) => {
	// sätt auth på event.locals
	event.locals.auth = auth.handleRequest(event);

	// validera session
	const session = await event.locals.auth.validate();

	// sätt användare på locals för enklare åtkomst
	event.locals.user = session ? session.user : null;

	// kontrollera om sidan behöver autentisering
	const isPublicRoute = PUBLIC_ROUTES.some((route) => event.url.pathname.startsWith(route));

	// hantera admin-routes
	if (event.url.pathname.startsWith('/admin') && !isPublicRoute) {
		// kontrollera om användaren är inloggad
		if (!session) {
			throw redirect(303, '/admin/auth/login');
		}

		// kontrollera om användaren har rätt behörighet för routen
		if (!canAccessRoute(session.user.role, event.url.pathname)) {
			// om användaren inte har behörighet, omdirigera till admin hem
			throw redirect(303, '/admin');
		}
	}

	// fortsätt till nästa middleware eller sidan
	return await resolve(event);
};
