require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const supabase = require('./config/supabase');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/health', async (req, res) => {
  const { error } = await supabase.from('User').select('id').limit(1);
  res.json({
    status: error ? 'error' : 'ok',
    service: 'ITStock API',
    version: '1.0.0',
    database: error ? 'disconnected' : 'connected',
    timestamp: new Date().toISOString()
  });
});

// Validate license
app.post('/api/v1/licenses/validate', async (req, res) => {
  try {
    const { licenseKey, hardwareId } = req.body;
    if (!licenseKey || !hardwareId) {
      return res.status(400).json({ error: 'LICENSE_KEY_AND_HARDWARE_ID_REQUIRED' });
    }

    const { data: license, error } = await supabase
      .from('License')
      .select('*, Plan:planId(*), User:userId(*)')
      .eq('licenseKey', licenseKey)
      .single();

    if (error || !license) {
      return res.status(404).json({ error: 'LICENSE_NOT_FOUND' });
    }

    if (license.status === 'REVOKED') {
      return res.status(403).json({ error: 'LICENSE_REVOKED' });
    }

    if (license.status === 'EXPIRED' || (license.expiresAt && new Date(license.expiresAt) < new Date())) {
      return res.status(403).json({ error: 'LICENSE_EXPIRED' });
    }

    const { data: activations } = await supabase
      .from('Activation')
      .select('*')
      .eq('licenseId', license.id)
      .eq('isActive', true);

    const activeActivations = activations || [];
    const existingActivation = activeActivations.find(a => a.hardwareId === hardwareId);

    if (!existingActivation && activeActivations.length >= license.maxActivations) {
      return res.status(403).json({ 
        error: 'MAX_ACTIVATIONS_REACHED',
        maxActivations: license.maxActivations,
        currentActivations: activeActivations.length
      });
    }

    res.json({
      valid: true,
      license: {
        key: license.licenseKey,
        status: license.status,
        plan: license.Plan?.displayName || 'Unknown',
        maxActivations: license.maxActivations,
        currentActivations: activeActivations.length,
        expiresAt: license.expiresAt
      }
    });
  } catch (err) {
    console.error('Validate error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// Activate license
app.post('/api/v1/licenses/activate', async (req, res) => {
  try {
    const { licenseKey, hardwareId, machineName, ipAddress } = req.body;
    if (!licenseKey || !hardwareId) {
      return res.status(400).json({ error: 'LICENSE_KEY_AND_HARDWARE_ID_REQUIRED' });
    }

    const { data: license } = await supabase
      .from('License')
      .select('*')
      .eq('licenseKey', licenseKey)
      .single();

    if (!license) {
      return res.status(404).json({ error: 'LICENSE_NOT_FOUND' });
    }

    const { data: existing } = await supabase
      .from('Activation')
      .select('*')
      .eq('licenseId', license.id)
      .eq('hardwareId', hardwareId)
      .eq('isActive', true)
      .single();

    if (existing) {
      await supabase
        .from('Activation')
        .update({ lastCheckIn: new Date().toISOString() })
        .eq('id', existing.id);
      return res.json({ success: true, message: 'ALREADY_ACTIVATED', activatedAt: existing.activatedAt });
    }

    const { data: activeActs } = await supabase
      .from('Activation')
      .select('*')
      .eq('licenseId', license.id)
      .eq('isActive', true);

    if (activeActs && activeActs.length >= license.maxActivations) {
      return res.status(403).json({ error: 'MAX_ACTIVATIONS_REACHED' });
    }

    const { data: activation, error } = await supabase
      .from('Activation')
      .insert({
        licenseId: license.id,
        hardwareId,
        machineName: machineName || 'Unknown',
        ipAddress: ipAddress || req.ip,
        lastCheckIn: new Date().toISOString(),
        activatedAt: new Date().toISOString(),
        isActive: true
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'ACTIVATION_FAILED' });
    }

    res.json({ success: true, message: 'ACTIVATED', activatedAt: activation.activatedAt });
  } catch (err) {
    console.error('Activate error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// Deactivate
app.post('/api/v1/licenses/deactivate', async (req, res) => {
  try {
    const { licenseKey, hardwareId } = req.body;
    const { data: license } = await supabase
      .from('License')
      .select('id')
      .eq('licenseKey', licenseKey)
      .single();

    if (!license) return res.status(404).json({ error: 'LICENSE_NOT_FOUND' });

    await supabase
      .from('Activation')
      .update({ isActive: false, deactivatedAt: new Date().toISOString() })
      .eq('licenseId', license.id)
      .eq('hardwareId', hardwareId);

    res.json({ success: true, message: 'DEACTIVATED' });
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// Heartbeat
app.post('/api/v1/licenses/heartbeat', async (req, res) => {
  try {
    const { licenseKey, hardwareId } = req.body;
    const { data: license } = await supabase
      .from('License')
      .select('id')
      .eq('licenseKey', licenseKey)
      .single();

    if (!license) return res.status(404).json({ error: 'LICENSE_NOT_FOUND' });

    await supabase
      .from('Activation')
      .update({ lastCheckIn: new Date().toISOString() })
      .eq('licenseId', license.id)
      .eq('hardwareId', hardwareId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// Auth login
app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { data: user, error } = await supabase
      .from('User')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user || !await bcrypt.compare(password, user.passwordHash)) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// Get plans
app.get('/api/v1/plans', async (req, res) => {
  try {
    const { data: plans, error } = await supabase
      .from('Plan')
      .select('*')
      .eq('isActive', true)
      .order('sortOrder', { ascending: true });

    if (error) return res.status(500).json({ error: 'FETCH_FAILED' });
    res.json({ plans: plans || [] });
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// 404
app.use((req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'INTERNAL_ERROR' });
});

app.listen(PORT, () => {
  console.log(`ITStock API running on port ${PORT}`);
});
