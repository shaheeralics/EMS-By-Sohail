const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../../db');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../../uploads/voices');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, 'voice_' + Date.now() + '.wav');
    }
});

const upload = multer({ storage });

// Get all predefined voices
router.get('/', async (req, res) => {
        try {
            const [rows] = await db.query('SELECT * FROM predefined_voices ORDER BY created_at DESC');
            res.json({ success: true, data: rows });
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, message: 'Database error' });
        }
    });

    // Create new predefined voice
    router.post('/', upload.single('audio'), async (req, res) => {
        try {
            const { name, duration } = req.body;
            if (!req.file) return res.status(400).json({ success: false, message: 'Audio file is required' });
            
            const media_url = `/uploads/voices/${req.file.filename}`;
            const [result] = await db.query(
                'INSERT INTO predefined_voices (name, media_url, mime_type, duration) VALUES (?, ?, ?, ?)',
                [name || 'Unnamed Voice', media_url, 'audio/wav', duration || 0]
            );
            
            res.json({ success: true, id: result.insertId, media_url });
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, message: 'Database error' });
        }
    });

    // Update predefined voice (edit name or replace audio)
    router.put('/:id', upload.single('audio'), async (req, res) => {
        try {
            const { id } = req.params;
            const { name, duration } = req.body;
            
            if (req.file) {
                const media_url = `/uploads/voices/${req.file.filename}`;
                await db.query(
                    'UPDATE predefined_voices SET name = ?, media_url = ?, duration = ? WHERE id = ?',
                    [name, media_url, duration || 0, id]
                );
            } else {
                await db.query(
                    'UPDATE predefined_voices SET name = ? WHERE id = ?',
                    [name, id]
                );
            }
            
            res.json({ success: true });
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, message: 'Database error' });
        }
    });

    // Delete predefined voice
    router.delete('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const [rows] = await db.query('SELECT media_url FROM predefined_voices WHERE id = ?', [id]);
            if (rows.length > 0 && rows[0].media_url) {
                const filepath = path.join(__dirname, '../../', rows[0].media_url);
                if (fs.existsSync(filepath)) {
                    fs.unlinkSync(filepath);
                }
            }
            await db.query('DELETE FROM predefined_voices WHERE id = ?', [id]);
            res.json({ success: true });
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, message: 'Database error' });
        }
    });

module.exports = router;
