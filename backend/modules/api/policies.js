const express = require('express');
const router = express.Router();
const db = require('../../db');
const multer = require('multer');
const path = require('path');

// Multer setup for voice uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../../uploads'));
    },
    filename: function (req, file, cb) {
        cb(null, 'voice_policy_' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Upload Voice Policy
router.post('/voice', upload.single('audio'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No audio file provided' });
    
    const voiceUrl = '/uploads/' + req.file.filename;
    try {
        await db.execute('UPDATE api_settings SET voice_policy_url = ? WHERE id = 1', [voiceUrl]);
        res.json({ success: true, url: voiceUrl });
    } catch (error) {
        console.error('Error saving voice policy:', error);
        res.status(500).json({ success: false, error: 'Failed to save voice policy' });
    }
});


// Delete Voice Policy
router.delete('/voice', async (req, res) => {
    try {
        await db.execute('UPDATE api_settings SET voice_policy_url = NULL WHERE id = 1');
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting voice policy:', error);
        res.status(500).json({ success: false, error: 'Failed to delete voice policy' });
    }
});

// Get Voice Policy URL
router.get('/voice', async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT voice_policy_url FROM api_settings WHERE id = 1');
        res.json({ success: true, url: rows[0]?.voice_policy_url || null });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch voice policy' });
    }
});

// Get all policies (text)
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM policies ORDER BY created_at DESC');
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching policies:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch policies' });
    }
});

// Create a policy (text)
router.post('/', async (req, res) => {
    const { title, content } = req.body;
    try {
        const [result] = await db.execute(`
            INSERT INTO policies (title, content) VALUES (?, ?)
        `, [title, content]);
        res.json({ success: true, id: result.insertId });
    } catch (error) {
        console.error('Error creating policy:', error);
        res.status(500).json({ success: false, error: 'Failed to create policy' });
    }
});

// Delete a policy (text)
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.execute('DELETE FROM policies WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting policy:', error);
        res.status(500).json({ success: false, error: 'Failed to delete policy' });
    }
});

module.exports = router;
