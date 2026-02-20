import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const pool: any = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'continueleads',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: { rejectUnauthorized: false },
});

// ─── Rate Limiting (in-memory) ───
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10; // 10 requests per minute per IP
const ipRequestLog = new Map<string, number[]>();

// Clean up stale entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [ip, timestamps] of ipRequestLog.entries()) {
    const filtered = timestamps.filter(t => t > cutoff);
    if (filtered.length === 0) ipRequestLog.delete(ip);
    else ipRequestLog.set(ip, filtered);
  }
}, 5 * 60 * 1000);

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (ipRequestLog.get(ip) || []).filter(t => t > cutoff);
  timestamps.push(now);
  ipRequestLog.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

// ─── CORS Allowlist ───
function getAllowedOrigins(): string[] | null {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw || raw.trim() === '' || raw.trim() === '*') return null; // null = allow all (staging fallback)
  return raw.split(',').map(o => o.trim().toLowerCase()).filter(Boolean);
}

function isOriginAllowed(origin: string | null): boolean {
  const allowed = getAllowedOrigins();
  if (!allowed) return true; // no allowlist configured = allow all (staging)
  if (!origin) return false; // no origin header + allowlist configured = reject
  return allowed.some(a => origin.toLowerCase() === a || origin.toLowerCase().endsWith('.' + a.replace(/^https?:\/\//, '')));
}

function corsHeaders(origin?: string | null) {
  const allowed = getAllowedOrigins();
  const allowOrigin = allowed ? (origin && isOriginAllowed(origin) ? origin : 'null') : '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

// ─── Encryption ───
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const DEFAULT_DEDUPE_WINDOW_DAYS = 7;

function getEncryptionKey(): Buffer {
  const hex = process.env.PII_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) throw new Error('PII_ENCRYPTION_KEY missing or invalid');
  return Buffer.from(hex, 'hex');
}

function encrypt(plaintext: string): Buffer {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

function hashValue(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

// ─── Validation ───
function validate(body: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!body.phone || typeof body.phone !== 'string') errors.push('phone is required');
  if (!body.first_name || typeof body.first_name !== 'string') errors.push('first_name is required');
  if (!body.last_name || typeof body.last_name !== 'string') errors.push('last_name is required');
  if (!body.zip || typeof body.zip !== 'string') errors.push('zip is required');
  if (!body.category_slug || typeof body.category_slug !== 'string') errors.push('category_slug is required');
  if (!body.service_slug || typeof body.service_slug !== 'string') errors.push('service_slug is required');
  if (body.tcpa_consent !== true) errors.push('tcpa_consent must be true');
  if (!body.consent_text || typeof body.consent_text !== 'string') errors.push('consent_text is required');
  if (!body.consent_text_version || typeof body.consent_text_version !== 'string') errors.push('consent_text_version is required');
  if (!body.domain || typeof body.domain !== 'string') errors.push('domain is required');
  if (!body.page_url || typeof body.page_url !== 'string') errors.push('page_url is required');
  if (body.phone) {
    const digits = body.phone.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 11) errors.push('phone must be 10-11 digits');
  }
  if (body.zip && !/^\d{5}$/.test(body.zip)) errors.push('zip must be 5 digits');
  return { valid: errors.length === 0, errors };
}

// ─── OPTIONS (CORS preflight) ───
export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin');
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

// ─── POST /api/leads/capture ───
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const headers = corsHeaders(origin);

  // CORS check
  if (!isOriginAllowed(origin) && getAllowedOrigins() !== null) {
    return NextResponse.json({ error: 'Origin not allowed' }, { status: 403, headers });
  }

  // Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip') || 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers });
  }

  const client = await pool.connect();

  try {
    const body = await request.json();

    // Honeypot check — hidden field "website" should be empty
    if (body.website && body.website.trim() !== '') {
      // Bot detected — return fake success, store nothing
      return NextResponse.json({
        success: true,
        lead_id: crypto.randomUUID(),
        status: 'NEW',
        dedupe_hit: false,
      }, { status: 201, headers });
    }

    const { valid, errors } = validate(body);
    if (!valid) {
      return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400, headers });
    }

    if (body.idempotency_key) {
      const existing = await client.query(
        'SELECT id FROM leads WHERE idempotency_key = $1',
        [body.idempotency_key]
      );
      if (existing.rows.length > 0) {
        return NextResponse.json({
          success: true, lead_id: existing.rows[0].id, dedupe_hit: false, message: 'Duplicate submission (idempotency)'
        }, { status: 200, headers });
      }
    }

    const categoryResult = await client.query(
      'SELECT id FROM categories WHERE slug = $1', [body.category_slug]
    );
    if (categoryResult.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid category_slug' }, { status: 400, headers });
    }
    const categoryId = categoryResult.rows[0].id;

    const serviceResult = await client.query(
      'SELECT id FROM services WHERE slug = $1 AND category_id = $2',
      [body.service_slug, categoryId]
    );
    if (serviceResult.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid service_slug for this category' }, { status: 400, headers });
    }
    const serviceId = serviceResult.rows[0].id;

    const siteResult = await client.query('SELECT id FROM sites WHERE domain = $1', [body.domain]);
    const siteId = siteResult.rows.length > 0 ? siteResult.rows[0].id : null;

    const userAgent = request.headers.get('user-agent') || null;

    const phoneDigits = body.phone.replace(/\D/g, '');
    const phoneEncrypted = encrypt(phoneDigits);
    const phoneHash = hashValue(phoneDigits);
    const firstNameEncrypted = encrypt(body.first_name);
    const lastNameEncrypted = encrypt(body.last_name);
    const emailEncrypted = body.email ? encrypt(body.email) : null;
    const emailHash = body.email ? hashValue(body.email) : null;

    await client.query('BEGIN');

    let dedupeHit = false;
    const now = new Date();
    const dedupeWindowDays = DEFAULT_DEDUPE_WINDOW_DAYS;
    const windowEnd = new Date(now.getTime() + dedupeWindowDays * 24 * 60 * 60 * 1000);

    const dedupeCheck = await client.query(
      `SELECT lead_id FROM lead_dedupe_claims 
       WHERE claim_hash = $1 AND claim_type = 'phone'
       AND window_start <= $2 AND window_end >= $2`,
      [phoneHash, now]
    );
    if (dedupeCheck.rows.length > 0) dedupeHit = true;

    if (emailHash) {
      const emailDedupeCheck = await client.query(
        `SELECT lead_id FROM lead_dedupe_claims 
         WHERE claim_hash = $1 AND claim_type = 'email'
         AND window_start <= $2 AND window_end >= $2`,
        [emailHash, now]
      );
      if (emailDedupeCheck.rows.length > 0) dedupeHit = true;
    }

    const leadStatus = dedupeHit ? 'REJECTED' : 'NEW';
    const rejectionReason = dedupeHit ? 'dedupe_hit' : null;

    const leadResult = await client.query(
      `INSERT INTO leads (
        site_id, idempotency_key, status, rejection_reason, dedupe_hit,
        category_id, service_id,
        urgency, property_type, project_size_bucket, budget_range, timeframe_days,
        targeting_mode, zip, metro_slug
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING id`,
      [siteId, body.idempotency_key || null, leadStatus, rejectionReason, dedupeHit,
       categoryId, serviceId, body.urgency || null, body.property_type || null,
       body.project_size_bucket || null, body.budget_range || null, body.timeframe_days || null,
       'METRO', body.zip, null]
    );
    const leadId = leadResult.rows[0].id;

    await client.query(
      `INSERT INTO lead_contacts (lead_id, phone_encrypted, email_encrypted,
        first_name_encrypted, last_name_encrypted, phone_hash, email_hash, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [leadId, phoneEncrypted, emailEncrypted, firstNameEncrypted, lastNameEncrypted,
       phoneHash, emailHash, ip, userAgent]
    );

    await client.query(
      `INSERT INTO lead_consents (lead_id, tcpa_consent, consent_text, consent_text_version, ip_address)
       VALUES ($1,$2,$3,$4,$5)`,
      [leadId, true, body.consent_text, body.consent_text_version, ip]
    );

    await client.query(
      `INSERT INTO lead_attributions (lead_id, domain, page_url, page_type,
        utm_source, utm_medium, utm_campaign, utm_term, utm_content)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [leadId, body.domain, body.page_url, body.page_type || '',
       body.utm_source || null, body.utm_medium || null,
       body.utm_campaign || null, body.utm_term || null, body.utm_content || null]
    );

    if (body.responses && Object.keys(body.responses).length > 0) {
      await client.query(
        'INSERT INTO lead_details (lead_id, responses) VALUES ($1, $2)',
        [leadId, JSON.stringify(body.responses)]
      );
    }

    if (!dedupeHit) {
      await client.query(
        `INSERT INTO lead_dedupe_claims (lead_id, claim_hash, claim_type, window_start, window_end)
         VALUES ($1, $2, 'phone', $3, $4)`,
        [leadId, phoneHash, now, windowEnd]
      );
      if (emailHash) {
        await client.query(
          `INSERT INTO lead_dedupe_claims (lead_id, claim_hash, claim_type, window_start, window_end)
           VALUES ($1, $2, 'email', $3, $4)`,
          [leadId, emailHash, now, windowEnd]
        );
      }
    }

    await client.query(
      `INSERT INTO lead_status_events (lead_id, from_status, to_status, reason)
       VALUES ($1, NULL, $2, $3)`,
      [leadId, leadStatus, dedupeHit ? 'Dedupe hit — not eligible for distribution' : 'New lead captured']
    );

    await client.query('COMMIT');

    return NextResponse.json({
      success: true, lead_id: leadId,
      status: leadStatus,
      dedupe_hit: dedupeHit,
    }, { status: dedupeHit ? 200 : 201, headers });

  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Lead capture error:', error);

    if (error.code === '23P01') {
      return NextResponse.json({
        error: 'Duplicate lead detected', dedupe_hit: true
      }, { status: 409, headers });
    }

    return NextResponse.json({
      error: 'Internal server error',
    }, { status: 500, headers });
  } finally {
    client.release();
  }
}
