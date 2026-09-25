const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    let conn;
    if (process.env.DATABASE_URL) {
        conn = await mysql.createConnection(process.env.DATABASE_URL);
    } else {
        conn = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'pawanda'
        });
    }
    
    await conn.query(`
        CREATE TABLE IF NOT EXISTS predefined_voices (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            media_url VARCHAR(500) NOT NULL,
            mime_type VARCHAR(100) DEFAULT 'audio/wav',
            duration INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('Table created');
    process.exit(0);
}
run().catch(console.error);
