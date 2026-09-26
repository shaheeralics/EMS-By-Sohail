require('dotenv').config();
const express = require('express');
const cors = require('cors');

const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Setup simple health check
app.get('/', (req, res) => {
  res.send('Pawanda Backend Running');
});

// Import modules
const whatsappRoutes = require('./modules/whatsapp');
const shopifyRoutes = require('./modules/shopify');
const apiRoutes = require('./modules/api');
const productRoutes = require('./modules/api/products');
const orderRoutes = require('./modules/api/orders');
const policyRoutes = require('./modules/api/policies');
const aiRoutes = require('./modules/api/ai');
const analyticsRoutes = require('./modules/api/analytics');
const predefinedVoicesRoutes = require('./modules/api/predefined_voices');
const customerRoutes = require('./modules/api/customers');

app.use('/webhook/whatsapp', whatsappRoutes);
app.use('/api/listings', shopifyRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/predefined-voices', predefinedVoicesRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api', apiRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);
  
  // Automate cloudflared tunnel and verify token generation
  try {
    const db = require('./db');
    const { spawn } = require('child_process');
    
    // 1. Generate verify token if missing
    const [rows] = await db.execute('SELECT meta_verify_token FROM api_settings WHERE id = 1');
    let verifyToken = rows[0]?.meta_verify_token;
    if (!verifyToken) {
      verifyToken = 'pawanda_verify_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      await db.execute('UPDATE api_settings SET meta_verify_token = ? WHERE id = 1', [verifyToken]);
      console.log('Generated new Verify Token:', verifyToken);
    }

    // 2. Start cloudflared
    const cloudflared = spawn('npx', ['cloudflared', 'tunnel', '--url', `http://localhost:${PORT}`], { shell: true });
    
    cloudflared.stderr.on('data', async (data) => {
      const output = data.toString();
      // Match trycloudflare.com URL
      const match = output.match(/(https:\/\/[a-zA-Z0-9]+-[a-zA-Z0-9-]+\.trycloudflare\.com)/);
      if (match && match[1]) {
        const webhookUrl = match[1] + '/webhook/whatsapp';
        console.log('Cloudflare Tunnel URL detected:', webhookUrl);
        // Save to DB
        await db.execute('UPDATE api_settings SET webhook_url = ? WHERE id = 1', [webhookUrl]);
      }
    });

    cloudflared.on('close', (code) => {
      console.log(`cloudflared exited with code ${code}`);
    });

  } catch (err) {
    console.error('Failed to setup tunnel automation:', err);
  }
});
