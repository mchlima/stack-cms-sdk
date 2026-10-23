/**
 * The components that the bundler of the site compiles (`.svelte` and `.astro`) go to `dist` as they are,
 * next to the JavaScript they import (RS-11). The test fixtures stay out.
 */
import { cp, readdir } from 'node:fs/promises';

const SOURCE = new URL('../src/', import.meta.url);
const TARGET = new URL('../dist/', import.meta.url);

const files = await readdir(SOURCE, { recursive: true });
const components = files.filter(
  (file) => /\.(svelte|astro)$/.test(file) && !file.split(/[\\/]/).includes('fixtures'),
);
for (const file of components) {
  await cp(new URL(file, SOURCE), new URL(file, TARGET));
}
console.log(`${components.length} componentes copiados para dist/: ${components.join(', ')}`);
