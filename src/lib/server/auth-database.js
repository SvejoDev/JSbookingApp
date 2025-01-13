import postgres from 'postgres';
import { env } from '$env/dynamic/private';

export const authSQL = postgres({
	host: env.POSTGRES_HOST,
	database: env.POSTGRES_DATABASE,
	username: env.POSTGRES_USER,
	password: env.POSTGRES_PASSWORD,
	port: parseInt(env.POSTGRES_PORT),
	ssl: {
		rejectUnauthorized: false
	}
});
