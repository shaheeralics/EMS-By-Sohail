const express = require('express');
const router = express.Router();
const db = require('../../db');

// Get API settings from DB
router.get('/settings', async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM api_settings WHERE id = 1');
        if (rows.length > 0) {
            res.json({
                metaToken: rows[0].meta_token || '',
                metaPhoneId: rows[0].meta_phone_id || '',
                metaWabaId: rows[0].meta_waba_id || '',
                metaAppId: rows[0].meta_app_id || '',
                metaAppSecret: rows[0].meta_app_secret || '',
                metaVerifyToken: rows[0].meta_verify_token || '',
                llmApiKey: rows[0].llm_api_key || '',
                shopifyUrl: rows[0].shopify_url || '',
                shopifyToken: rows[0].shopify_token || '',
                shopifyWebhookSecret: rows[0].shopify_webhook_secret || '',
                webhookUrl: rows[0].webhook_url || ''
            });
        } else {
            res.json({});
        }
    } catch (e) {
        res.status(500).json({ error: 'Database connection failed' });
    }
});

// Save API settings to DB
router.post('/settings', async (req, res) => {
    const data = req.body;
    console.log("Received data for settings:", data);
    try {
        // Upsert data
        await db.execute(`
            INSERT INTO api_settings (id, meta_token, meta_phone_id, meta_waba_id, meta_app_id, meta_app_secret, meta_verify_token, llm_api_key, shopify_url, shopify_token, shopify_webhook_secret, webhook_url) 
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                meta_token = VALUES(meta_token),
                meta_phone_id = VALUES(meta_phone_id),
                meta_waba_id = VALUES(meta_waba_id),
                meta_app_id = VALUES(meta_app_id),
                meta_app_secret = VALUES(meta_app_secret),
                meta_verify_token = VALUES(meta_verify_token),
                llm_api_key = VALUES(llm_api_key),
                shopify_url = VALUES(shopify_url),
                shopify_token = VALUES(shopify_token),
                shopify_webhook_secret = VALUES(shopify_webhook_secret),
                webhook_url = VALUES(webhook_url)
        `, [
            data.metaToken || '', 
            data.metaPhoneId || '', 
            data.metaWabaId || '', 
            data.metaAppId || '', 
            data.metaAppSecret || '', 
            data.metaVerifyToken || '', 
            data.llmApiKey || '', 
            data.shopifyUrl || '', 
            data.shopifyToken || '', 
            data.shopifyWebhookSecret || '',
            data.webhookUrl || ''
        ]);

        res.status(200).json({ message: 'Settings saved to MySQL database' });
    } catch (e) {
        console.error("Database Error:", e);
        res.status(500).json({ error: 'Failed to write to database' });
    }
});

// Get all products
router.get('/products', async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM products ORDER BY created_at DESC');
        res.json({ data: rows });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

// Get all conversations
router.get('/conversations', async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM conversations ORDER BY updated_at DESC');
        res.json({ data: rows });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});

// Get messages for a specific conversation
router.get('/conversations/:id/messages', async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC', [req.params.id]);
        res.json({ data: rows });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Update conversation status (e.g., Takeover Chat)
router.put('/conversations/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        await db.execute('UPDATE conversations SET status = ? WHERE id = ?', [status, req.params.id]);
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update conversation status' });
    }
});

// Send manual reply (human takeover)
router.post('/conversations/:id/reply', async (req, res) => {
    try {
        const { type, content, mediaUrl } = req.body;
        const [convRows] = await db.execute('SELECT customer_phone FROM conversations WHERE id = ?', [req.params.id]);
        if (convRows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
        
        const phone = convRows[0].customer_phone;
        const metaApi = require('../whatsapp/metaApi');
        
        // Save to DB
        await db.execute(
            'INSERT INTO messages (conversation_id, sender, type, text_content, media_url) VALUES (?, ?, ?, ?, ?)',
            [req.params.id, 'human', type, content || null, mediaUrl || null]
        );
        
        // Send to WhatsApp
        if (type === 'text') {
            await metaApi.sendTextMessage(phone, content);
        } else {
            await metaApi.sendMediaMessage(phone, type, mediaUrl, content);
        }
        
        // Ensure status is human_takeover
        await db.execute('UPDATE conversations SET status = "human_takeover" WHERE id = ?', [req.params.id]);
        
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to send reply' });
    }
});

// Get agent config
router.get('/agent-config', async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM agent_config WHERE id = 1');
        if (rows.length > 0) {
            res.json({ success: true, data: rows[0] });
        } else {
            res.json({ success: true, data: { system_prompt: '' } });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: 'Failed to fetch agent config' });
    }
});

// Save agent config
router.post('/agent-config', async (req, res) => {
    try {
        const { system_prompt } = req.body;
        await db.execute(`
            INSERT INTO agent_config (id, system_prompt) VALUES (1, ?)
            ON DUPLICATE KEY UPDATE system_prompt = VALUES(system_prompt)
        `, [system_prompt || '']);
        res.json({ success: true, message: 'Agent config saved' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: 'Failed to save agent config' });
    }
});

module.exports = router;
