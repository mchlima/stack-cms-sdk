import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  CmsWebhookError,
  menuChangeOf,
  verifyCmsWebhook,
  verifyCmsWebhookBody,
} from './webhooks.js';
import type { SitePayload } from './types.js';

const SECRET = `whsec_${Buffer.from('segredo do webhook').toString('base64')}`;
const BODY = JSON.stringify({
  id: '0192f0a0-0000-7000-8000-000000000001',
  type: 'post.published',
  occurredAt: '2026-10-22T10:00:00.000Z',
  space: { id: '0192f0a0-0000-7000-8000-000000000002', slug: 'blog' },
  data: {},
  paths: ['/blog/core-web-vitals'],
  urls: ['https://www.cliente.com.br/blog/core-web-vitals'],
});
const NOW = 1_790_000_000_000;

/** Signs as the API does (stack-cms-api, src/security/signature.ts). */
function sign(secret: string, id: string, timestamp: number, body: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  return `v1,${createHmac('sha256', key)
    .update(`${id}.${String(timestamp)}.${body}`)
    .digest('base64')}`;
}

const headersAt = (seconds: number, secret = SECRET, body = BODY) => ({
  's201-id': 'delivery-1',
  's201-timestamp': String(seconds),
  's201-signature': sign(secret, 'delivery-1', seconds, body),
  's201-event': 'post.published',
});

describe('verifyCmsWebhook (RS-09)', () => {
  it('accepts a notice signed by the CMS and gives the event', async () => {
    const request = new Request('https://www.cliente.com.br/api/cms', {
      method: 'POST',
      body: BODY,
      headers: headersAt(NOW / 1000),
    });
    const event = await verifyCmsWebhook(request, SECRET, { now: NOW });
    expect(event.type).toBe('post.published');
    expect(event.paths).toEqual(['/blog/core-web-vitals']);
  });

  it('CS-07: refuses a wrong signature, an altered body and a notice out of the 5 minutes', async () => {
    const reasonOf = (promise: Promise<unknown>) =>
      promise.then(
        () => 'accepted',
        (error: unknown) => (error instanceof CmsWebhookError ? error.reason : 'other'),
      );
    const other = `whsec_${Buffer.from('outro segredo').toString('base64')}`;
    expect(
      await reasonOf(
        verifyCmsWebhookBody(BODY, headersAt(NOW / 1000, other), SECRET, { now: NOW }),
      ),
    ).toBe('bad_signature');
    expect(
      await reasonOf(
        verifyCmsWebhookBody(BODY.replace('blog', 'outro'), headersAt(NOW / 1000), SECRET, {
          now: NOW,
        }),
      ),
    ).toBe('bad_signature');
    expect(
      await reasonOf(verifyCmsWebhookBody(BODY, headersAt(NOW / 1000 - 301), SECRET, { now: NOW })),
    ).toBe('stale');
    expect(await reasonOf(verifyCmsWebhookBody(BODY, {}, SECRET, { now: NOW }))).toBe(
      'missing_headers',
    );
  });

  it('takes any of the signatures sent, as when the secret is being changed', async () => {
    const headers = headersAt(NOW / 1000);
    headers['s201-signature'] = `v1,AAAA ${headers['s201-signature']}`;
    await expect(verifyCmsWebhookBody(BODY, headers, SECRET, { now: NOW })).resolves.toMatchObject({
      type: 'post.published',
    });
  });
});

describe('menuChangeOf (RS-17)', () => {
  const event = (type: SitePayload['type'], data: Record<string, unknown>): SitePayload => ({
    id: 'e1',
    type,
    occurredAt: '2026-10-23T10:00:00.000Z',
    space: { id: 's1', slug: 'blog' },
    data,
    paths: [],
    urls: [],
  });

  it('reads the menu of a menu.updated notice, renamed or deleted', () => {
    expect(
      menuChangeOf(event('menu.updated', { menuId: 'm1', key: 'topo', previousKey: 'principal' })),
    ).toEqual({
      menuId: 'm1',
      key: 'topo',
      previousKey: 'principal',
      deleted: false,
      reason: 'menu',
    });
    expect(
      menuChangeOf(event('menu.updated', { menuId: 'm1', key: 'topo', deleted: true })),
    ).toEqual({ menuId: 'm1', key: 'topo', previousKey: null, deleted: true, reason: 'menu' });
    // A page it shows changed (RN-55 of the API).
    expect(
      menuChangeOf(event('menu.updated', { menuId: 'm1', key: 'topo', reason: 'pages' }))?.reason,
    ).toBe('pages');
  });

  it('is null for any other notice', () => {
    expect(menuChangeOf(event('redirects.updated', {}))).toBeNull();
  });
});
