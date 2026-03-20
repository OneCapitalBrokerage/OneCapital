// Routes/kiteAuthRoute.js
import express from 'express';
import crypto from 'crypto';
import KiteCredential from '../Model/KiteCredentialModel.js';
import { getFeedInstance } from '../services/feedState.js';
import { publishCredentialsUpdated } from '../sockets/io.js';

const router = express.Router();

// Get login URL - redirect user to this for Kite login
router.get('/login-url', async (req, res) => {
  try {
    const apiKey = process.env.KITE_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'KITE_API_KEY not configured in environment'
      });
    }

    const loginUrl = `https://kite.zerodha.com/connect/login?v=3&api_key=${apiKey}`;

    res.json({
      success: true,
      loginUrl,
      message: 'Redirect user to this URL for Kite login'
    });
  } catch (error) {
    console.error('[KiteAuth] Error generating login URL:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Redirect endpoint - User lands here after Kite login
// Your registered redirect URL should point here: http://localhost:8080/api/kite/callback
router.get('/callback', async (req, res) => {
  try {
    const { request_token, status } = req.query;

    if (status === 'error' || !request_token) {
      return res.status(400).send(`
        <html>
          <head><title>Kite Login Failed</title></head>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h1 style="color: #e74c3c;">❌ Login Failed</h1>
            <p>Kite login was cancelled or failed.</p>
            <p><a href="/api/kite/login-url">Try Again</a></p>
          </body>
        </html>
      `);
    }

    const apiKey = process.env.KITE_API_KEY;
    const apiSecret = process.env.KITE_API_SECRET;

    if (!apiKey || !apiSecret) {
      return res.status(500).send(`
        <html>
          <head><title>Configuration Error</title></head>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h1 style="color: #e74c3c;">❌ Configuration Error</h1>
            <p>KITE_API_KEY or KITE_API_SECRET not configured.</p>
          </body>
        </html>
      `);
    }

    // Generate checksum: SHA256(api_key + request_token + api_secret)
    const checksum = crypto
      .createHash('sha256')
      .update(apiKey + request_token + apiSecret)
      .digest('hex');

    // Exchange request_token for access_token
    const response = await fetch('https://api.kite.trade/session/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Kite-Version': '3'
      },
      body: new URLSearchParams({
        api_key: apiKey,
        request_token: request_token,
        checksum: checksum
      })
    });

    const data = await response.json();

    if (data.status !== 'success') {
      console.error('[KiteAuth] Token exchange failed:', data);
      return res.status(400).send(`
        <html>
          <head><title>Token Exchange Failed</title></head>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h1 style="color: #e74c3c;">❌ Token Exchange Failed</h1>
            <p>${data.message || 'Unknown error'}</p>
            <p><a href="/api/kite/login-url">Try Again</a></p>
          </body>
        </html>
      `);
    }

    const tokenData = data.data;

    // Calculate token expiry (6 AM next day)
    const now = new Date();
    const expiry = new Date(now);
    expiry.setDate(expiry.getDate() + 1);
    expiry.setHours(6, 0, 0, 0);

    // Save to database (upsert - update or insert)
    await KiteCredential.findOneAndUpdate(
      { api_key: apiKey },
      {
        api_key: apiKey,
        api_secret: apiSecret,
        access_token: tokenData.access_token,
        public_token: tokenData.public_token,
        user_id: tokenData.user_id,
        broker: tokenData.broker,
        login_time: new Date(tokenData.login_time),
        token_expiry: expiry,
        is_active: true
      },
      { upsert: true, new: true }
    );

    // Update environment variable in memory for current session
    process.env.KITE_ACCESS_TOKEN = tokenData.access_token;

    console.log(`[KiteAuth] ✅ Token obtained for user ${tokenData.user_id}`);
    console.log(`[KiteAuth]    Access Token: ${tokenData.access_token.substring(0, 10)}...`);
    console.log(`[KiteAuth]    Expires: ${expiry.toISOString()}`);

    // Trigger WebSocket reconnection with new credentials
    const feedInstance = getFeedInstance();
    if (feedInstance && typeof feedInstance.reconnectWithNewCredentials === 'function') {
      // Normal mode: direct call to local feed instance
      console.log('[KiteAuth] 🔄 Triggering WebSocket reconnection with new token...');
      feedInstance.reconnectWithNewCredentials().catch(err => {
        console.error('[KiteAuth] WebSocket reconnect failed:', err.message);
      });
    } else {
      // Split mode: publish signal to worker via Redis
      console.log('[KiteAuth] 📡 No local feed instance, publishing credentials_updated to worker...');
      publishCredentialsUpdated().catch(err => {
        console.error('[KiteAuth] Failed to publish credentials_updated:', err.message);
      });
    }

    // Return success page with token info
    res.send(`
      <html>
        <head>
          <title>Kite Login Successful</title>
          <style>
            body { font-family: Arial; padding: 40px; max-width: 600px; margin: 0 auto; }
            .success { color: #27ae60; }
            .info { background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .token { font-family: monospace; word-break: break-all; background: #fff; padding: 10px; border: 1px solid #ddd; }
            .warning { color: #e67e22; font-size: 14px; }
          </style>
        </head>
        <body>
          <h1 class="success">✅ Kite Login Successful!</h1>
          <div class="info">
            <p><strong>User ID:</strong> ${tokenData.user_id}</p>
            <p><strong>Broker:</strong> ${tokenData.broker}</p>
            <p><strong>Login Time:</strong> ${tokenData.login_time}</p>
            <p><strong>Token Expires:</strong> ${expiry.toLocaleString()} IST</p>
          </div>
          <h3>Access Token:</h3>
          <div class="token">${tokenData.access_token}</div>
          <p class="warning">⚠️ Token is valid until 6 AM tomorrow. You'll need to login again after that.</p>
          <p>The server will automatically use this token for WebSocket connections.</p>
          <p style="color: #27ae60;">✅ <strong>WebSocket reconnection triggered automatically.</strong> No restart needed.</p>
          <br>
          <p><a href="/api/kite/status">Check Token Status</a></p>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('[KiteAuth] Callback error:', error);
    res.status(500).send(`
      <html>
        <head><title>Error</title></head>
        <body style="font-family: Arial; padding: 40px; text-align: center;">
          <h1 style="color: #e74c3c;">❌ Error</h1>
          <p>${error.message}</p>
        </body>
      </html>
    `);
  }
});

// Get current token status
router.get('/status', async (req, res) => {
  try {
    const credential = await KiteCredential.findOne({ is_active: true }).lean();

    if (!credential) {
      return res.json({
        success: true,
        status: 'NO_TOKEN',
        message: 'No active Kite credentials found. Please login.',
        loginUrl: `/api/kite/login-url`
      });
    }

    const now = new Date();
    const isExpired = credential.token_expiry && new Date(credential.token_expiry) < now;
    const hoursRemaining = credential.token_expiry
      ? Math.max(0, (new Date(credential.token_expiry) - now) / (1000 * 60 * 60)).toFixed(1)
      : 0;

    res.json({
      success: true,
      status: isExpired ? 'EXPIRED' : 'VALID',
      user_id: credential.user_id,
      login_time: credential.login_time,
      token_expiry: credential.token_expiry,
      hours_remaining: parseFloat(hoursRemaining),
      is_expired: isExpired,
      access_token_preview: credential.access_token
        ? `${credential.access_token.substring(0, 10)}...`
        : null,
      message: isExpired
        ? 'Token expired. Please login again.'
        : `Token valid for ${hoursRemaining} more hours.`
    });

  } catch (error) {
    console.error('[KiteAuth] Status check error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get access token from database (for internal use)
router.get('/token', async (req, res) => {
  try {
    const credential = await KiteCredential.findOne({ is_active: true }).lean();

    if (!credential || !credential.access_token) {
      return res.status(404).json({
        success: false,
        error: 'No active access token found'
      });
    }

    const isExpired = credential.token_expiry && new Date(credential.token_expiry) < new Date();

    if (isExpired) {
      return res.status(401).json({
        success: false,
        error: 'Access token expired',
        loginUrl: `/api/kite/login-url`
      });
    }

    res.json({
      success: true,
      access_token: credential.access_token,
      user_id: credential.user_id,
      expires_at: credential.token_expiry
    });

  } catch (error) {
    console.error('[KiteAuth] Token fetch error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Logout - invalidate access token
router.post('/logout', async (req, res) => {
  try {
    const credential = await KiteCredential.findOne({ is_active: true });

    if (!credential || !credential.access_token) {
      return res.json({ success: true, message: 'No active session to logout' });
    }

    const apiKey = process.env.KITE_API_KEY;

    // Invalidate token on Kite's end
    try {
      await fetch(`https://api.kite.trade/session/token?api_key=${apiKey}&access_token=${credential.access_token}`, {
        method: 'DELETE',
        headers: { 'X-Kite-Version': '3' }
      });
    } catch (e) {
      console.warn('[KiteAuth] Failed to invalidate token on Kite server:', e.message);
    }

    // Clear local token
    credential.access_token = null;
    credential.is_active = false;
    await credential.save();

    process.env.KITE_ACCESS_TOKEN = '';

    res.json({
      success: true,
      message: 'Logged out successfully',
      note: 'User will need to login again for WebSocket access'
    });

  } catch (error) {
    console.error('[KiteAuth] Logout error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// AUTO-LOGIN ENDPOINTS
// ═══════════════════════════════════════════════════════════════

import {
  runAutoLogin,
  setupAutoLoginCredentials,
  isAutoLoginConfigured,
  encrypt
} from '../services/AutoLoginService.js';

// Update active Kite credentials and auto-login secrets
// POST /api/kite/credentials/update
// Body: { user_id, kite_password, api_key, api_secret, totp_secret }
router.post('/credentials/update', async (req, res) => {
  try {
    const { user_id, kite_password, api_key, api_secret, totp_secret } = req.body;

    if (!user_id || !kite_password || !api_key || !api_secret || !totp_secret) {
      return res.status(400).json({
        success: false,
        error: 'user_id, kite_password, api_key, api_secret, and totp_secret are required'
      });
    }

    const activeCredential = await KiteCredential
      .findOne({ is_active: true })
      .sort({ updatedAt: -1, createdAt: -1 });

    const update = {
      user_id: String(user_id).trim(),
      api_key: String(api_key).trim(),
      api_secret: String(api_secret).trim(),
      kite_password: encrypt(String(kite_password)),
      totp_secret: encrypt(String(totp_secret).replace(/\s+/g, '').toUpperCase()),
      auto_login_enabled: true,
      auto_login_error: null,
      is_active: true,
      access_token: null,
      public_token: null,
      login_time: null,
      token_expiry: null
    };

    let credential;

    if (activeCredential) {
      credential = await KiteCredential.findByIdAndUpdate(
        activeCredential._id,
        update,
        { new: true }
      );
    } else {
      credential = await KiteCredential.create(update);
    }

    // Keep a single active credential so downstream findOne({ is_active: true })
    // reads the rotated record instead of an older stale one.
    await KiteCredential.updateMany(
      { _id: { $ne: credential._id }, is_active: true },
      { is_active: false }
    );

    // Keep the current process aligned with the rotated Zerodha app.
    process.env.KITE_API_KEY = credential.api_key;
    process.env.KITE_API_SECRET = credential.api_secret;
    process.env.KITE_ACCESS_TOKEN = '';

    res.json({
      success: true,
      message: 'Kite credentials updated successfully',
      note: 'Access and public tokens were cleared. Trigger auto-login or manual login to regenerate them.',
      credential: {
        id: credential._id,
        user_id: credential.user_id,
        api_key_preview: `${credential.api_key.substring(0, 6)}...`,
        auto_login_enabled: credential.auto_login_enabled,
        tokens_cleared: true
      }
    });

  } catch (error) {
    console.error('[KiteAuth] Credential update error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Setup auto-login credentials
// POST /api/kite/auto-login/setup
// Body: { password: "...", totp_secret: "..." }
router.post('/auto-login/setup', async (req, res) => {
  try {
    const { password, totp_secret } = req.body;

    if (!password || !totp_secret) {
      return res.status(400).json({
        success: false,
        error: 'Both password and totp_secret are required'
      });
    }

    const result = await setupAutoLoginCredentials(password, totp_secret);

    res.json({
      success: true,
      message: 'Auto-login credentials saved successfully',
      note: 'Credentials are encrypted with AES-256-GCM'
    });

  } catch (error) {
    console.error('[KiteAuth] Auto-login setup error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Trigger auto-login manually
// POST /api/kite/auto-login/trigger
router.post('/auto-login/trigger', async (req, res) => {
  try {
    console.log('[KiteAuth] Manual auto-login triggered');

    const result = await runAutoLogin();

    if (result.success) {
      res.json({
        success: true,
        message: 'Auto-login successful!',
        user_id: result.user_id,
        token_expiry: result.token_expiry,
        note: 'WebSocket has been reconnected with new token'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || result.reason || 'Auto-login failed'
      });
    }

  } catch (error) {
    console.error('[KiteAuth] Auto-login trigger error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check auto-login status
// GET /api/kite/auto-login/status
router.get('/auto-login/status', async (req, res) => {
  try {
    const status = await isAutoLoginConfigured();

    res.json({
      success: true,
      ...status
    });

  } catch (error) {
    console.error('[KiteAuth] Auto-login status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Enable/disable auto-login
// POST /api/kite/auto-login/toggle
router.post('/auto-login/toggle', async (req, res) => {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'enabled must be a boolean'
      });
    }

    await KiteCredential.updateOne(
      { is_active: true },
      { auto_login_enabled: enabled }
    );

    res.json({
      success: true,
      message: `Auto-login ${enabled ? 'enabled' : 'disabled'}`,
      auto_login_enabled: enabled
    });

  } catch (error) {
    console.error('[KiteAuth] Auto-login toggle error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Force WebSocket to reconnect with fresh credentials from DB
// POST /api/kite/websocket/reconnect
router.post('/websocket/reconnect', async (req, res) => {
  try {
    console.log('[KiteAuth] 🔄 Manual WebSocket reconnect requested');

    const feedInstance = getFeedInstance();

    if (feedInstance && typeof feedInstance.reconnectWithNewCredentials === 'function') {
      // Normal mode: direct call to local feed instance
      console.log('[KiteAuth] Triggering direct WebSocket reconnection...');
      await feedInstance.reconnectWithNewCredentials();
      
      return res.json({
        success: true,
        message: 'WebSocket reconnection triggered successfully',
        mode: 'direct'
      });
    } else {
      // Split mode: publish signal to worker via Redis
      console.log('[KiteAuth] No local feed instance, publishing to worker...');
      const published = await publishCredentialsUpdated();
      
      return res.json({
        success: published,
        message: published
          ? 'Reconnection signal sent to worker'
          : 'No feed instance available and Redis publish failed',
        mode: 'redis'
      });
    }

  } catch (error) {
    console.error('[KiteAuth] WebSocket reconnect error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

