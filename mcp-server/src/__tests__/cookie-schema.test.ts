import { describe, it, expect } from 'bun:test';
import { getCookiesSchema, setCookieSchema, deleteCookiesSchema } from '../mcp/tools/cookie-schemas.js';

describe('browser_set_cookie schema', () => {
  it('accepts url without domain', () => {
    const result = setCookieSchema.safeParse({
      name: 'session',
      value: 'abc123',
      url: 'https://example.com',
    });
    expect(result.success).toBe(true);
  });

  it('accepts domain without url', () => {
    const result = setCookieSchema.safeParse({
      name: 'session',
      value: 'abc123',
      domain: '.example.com',
    });
    expect(result.success).toBe(true);
  });

  it('rejects when both url and domain are provided', () => {
    const result = setCookieSchema.safeParse({
      name: 'session',
      value: 'abc123',
      url: 'https://example.com',
      domain: '.example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects when neither url nor domain is provided', () => {
    const result = setCookieSchema.safeParse({
      name: 'session',
      value: 'abc123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty-string url', () => {
    const result = setCookieSchema.safeParse({
      name: 'session',
      value: 'abc123',
      url: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty-string domain', () => {
    const result = setCookieSchema.safeParse({
      name: 'session',
      value: 'abc123',
      domain: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing name', () => {
    const result = setCookieSchema.safeParse({
      value: 'abc123',
      url: 'https://example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing value', () => {
    const result = setCookieSchema.safeParse({
      name: 'session',
      url: 'https://example.com',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all optional fields', () => {
    const result = setCookieSchema.safeParse({
      name: 'session',
      value: 'abc123',
      domain: '.example.com',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
      expires: 1800000000,
    });
    expect(result.success).toBe(true);
  });

  it('accepts partitionKey', () => {
    const result = setCookieSchema.safeParse({
      name: 'session',
      value: 'abc123',
      domain: '.example.com',
      partitionKey: {
        topLevelSite: 'https://toplevel.com',
        hasCrossSiteAncestor: false,
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid sameSite value', () => {
    const result = setCookieSchema.safeParse({
      name: 'session',
      value: 'abc123',
      url: 'https://example.com',
      sameSite: 'Invalid',
    });
    expect(result.success).toBe(false);
  });
});

describe('browser_delete_cookies schema', () => {
  it('accepts name only', () => {
    const result = deleteCookiesSchema.safeParse({ name: 'session' });
    expect(result.success).toBe(true);
  });

  it('accepts name with domain and path', () => {
    const result = deleteCookiesSchema.safeParse({
      name: 'session',
      domain: '.example.com',
      path: '/',
    });
    expect(result.success).toBe(true);
  });

  it('accepts partitionKey', () => {
    const result = deleteCookiesSchema.safeParse({
      name: 'session',
      partitionKey: {
        topLevelSite: 'https://toplevel.com',
        hasCrossSiteAncestor: true,
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = deleteCookiesSchema.safeParse({ domain: '.example.com' });
    expect(result.success).toBe(false);
  });
});

describe('browser_get_cookies schema', () => {
  it('accepts empty object', () => {
    const result = getCookiesSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts urls array', () => {
    const result = getCookiesSchema.safeParse({
      urls: ['https://example.com', 'https://other.com'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty urls array (treated same as omitting urls by CDP)', () => {
    const result = getCookiesSchema.safeParse({ urls: [] });
    expect(result.success).toBe(true);
  });
});
