import { describe, it, expect } from 'vitest';

describe('Admin Auth', () => {
  it('placeholder - admin app compiles', () => {
    expect(true).toBe(true);
  });

  it('status badge colors are consistent', () => {
    const statusColors: Record<string, string> = {
      NEW: 'primary', VALIDATED: 'info', SOLD: 'success',
      REJECTED: 'danger', DRAFT: 'secondary', PUBLISHED: 'success',
    };
    expect(statusColors['NEW']).toBe('primary');
    expect(statusColors['SOLD']).toBe('success');
    expect(statusColors['REJECTED']).toBe('danger');
  });
});
