import { createCmsClient } from '../client.js';

/** A Delivery API in memory: each path answers what `routes` says; the rest is a 404 of the API. */
export function fakeApi(routes: Record<string, () => Response>) {
  const calls: string[] = [];
  const fetch = ((input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const path = url.pathname.replace('/delivery/v1', '') + url.search;
    calls.push(path);
    const route = routes[path] ?? routes[url.pathname.replace('/delivery/v1', '')];
    return Promise.resolve(
      route?.() ??
        Response.json(
          { error: { code: 'NOT_FOUND', message: 'Não encontramos.', details: {} } },
          { status: 404 },
        ),
    );
  }) as typeof globalThis.fetch;
  return { client: createCmsClient({ apiKey: 'scms_dlv_test', fetch }), calls };
}

export const text = (body: string, type: string) =>
  new Response(body, { headers: { 'Content-Type': type } });
