import { auth } from '$lib/server/lucia';
import { redirect } from '@sveltejs/kit';

// definiera vilka sidor som inte kräver autentisering
const PUBLIC_ROUTES = ['/admin/auth/login', '/admin/auth/signup', '/admin/auth/callback'];

export const handle = async ({ event, resolve }) => {
	// hämta authrequest från lucia
	event.locals.auth = auth.handleRequest(event);

	const session = await event.locals.auth.validate();
	event.locals.user = session?.user ?? null;

	// kontrollera om sidan behöver autentisering
	const isPublicRoute = PUBLIC_ROUTES.some((route) => event.url.pathname.startsWith(route));

	// om användaren inte är inloggad och sidan kräver auth, omdirigera till login
	if (!isPublicRoute && !session) {
		throw redirect(303, '/admin/auth/login');
	}

	// fortsätt till nästa middleware eller sidan
	return await resolve(event);
};
