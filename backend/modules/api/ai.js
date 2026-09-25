const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const db = require('../../db');

// Helper to get OpenAI client using the API key from DB or ENV
async function getOpenAIClient() {
    let apiKey = process.env.LLM_API_KEY;
    if (!apiKey) {
        const [rows] = await db.query('SELECT llm_api_key FROM api_settings WHERE id = 1');
        if (rows.length && rows[0].llm_api_key) {
            apiKey = rows[0].llm_api_key;
        }
    }
    if (!apiKey) {
        throw new Error('OpenAI API key not found in settings or environment');
    }
    return new OpenAI({
        apiKey: apiKey,
    });
}

// Generate Policy Document
router.post('/generate-policy', async (req, res) => {
    try {
        const { draft } = req.body;
        if (!draft) return res.status(400).json({ error: 'Draft content required' });

        const openai = await getOpenAIClient();
        const prompt = `You are a legal document generator for an e-commerce business. 
The user has provided a short, rough policy rule. Expand it into a formal, professional, legal-sounding policy paragraph suitable for an official knowledge base or Terms of Service. Do not include introductory/outro text, just the policy itself.

Short rule: "${draft}"
Formal Document:`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Fallback to faster model
            messages: [{ role: "user", content: prompt }],
        });

        res.json({ success: true, text: completion.choices[0].message.content });
    } catch (error) {
        console.error('Error generating policy:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Generate Invoice Note
router.post('/generate-invoice', async (req, res) => {
    try {
        const { customer_name, customer_phone, address, city, zip_code, product_title, custom_product_name, price } = req.body;
        
        const openai = await getOpenAIClient();
        const productName = custom_product_name || product_title || 'Custom Request';
        const fullAddress = `${address}, ${city || ''} ${zip_code || ''}`.trim();

        const prompt = `You are a polite AI assistant generating a personalized thank-you note and shipping instructions for an invoice.
Customer Name: ${customer_name || 'Customer'}
Customer Phone: ${customer_phone}
Shipping Address: ${fullAddress}
Product: ${productName}
Total Price: Rs ${price}

Generate a short, very warm and professional 2-3 sentence thank you note addressing the customer by name (if available), thanking them for purchasing the specific product, and mentioning that it will be shipped to their address shortly.`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
        });

        res.json({ success: true, text: completion.choices[0].message.content });
    } catch (error) {
        console.error('Error generating invoice note:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
