require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Debug env vars
console.log('🔍 ENV VARS DEBUG:');
console.log('PORT:', process.env.PORT);
console.log('SUPABASE_URL exists:', !!process.env.SUPABASE_URL);
if (process.env.SUPABASE_URL) console.log('SUPABASE_URL starts with:', process.env.SUPABASE_URL.substring(0, 15) + '...');
console.log('SUPABASE_SERVICE_ROLE_KEY exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
if (process.env.SUPABASE_SERVICE_ROLE_KEY) console.log('SUPABASE_SERVICE_ROLE_KEY length:', process.env.SUPABASE_SERVICE_ROLE_KEY.length);
console.log('JWT_SECRET exists:', !!process.env.JWT_SECRET);
console.log('--- Process check ---');
console.log('Variables available in process.env:', Object.keys(process.env).filter(k => k.includes('SUPABASE') || k === 'PORT' || k === 'JWT_SECRET'));

let supabase;
try {
  supabase = require('./config/supabase');
} catch (err) {
  console.error('❌ Failed to load Supabase:', err.message);
  supabase = null;
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(express.json({ limit: '1mb' }));

// Check Supabase availability for API routes (except health)
app.use('/api', (req, res, next) => {
  if (!supabase) {
    return res.status(503).json({ 
      error: 'SERVICE_UNAVAILABLE',
      message: 'Database not configured. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.'
    });
  }
  next();
});

// Health check
app.get('/health', async (req, res) => {
  if (!supabase) {
    return res.json({
      status: 'error',
      service: 'ITStock API',
      version: '1.0.0',
      database: 'not_configured',
      error: 'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquants',
      timestamp: new Date().toISOString()
    });
  }
  try {
    const { error } = await supabase.from('User').select('id').limit(1);
    res.json({
      status: error ? 'error' : 'ok',
      service: 'ITStock API',
      version: '1.0.0',
      database: error ? 'disconnected' : 'connected',
      error: error?.message,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.json({
      status: 'error',
      service: 'ITStock API',
      version: '1.0.0',
      database: 'error',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
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

// ============================================
// STRIPE WEBHOOK HANDLER
// ============================================
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.post('/api/v1/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    console.log('✅ Stripe webhook received:', event.type);
  } catch (err) {
    console.error('❌ Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      console.log('💰 Payment successful for session:', session.id);
      
      // Create license after successful payment
      try {
        const { planId, seats, userId } = session.metadata || {};
        
        // Generate license key
        const licenseKey = 'ITSTOCK-' + crypto.randomBytes(12).toString('hex').toUpperCase().match(/.{4}/g).join('-');
        
        // Insert license into database
        const { data: license, error } = await supabase
          .from('License')
          .insert({
            licenseKey,
            planId: planId ? parseInt(planId) : 1,
            userId: userId ? parseInt(userId) : null,
            maxActivations: seats ? parseInt(seats) : 1,
            status: 'ACTIVE',
            stripePaymentId: session.payment_intent,
            expiresAt: null // Perpetual for now
          })
          .select()
          .single();

        if (error) {
          console.error('❌ Failed to create license:', error);
        } else {
          console.log('✅ License created:', licenseKey);
          
          // TODO: Send email with license key to customer
          // This would integrate with your email service
        }
      } catch (err) {
        console.error('❌ Error creating license:', err);
      }
      break;
    }
    
    case 'invoice.payment_failed': {
      const session = event.data.object;
      console.log('❌ Payment failed:', session.id);
      // Handle failed payment
      break;
    }
    
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});

// Create Stripe checkout session
app.post('/api/v1/create-checkout-session', async (req, res) => {
  try {
    const { planId, seats, userId, email } = req.body;
    
    // Get plan details from database
    const { data: plan } = await supabase
      .from('Plan')
      .select('*')
      .eq('id', planId)
      .single();
    
    if (!plan) {
      return res.status(404).json({ error: 'PLAN_NOT_FOUND' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: `ITStock CRM - ${plan.displayName}`,
            description: `${seats} poste(s) - Licence perpétuelle`,
          },
          unit_amount: plan.price * 100, // Convert to cents
        },
        quantity: seats,
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL || 'https://itstock.tech'}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'https://itstock.tech'}/cancel`,
      customer_email: email,
      metadata: {
        planId,
        seats,
        userId
      }
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: 'STRIPE_ERROR', message: err.message });
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
