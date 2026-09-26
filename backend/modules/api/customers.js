const express = require('express');
const router = express.Router();
const db = require('../../db');

// GET all customers
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                o.customer_phone as phone,
                MAX(o.customer_name) as name,
                MAX(o.address) as address,
                MAX(o.city) as city,
                COUNT(o.id) as total_orders,
                SUM(o.price) as total_spent,
                MAX(o.created_at) as last_order_date,
                MAX(c.profile_picture) as profile_picture
            FROM orders o
            LEFT JOIN conversations c ON o.customer_phone = c.customer_phone
            WHERE o.customer_phone IS NOT NULL AND o.customer_phone != ''
            GROUP BY o.customer_phone
            ORDER BY last_order_date DESC
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Failed to fetch customers:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch customers' });
    }
});

// PUT update customer
router.put('/:phone', async (req, res) => {
    const phone = req.params.phone;
    const { name, address, city, profile_picture } = req.body;
    
    try {
        // Update in orders
        await db.execute(`
            UPDATE orders 
            SET customer_name = COALESCE($1, customer_name), 
                address = COALESCE($2, address), 
                city = COALESCE($3, city)
            WHERE customer_phone = $4
        `, [name, address, city, phone]);

        // Update in conversations (for name and profile picture)
        // If a conversation doesn't exist, this just safely ignores.
        await db.execute(`
            UPDATE conversations
            SET customer_name = COALESCE($1, customer_name),
                profile_picture = COALESCE($2, profile_picture)
            WHERE customer_phone = $3
        `, [name, profile_picture, phone]);
        
        // Also if we want to insert profile_picture into a non-existent conversation, it's fine to just ignore, 
        // since customer lists are generated from orders mostly.

        res.json({ success: true, message: 'Customer updated successfully' });
    } catch (err) {
        console.error('Failed to update customer:', err);
        res.status(500).json({ success: false, error: 'Failed to update customer' });
    }
});

// GET customer order history
router.get('/:phone/orders', async (req, res) => {
    const phone = req.params.phone;
    try {
        const [orders] = await db.query(`
            SELECT id, custom_product_name, price, status, items, created_at
            FROM orders
            WHERE customer_phone = $1
            ORDER BY created_at DESC
        `, [phone]);
        
        // Also get first order date (join date)
        const [joinDateResult] = await db.query(`
            SELECT MIN(created_at) as join_date
            FROM orders
            WHERE customer_phone = $1
        `, [phone]);
        
        res.json({ 
            success: true, 
            data: {
                orders,
                join_date: joinDateResult.length > 0 ? joinDateResult[0].join_date : null
            }
        });
    } catch (err) {
        console.error('Failed to fetch customer orders:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch customer orders' });
    }
});

module.exports = router;
