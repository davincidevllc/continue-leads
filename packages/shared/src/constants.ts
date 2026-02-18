import { Vertical } from './enums';

// ─── Launch Configuration ───

export const LAUNCH_METROS = [
  { name: 'Boston', state: 'MA', slug: 'boston-ma', priority: 1 },
  { name: 'Dallas', state: 'TX', slug: 'dallas-tx', priority: 2 },
  { name: 'Houston', state: 'TX', slug: 'houston-tx', priority: 3 },
  { name: 'Atlanta', state: 'GA', slug: 'atlanta-ga', priority: 4 },
  { name: 'Miami', state: 'FL', slug: 'miami-fl', priority: 5 },
] as const;

export const LAUNCH_VERTICALS = [
  {
    name: 'Interior Painting',
    slug: Vertical.INTERIOR_PAINTING,
    dedupeWindowDays: 7,
  },
  {
    name: 'Residential Cleaning',
    slug: Vertical.RESIDENTIAL_CLEANING,
    dedupeWindowDays: 7,
  },
  {
    name: 'Siding',
    slug: Vertical.SIDING,
    dedupeWindowDays: 7,
  },
] as const;

// ─── Lead Pipeline ───

/** Maximum age (in seconds) before a lead is too stale to auction */
export const STALENESS_SLA_SECONDS = 15 * 60; // 15 minutes

/** Default dedupe window in days */
export const DEFAULT_DEDUPE_WINDOW_DAYS = 7;

// ─── Auction (Phase 3 values, locked now) ───

/** Buyer bid timeout in milliseconds */
export const AUCTION_TIMEOUT_MS = 5_000;

/** Maximum auction retry attempts before UNSOLD */
export const MAX_AUCTION_ATTEMPTS = 3;

/** Number of buyers pinged per lead */
export const MAX_BUYERS_PINGED = 3;

// ─── Compliance ───

/** Legal entity name for TCPA consent text */
export const CONSENT_ENTITY_NAME = 'Continue Leads LLC';

/** Default consent text (v1) */
export const DEFAULT_CONSENT_TEXT =
  'By submitting this form, I consent to being contacted by Continue Leads LLC ' +
  'and its partners by phone, text, or email regarding my service request. ' +
  'I understand that my consent is not a condition of purchase. ' +
  'Message and data rates may apply.';

export const DEFAULT_CONSENT_TEXT_VERSION = '1.0';

// ─── Rate Limiting ───

/** Max form submissions per IP per minute */
export const RATE_LIMIT_PER_IP_PER_MINUTE = 5;

/** Max form submissions per site per minute */
export const RATE_LIMIT_PER_SITE_PER_MINUTE = 30;
