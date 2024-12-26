// importera nödvändiga moduler
import { lucia } from 'lucia';
import { postgres as postgresAdapter } from '@lucia-auth/adapter-postgresql';
import { sveltekit } from 'lucia/middleware';
import postgres from 'pg';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';

// definiera möjliga roller i systemet
export const Roles = {
	ADMIN: 'admin',
	PLATSCHEF: 'platschef',
	OBSERVATOR: 'observator',
	STAFF: 'staff',
	CHAUFFOR: 'chauffor',
	UPPLEVELSEGUIDE: 'upplevelseguide'
};

// skapa en postgres pool
const pool = new postgres.Pool({
	user: env.POSTGRES_USER,
	host: env.POSTGRES_HOST,
	database: env.POSTGRES_DATABASE,
	password: env.POSTGRES_PASSWORD,
	port: parseInt(env.POSTGRES_PORT),
	ssl: {
		rejectUnauthorized: false,
		requestCert: true
	}
});

// skapa lucia auth
export const auth = lucia({
	env: dev ? 'DEV' : 'PROD',
	adapter: postgresAdapter(pool, {
		user: 'auth_user',
		session: 'auth_session',
		key: 'auth_key'
	}),
	middleware: sveltekit(),
	getUserAttributes: (data) => {
		return {
			email: data.email,
			role: data.role
		};
	}
});
