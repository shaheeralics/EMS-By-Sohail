const db = require('./db');

async function setupDatabase() {
    try {
        console.log('Connected to PostgreSQL (PGlite). Initializing tables...');

        // 1. API Settings
        await db.execute(`
            CREATE TABLE IF NOT EXISTS api_settings (
                id SERIAL PRIMARY KEY,
                meta_token TEXT,
                meta_phone_id TEXT,
                meta_verify_token TEXT,
                meta_waba_id TEXT,
                meta_app_id TEXT,
                meta_app_secret TEXT,
                llm_api_key TEXT,
                shopify_url TEXT,
                shopify_token TEXT,
                shopify_webhook_secret TEXT,
                webhook_url TEXT,
                voice_policy_url TEXT
            )
        `);
        await db.execute(`INSERT INTO api_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);

        // 2. Products
        await db.execute(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                brand TEXT,
                gender TEXT NOT NULL,
                size TEXT,
                size_original TEXT,
                size_uk TEXT,
                size_eu TEXT,
                size_cn TEXT,
                color TEXT,
                description TEXT,
                source TEXT NOT NULL,
                main_image_url TEXT,
                extra_image_urls JSONB,
                video_url TEXT,
                voice_note_url TEXT,
                starting_price DECIMAL(10, 2) NOT NULL,
                minimum_price DECIMAL(10, 2) NOT NULL,
                status TEXT DEFAULT 'available',
                shopify_product_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 3. Conversations
        await db.execute(`
            CREATE TABLE IF NOT EXISTS conversations (
                id SERIAL PRIMARY KEY,
                customer_phone TEXT NOT NULL UNIQUE,
                customer_name TEXT,
                status TEXT DEFAULT 'agent_active',
                known_slots JSONB,
                profile_picture TEXT,
                selected_product_id INTEGER,
                current_offer DECIMAL(10, 2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (selected_product_id) REFERENCES products(id) ON DELETE SET NULL
            )
        `);

        // 4. Messages
        await db.execute(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                conversation_id INTEGER NOT NULL,
                sender TEXT NOT NULL,
                type TEXT NOT NULL,
                text_content TEXT,
                media_url TEXT,
                voice_transcript TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            )
        `);

        // 5. Agent Config
        await db.execute(`
            CREATE TABLE IF NOT EXISTS agent_config (
                id SERIAL PRIMARY KEY,
                system_prompt TEXT NOT NULL
            )
        `);
        await db.execute(`
            INSERT INTO agent_config (id, system_prompt) 
            VALUES (1, 'You are a helpful AI assistant for Pawanda e-commerce.')
            ON CONFLICT (id) DO NOTHING
        `);

        // 6. Orders
        await db.execute(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                conversation_id INTEGER,
                product_id INTEGER,
                custom_product_name TEXT,
                customer_name TEXT NOT NULL,
                customer_phone TEXT NOT NULL,
                address TEXT,
                city TEXT,
                zip_code TEXT,
                price DECIMAL(10, 2),
                status TEXT DEFAULT 'pending',
                payment_status TEXT DEFAULT 'Pending',
                payment_method TEXT DEFAULT 'COD',
                delivery_method TEXT DEFAULT 'Standard',
                delivery_fee DECIMAL(10, 2),
                items JSONB,
                timeline JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
            )
        `);

        // 7. Policies
        await db.execute(`
            CREATE TABLE IF NOT EXISTS policies (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 8. Order Notes
        await db.execute(`
            CREATE TABLE IF NOT EXISTS order_notes (
                id SERIAL PRIMARY KEY,
                order_id INTEGER,
                note TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
            )
        `);
        
        // 9. Order Attachments
        await db.execute(`
            CREATE TABLE IF NOT EXISTS order_attachments (
                id SERIAL PRIMARY KEY,
                order_id INTEGER,
                type TEXT,
                file_url TEXT,
                file_name TEXT,
                file_type TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
            )
        `);
        
        // 10. Predefined Voices
        await db.execute(`
            CREATE TABLE IF NOT EXISTS predefined_voices (
                id SERIAL PRIMARY KEY,
                name TEXT,
                media_url TEXT,
                mime_type TEXT,
                duration INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('All tables created successfully.');
        await db.end();
    } catch (e) {
        console.error('Database setup failed:', e.message);
    }
}

setupDatabase();
