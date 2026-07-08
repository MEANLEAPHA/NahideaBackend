const mysql = require('mysql2/promise');
require('dotenv').config();

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

// const mysql = require('mysql2/promise');
// require('dotenv').config();

// const pool = mysql.createPool({
//   host: process.env.DB_HOST,
//   user: process.env.DB_USER,
//   password: process.env.DB_PASSWORD,
//   database: process.env.DB_NAME,
//   port: process.env.DB_PORT,

//   waitForConnections: true,
//   connectionLimit: 2,
//   queueLimit: 0,

//   connectTimeout: 30000,     
//   enableKeepAlive: true,     
//   keepAliveInitialDelay: 0   
// });


// module.exports = pool; 
