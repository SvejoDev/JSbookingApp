// src/lib/db/index.js
import pkg from 'pg';
const { Pool } = pkg;
import { env } from '$env/dynamic/private';

// Create a connection pool
const pool = new Pool({
	user: env.POSTGRES_USER,
	host: env.POSTGRES_HOST,
	database: env.POSTGRES_DATABASE,
	password: env.POSTGRES_PASSWORD,
	port: parseInt(env.POSTGRES_PORT),
	max: 20, // Maximum number of clients in the pool
	idleTimeoutMillis: 30000,
	connectionTimeoutMillis: 2000
});

// Error handling for the pool
pool.on('error', (err, client) => {
	console.error('Unexpected error on idle client', err);
});

/**
 * Execute a query with error handling
 * @param {string} text - The SQL query text
 * @param {Array} params - The query parameters
 */
export async function query(text, params) {
	const client = await pool.connect();
	try {
		const result = await client.query(text, params);
		return { rows: result.rows, rowCount: result.rowCount };
	} catch (err) {
		console.error('Database query error:', err);
		throw err;
	} finally {
		client.release();
	}
}

/**
 * Execute a transaction with error handling
 * @param {Function} callback - Transaction callback function
 */
export async function transaction(callback) {
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const result = await callback(client);
		await client.query('COMMIT');
		return result;
	} catch (err) {
		await client.query('ROLLBACK');
		throw err;
	} finally {
		client.release();
	}
}
