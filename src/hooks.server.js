// src/hooks.server.js
import { supabase } from '$lib/supabaseClient';

export const handle = async ({ event, resolve }) => {
	event.locals.supabase = supabase;

	event.locals.getSession = async () => {
		const {
			data: { session }
		} = await supabase.auth.getSession();
		return session;
	};

	return resolve(event);
};
