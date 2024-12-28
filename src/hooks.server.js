import { auth } from '$lib/server/lucia';
import { redirect } from '@sveltejs/kit';

// definiera vilka sidor som inte kräver autentisering
const PUBLIC_ROUTES = [
	'/admin/auth/login',
	'/admin/auth/signup',
	'/admin/auth/callback',
	'/booking/' // lägg till booking-sidan som public
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

	// om användaren inte är inloggad och sidan kräver auth OCH det är en admin-sida, omdirigera till login
	if (!isPublicRoute && !session && event.url.pathname.startsWith('/admin')) {
		throw redirect(303, '/admin/auth/login');
	}

	// fortsätt till nästa middleware eller sidan
	return await resolve(event);
};
