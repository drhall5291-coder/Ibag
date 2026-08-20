const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle DB client', err);
});

// Runs a query as a given DB role, using SET LOCAL ROLE inside a transaction.
// Required because Supavisor doesn't reliably auth custom login roles directly —
// we connect as postgres and switch role per-transaction instead.
async function queryAsRole(role, text, params) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    const result = await client.query(text, params);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, queryAsRole };
