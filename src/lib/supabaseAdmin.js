import { createClient } from '@supabase/supabase-js';
// @ts-ignore
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
// @ts-ignore
import { env } from '$env/dynamic/private';
console.log(env.DEPLOYMENT_SPECIFIC_VARIABLE);

const supabaseUrl = PUBLIC_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
	console.error('Environment variables not loaded:', {
		url: !!supabaseUrl,
		serviceKey: !!supabaseServiceKey
	});
	throw new Error('Missing Supabase environment variables');
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
	auth: {
		autoRefreshToken: false,
		persistSession: false
	}
});
