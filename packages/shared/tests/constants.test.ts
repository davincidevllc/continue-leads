import { describe, it, expect } from 'vitest';
import {
  LeadStatus,
  TERMINAL_LEAD_STATUSES,
  LAUNCH_METROS,
  LAUNCH_VERTICALS,
  STALENESS_SLA_SECONDS,
  DEFAULT_DEDUPE_WINDOW_DAYS,
  AUCTION_TIMEOUT_MS,
  MAX_AUCTION_ATTEMPTS,
  CONSENT_ENTITY_NAME,
} from '../src';

describe('shared constants', () => {
  it('has 5 launch metros', () => {
    expect(LAUNCH_METROS).toHaveLength(5);
  });

  it('launch metros have correct slugs', () => {
    const slugs = LAUNCH_METROS.map((m) => m.slug);
    expect(slugs).toContain('boston-ma');
    expect(slugs).toContain('dallas-tx');
    expect(slugs).toContain('houston-tx');
    expect(slugs).toContain('atlanta-ga');
    expect(slugs).toContain('miami-fl');
  });

  it('has 3 launch verticals', () => {
    expect(LAUNCH_VERTICALS).toHaveLength(3);
  });

  it('staleness SLA is 15 minutes', () => {
    expect(STALENESS_SLA_SECONDS).toBe(900);
  });

  it('default dedupe window is 7 days', () => {
    expect(DEFAULT_DEDUPE_WINDOW_DAYS).toBe(7);
  });

  it('auction timeout is 5 seconds', () => {
    expect(AUCTION_TIMEOUT_MS).toBe(5000);
  });

  it('max auction attempts is 3', () => {
    expect(MAX_AUCTION_ATTEMPTS).toBe(3);
  });

  it('consent entity is Continue Leads LLC', () => {
    expect(CONSENT_ENTITY_NAME).toBe('Continue Leads LLC');
  });

  it('terminal statuses include SOLD, REJECTED, EXPIRED, UNSOLD', () => {
    expect(TERMINAL_LEAD_STATUSES.has(LeadStatus.SOLD)).toBe(true);
    expect(TERMINAL_LEAD_STATUSES.has(LeadStatus.REJECTED)).toBe(true);
    expect(TERMINAL_LEAD_STATUSES.has(LeadStatus.EXPIRED)).toBe(true);
    expect(TERMINAL_LEAD_STATUSES.has(LeadStatus.UNSOLD)).toBe(true);
    expect(TERMINAL_LEAD_STATUSES.has(LeadStatus.NEW)).toBe(false);
  });
});
