const mysql = require('mysql2/promise');
require('dotenv').config();

async function seed() {
    try {
        const db = await mysql.createPool({
            host: '127.0.0.1',
            user: 'root',
            password: '',
            database: 'ecomerce_automation',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });

        // Check if there are any conversations
        const [rows] = await db.execute('SELECT COUNT(*) as cnt FROM conversations');
        if (rows[0].cnt > 0) {
            console.log('Database already has conversations.');
            return;
        }

        console.log('Seeding dummy conversations...');
        
        // Seed customer 1
        const knownSlots1 = JSON.stringify({ name: 'Alice Smith', address: '123 Main St, Springfield' });
        const [c1] = await db.execute(
            'INSERT INTO conversations (customer_phone, customer_name, status, known_slots) VALUES (?, ?, ?, ?)',
            ['+1234567890', 'Alice Smith', 'agent_active', knownSlots1]
        );
        const convId1 = c1.insertId;
        
        await db.execute('INSERT INTO messages (conversation_id, sender, type, text_content, created_at) VALUES (?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL 2 HOUR))', [convId1, 'customer', 'text', 'Hi, I need help with my order.']);
        await db.execute('INSERT INTO messages (conversation_id, sender, type, text_content, created_at) VALUES (?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL 1 HOUR))', [convId1, 'agent', 'text', 'Hello Alice! I am the AI assistant. Please provide your order number.']);
        await db.execute('INSERT INTO messages (conversation_id, sender, type, text_content, created_at) VALUES (?, ?, ?, ?, NOW())', [convId1, 'customer', 'text', 'My order number is 21.']);

        // Seed customer 2
        const knownSlots2 = JSON.stringify({ name: 'Bob Jones', address: '456 Elm St, Shelbyville' });
        const [c2] = await db.execute(
            'INSERT INTO conversations (customer_phone, customer_name, status, known_slots) VALUES (?, ?, ?, ?)',
            ['+9876543210', 'Bob Jones', 'closed', knownSlots2]
        );
        const convId2 = c2.insertId;

        await db.execute('INSERT INTO messages (conversation_id, sender, type, text_content, created_at) VALUES (?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL 1 DAY))', [convId2, 'customer', 'text', 'Do you have the red shoes in size 10?']);
        await db.execute('INSERT INTO messages (conversation_id, sender, type, text_content, created_at) VALUES (?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL 23 HOUR))', [convId2, 'agent', 'text', 'Yes, we do! You can order them from our catalog.']);

        // Seed customer 3
        const knownSlots3 = JSON.stringify({ name: 'Charlie Brown' });
        const [c3] = await db.execute(
            'INSERT INTO conversations (customer_phone, customer_name, status, known_slots) VALUES (?, ?, ?, ?)',
            ['+1122334455', 'Charlie Brown', 'human_takeover', knownSlots3]
        );
        const convId3 = c3.insertId;

        await db.execute('INSERT INTO messages (conversation_id, sender, type, text_content, created_at) VALUES (?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL 30 MINUTE))', [convId3, 'customer', 'text', 'I want to speak to a human.']);
        await db.execute('INSERT INTO messages (conversation_id, sender, type, text_content, created_at) VALUES (?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL 25 MINUTE))', [convId3, 'agent', 'text', 'Transferring you to a human agent...']);
        await db.execute('INSERT INTO messages (conversation_id, sender, type, text_content, created_at) VALUES (?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL 10 MINUTE))', [convId3, 'human', 'text', 'Hi Charlie, how can I help you today?']);

        console.log('Seeded successfully.');
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}

seed();
