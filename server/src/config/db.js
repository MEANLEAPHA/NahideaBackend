require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_DB_HOST,
  user: process.env.PG_DB_USER,                          
  password: process.env.PG_DB_PASSWORD,       
  database: process.env.PG_DB_NAME,                        
  port:  process.env.PG_DB_PORT,                                
  max: process.env.PG_DB_LIMIT,                                  
  idleTimeoutMillis: process.env.PG_IDLETIMEOUTMILLIS,
  ssl: { rejectUnauthorized: false }  
});


pool.on('error', (err) => {
  console.error("❌ Unexpected error on DB_Connection:", err);
});

module.exports = pool;

