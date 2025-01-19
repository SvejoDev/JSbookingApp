import pg from 'pg';
import { env } from '$env/dynamic/private';

// skapar en pool av databasanslutningar som kan återanvändas
const pool = new pg.Pool({
	user: env.POSTGRES_USER,
	host: env.POSTGRES_HOST,
	database: env.POSTGRES_DATABASE, // notera ändringen från POSTGRES_DB till POSTGRES_DATABASE
	password: env.POSTGRES_PASSWORD,
	port: parseInt(env.POSTGRES_PORT),
	// aktiverar ssl med rejectUnauthorized: false för att tillåta självsignerade certifikat
	ssl: {
		rejectUnauthorized: false, // behövs för självsignerade certifikat
		requestCert: true // kräver ssl-certifikat för anslutningen
	}
});

// lyssnar på anslutningsfel
pool.on('error', (err) => {
	console.error('oväntat fel på idle-klient', err);
	process.exit(-1);
});

// hjälpfunktion för att köra queries
export async function query(text, params) {
	const client = await pool.connect();
	try {
		// kör sql-frågan och returnera resultatet
		const result = await client.query(text, params);
		return result;
	} catch (error) {
		console.error('databasfel:', error);
		throw error;
	} finally {
		// släpp alltid klienten tillbaka till poolen
		client.release();
	}
}

// hjälpfunktion för att köra transaktioner
export async function transaction(callback) {
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const result = await callback(client);
		await client.query('COMMIT');
		return result;
	} catch (e) {
		await client.query('ROLLBACK');
		throw e;
	} finally {
		client.release();
	}
}

// testa anslutningen vid start
pool.query('SELECT NOW()', (err, res) => {
	if (err) {
		console.error('fel vid anslutning till databasen:', err);
	} else {
		console.log('databasanslutning lyckades');
	}
});
