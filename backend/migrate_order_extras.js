const db = require('./db');

(async () => {
    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS order_notes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_id INT NOT NULL,
                note TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
            )
        `);
        console.log('order_notes table OK');

        await db.execute(`
            CREATE TABLE IF NOT EXISTS order_attachments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_id INT NOT NULL,
                type VARCHAR(50) DEFAULT 'additional',
                file_url VARCHAR(512) NOT NULL,
                file_name VARCHAR(255),
                file_type VARCHAR(100),
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
            )
        `);
        console.log('order_attachments table OK');

        try {
            await db.execute('ALTER TABLE orders ADD COLUMN customer_note TEXT');
            console.log('customer_note column added');
        } catch (e) {
            console.log('customer_note already exists (ok)');
        }

        console.log('Migration complete');
        process.exit(0);
    } catch (e) {
        console.error('Migration error:', e.message);
        process.exit(1);
    }
})();
