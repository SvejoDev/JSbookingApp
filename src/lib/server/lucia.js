import { lucia } from 'lucia';
import { postgres as postgresAdapter } from '@lucia-auth/adapter-postgresql';
import { sveltekit } from 'lucia/middleware';
import { authSQL } from './auth-database';
import { dev } from '$app/environment';

// Återställ Roles-exporten
export const Roles = {
	ADMIN: 'admin',
	PLATSCHEF: 'platschef',
	OBSERVATOR: 'observator',
	STAFF: 'staff',
	CHAUFFOR: 'chauffor',
	UPPLEVELSEGUIDE: 'upplevelseguide'
};

export const auth = lucia({
	env: dev ? 'DEV' : 'PROD',
	adapter: postgresAdapter(authSQL, {
		user: 'auth_user',
		key: 'auth_key',
		session: 'auth_session'
	}),
	middleware: sveltekit(),
	getUserAttributes: (data) => {
		return {
			email: data.email,
			role: data.role
		};
	}
});
