import type { Element, Nodes, Root } from 'hast';
import { fromHtml } from 'hast-util-from-html';

/**
 * HTML as a tree to compare: no positions, no comments (the marks of hydration), no whitespace between
 * tags, styles without spaces.
 */
export function tree(html: string): Root {
  const clean = (node: Nodes): Nodes | null => {
    if (node.type === 'text') {
      return node.value.trim() === '' ? null : { type: 'text', value: node.value };
    }
    if (node.type === 'element') {
      const properties = { ...node.properties };
      if (typeof properties.style === 'string') {
        properties.style = properties.style.replace(/\s+/g, '').replace(/;$/, '');
      }
      return {
        type: 'element',
        tagName: node.tagName,
        properties,
        children: node.children.flatMap((c) => clean(c) ?? []) as Element['children'],
      };
    }
    if (node.type === 'root') {
      return {
        type: 'root',
        children: node.children.flatMap((c) => clean(c) ?? []) as Root['children'],
      };
    }
    return null;
  };
  // Adjacent texts (split by the marks of the frameworks) become one.
  return clean(fromHtml(html.replace(/<!--[^]*?-->/g, ''), { fragment: true })) as Root;
}

/** The HTML of the CMS with the blocks of the space as `renderHtml` leaves them without components. */
export function withoutCustomBlocks(html: string): string {
  return html
    .replace(/<div data-block="(?:cta|banner)"[^>]*><\/div>/g, '')
    .replace(/<div data-block="(?:cta|destaque)"[^>]*>(.*?)<\/div>/gs, '$1');
}

/**
 * `custom-blocks.json` drawn with the test components: `cta` as a link, `destaque` as a section with the
 * types of its attributes, the links of the text as links of the site; `banner` has no component.
 */
export const CUSTOM_EXPECTED = `<h2 id="blocos-do-space">Blocos do space</h2>
<p>Um <a href="https://web.dev/lcp" data-site-link="">link</a> no texto.</p>
<a class="cta" href="/blog/outro-post">Leia o guia</a>
<section class="destaque" data-types="number boolean"><p>Texto <strong>forte</strong> do destaque.</p><a class="cta" href="/contato">Fale com a gente</a></section>
<aside data-block="note" data-type="tip"><p>Uma dica.</p></aside>`;
