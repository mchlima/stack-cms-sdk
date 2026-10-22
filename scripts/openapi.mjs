/**
 * The contract of the Delivery API, cut from the `openapi.json` of the stack-cms-api (RS-02, CS-01).
 *
 *   node scripts/openapi.mjs sync [url or file]   writes openapi/delivery.json
 *   node scripts/openapi.mjs check [url or file]  fails when openapi/delivery.json differs from it
 *
 * Without a source, the published API (`CMS_OPENAPI_URL` or production). The check only warns when the API
 * cannot be reached (before the first deploy, or offline): it never passes with a different contract.
 */
import { readFile, writeFile } from 'node:fs/promises';

const PUBLISHED = process.env.CMS_OPENAPI_URL ?? 'https://cms-api.stack201.com.br/openapi.json';
const FILE = new URL('../openapi/delivery.json', import.meta.url);

async function load(source) {
  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) {
      throw new Error(`${source} respondeu ${response.status}`);
    }
    return response.json();
  }
  return JSON.parse(await readFile(source, 'utf8'));
}

/** The names of the schemas a value points to, with `$ref`. */
function refsOf(value, found = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((item) => refsOf(item, found));
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key === '$ref' && typeof item === 'string') {
        found.add(item.replace('#/components/schemas/', ''));
      } else {
        refsOf(item, found);
      }
    }
  }
  return found;
}

/** Schemas the sites need besides the routes: what a notice of the CMS brings (RS-09). */
const EXTRA = ['SitePayload'];

/** Only the Delivery API: its routes, the schemas they reach and the `deliveryKey`. */
function deliveryOnly(document) {
  const paths = Object.fromEntries(
    Object.entries(document.paths).filter(([path]) => path.startsWith('/delivery/')),
  );
  const all = document.components.schemas;
  const keep = new Set();
  const pending = [...refsOf(paths), ...EXTRA];
  while (pending.length > 0) {
    const name = pending.pop();
    if (!keep.has(name) && all[name]) {
      keep.add(name);
      pending.push(...refsOf(all[name]));
    }
  }
  return {
    openapi: document.openapi,
    info: { ...document.info, title: 'Stack CMS Delivery API' },
    servers: document.servers,
    paths,
    components: {
      schemas: Object.fromEntries([...keep].sort().map((name) => [name, all[name]])),
      securitySchemes: { deliveryKey: document.components.securitySchemes.deliveryKey },
    },
  };
}

const text = (document) => `${JSON.stringify(document, null, 2)}\n`;

const [command, source = PUBLISHED] = process.argv.slice(2);

if (command === 'sync') {
  await writeFile(FILE, text(deliveryOnly(await load(source))));
  console.log(`openapi/delivery.json atualizado a partir de ${source}. Rode pnpm generate.`);
} else if (command === 'check') {
  let published;
  try {
    published = deliveryOnly(await load(source));
  } catch (error) {
    console.warn(
      `Aviso: não deu para ler ${source} (${error.message}); a conferência ficou para depois.`,
    );
    process.exit(0);
  }
  if (text(published) !== (await readFile(FILE, 'utf8'))) {
    console.error(
      `openapi/delivery.json não bate com ${source}. Rode pnpm openapi:sync e pnpm generate (CS-01).`,
    );
    process.exit(1);
  }
  console.log(`openapi/delivery.json bate com ${source}.`);
} else {
  console.error('Use: node scripts/openapi.mjs sync|check [url ou arquivo]');
  process.exit(2);
}
