#!/usr/bin/env node
/// <reference types="node" />
/**
 * RS-14: `npx cms-sdk blocks-types [--out arquivo] [--base-url url]` writes the types of the blocks of the
 * space, from `space.customBlocks` of the Delivery API. The key comes from `CMS_DELIVERY_KEY`.
 */
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { createCmsClient } from './client.js';
import { blockTypes } from './content/typings.js';

const USAGE = `Uso: cms-sdk blocks-types [--out arquivo.ts] [--base-url url] [--name NomeDaInterface]

Escreve os tipos dos atributos de cada bloco do space, lidos da Delivery API.
A chave vem da variável de ambiente CMS_DELIVERY_KEY (e o endereço da API, de CMS_BASE_URL).`;

async function main(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o' },
      'base-url': { type: 'string' },
      name: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help || positionals[0] !== 'blocks-types') {
    console.log(USAGE);
    return values.help ? 0 : 1;
  }
  const apiKey = process.env.CMS_DELIVERY_KEY;
  if (!apiKey) {
    console.error('Defina a chave da Delivery API em CMS_DELIVERY_KEY.');
    return 1;
  }
  const baseUrl = values['base-url'] ?? process.env.CMS_BASE_URL;
  const cms = createCmsClient({ apiKey, ...(baseUrl ? { baseUrl } : {}) });
  const { customBlocks } = await cms.space();
  const text = blockTypes(customBlocks, values.name ? { name: values.name } : {});
  if (values.out) {
    await writeFile(values.out, text);
    console.error(`Tipos de ${String(customBlocks.length)} blocos em ${values.out}.`);
  } else {
    process.stdout.write(text);
  }
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
