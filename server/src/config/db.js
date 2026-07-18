require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_DB_HOST,
  user: process.env.PG_DB_USER,
  password: process.env.PG_DB_PASSWORD,
  database: process.env.PG_DB_NAME,
  port: parseInt(process.env.PG_DB_PORT, 10),
  max: parseInt(process.env.PG_DB_LIMIT, 10),
  idleTimeoutMillis: parseInt(process.env.PG_IDLETIMEOUTMILLIS, 10),
  connectionTimeoutMillis: 5000,
  ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error("❌ Unexpected error on DB_Connection:", err);
});

module.exports = pool;