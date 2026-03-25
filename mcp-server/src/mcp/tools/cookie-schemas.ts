import { z } from 'zod';

const partitionKeySchema = z.object({
  topLevelSite: z.string().describe('Top-level site for cookie partitioning (e.g. "https://example.com")'),
  hasCrossSiteAncestor: z.boolean().describe('Whether the cookie has a cross-site ancestor'),
});

export const getCookiesSchema = z.object({
  urls: z.array(z.string()).optional().describe('URLs to get cookies for. Defaults to the current page and all its subframes.'),
});

export const setCookieSchema = z.object({
  name: z.string().describe('Cookie name'),
  value: z.string().describe('Cookie value'),
  url: z.string().min(1).optional().describe('URL to associate with the cookie (sets default domain/path/scheme). Use this OR domain, not both.'),
  domain: z.string().min(1).optional().describe('Cookie domain (e.g. ".example.com"). Use this OR url, not both.'),
  path: z.string().optional().describe('Cookie path, default "/"'),
  secure: z.boolean().optional().describe('Whether the cookie is secure-only'),
  httpOnly: z.boolean().optional().describe('Whether the cookie is HTTP-only (not accessible via JS)'),
  sameSite: z.enum(['Strict', 'Lax', 'None']).optional().describe('SameSite attribute'),
  expires: z.number().optional().describe('Cookie expiration as Unix timestamp in seconds. Omit for session cookie.'),
  partitionKey: partitionKeySchema.optional().describe('Cookie partition key for CHIPS/partitioned cookies (experimental)'),
}).refine(
  (data) => (data.url || data.domain) && !(data.url && data.domain),
  { message: 'Provide either url or domain, not both and not neither' }
);

export const deleteCookiesSchema = z.object({
  name: z.string().describe('Name of the cookies to delete'),
  url: z.string().optional().describe('Delete cookies matching this URL (affects domain and path matching)'),
  domain: z.string().optional().describe('Delete only cookies with this exact domain'),
  path: z.string().optional().describe('Delete only cookies with this exact path'),
  partitionKey: partitionKeySchema.optional().describe('Delete only cookies with this partition key (for CHIPS/partitioned cookies)'),
});
