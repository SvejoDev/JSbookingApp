import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { createSupabaseServerClient } from '@supabase/auth-helpers-sveltekit';
import { redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

async function supabaseHook({ event, resolve }) {
	event.locals.supabase = createSupabaseServerClient({
		supabaseUrl: PUBLIC_SUPABASE_URL,
		supabaseKey: PUBLIC_SUPABASE_ANON_KEY,
		event
	});

	event.locals.getUser = async () => {
		const {
			data: { user },
			error
		} = await event.locals.supabase.auth.getUser();
		if (error || !user) return null;
		return user;
	};

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range';
		}
	});
}

async function adminProtection({ event, resolve }) {
	// Skip auth check for login page
	if (event.url.pathname === '/admin/auth/login') {
		return resolve(event);
	}

	// Protect all other admin routes
	if (event.url.pathname.startsWith('/admin')) {
		const user = await event.locals.getUser();

		if (!user) {
			throw redirect(303, '/admin/auth/login');
		}

		const { data: profile } = await event.locals.supabase
			.from('profiles')
			.select('role')
			.eq('id', user.id)
			.single();

		if (!profile || profile.role !== 'admin') {
			await event.locals.supabase.auth.signOut();
			throw redirect(303, '/admin/auth/login');
		}
	}

	return resolve(event);
}

export const handle = sequence(supabaseHook, adminProtection);
