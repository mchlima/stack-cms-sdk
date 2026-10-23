import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import fixture from '../react/fixtures/post.json' with { type: 'json' };
import custom from '../test/fixtures/custom-blocks.json' with { type: 'json' };
import { CUSTOM_EXPECTED, tree, withoutCustomBlocks } from '../test/html.js';
import {
  type AttributesOf,
  blocksOf,
  blockTypes,
  type CmsBlock,
  missingBlocks,
  readBlock,
  renderHtml,
} from './index.js';

const customBlocks = custom.customBlocks;

describe('the blocks of the content (RS-10)', () => {
  it('reads each block with its name, attributes, id and content', () => {
    const blocks = blocksOf(fixture.hast);
    expect(blocks.map((b) => [b.name, b.custom, b.attributes, b.id])).toEqual([
      ['answer', false, {}, 'resposta'],
      ['note', false, { type: 'warning' }, undefined],
      // The old form of the API, `data-href`, still works.
      [
        'cta',
        true,
        { href: 'https://stack201.com.br/contato', label: 'Fale com a gente' },
        undefined,
      ],
    ]);
    expect(blocks[2]?.children).toHaveLength(1);
  });

  it('types the attributes by the definition of the block; without it, all are text', () => {
    const typed = blocksOf(custom.hast, customBlocks);
    expect(typed.map((b) => [b.name, b.attributes])).toEqual([
      ['cta', { href: '/blog/outro-post', label: 'Leia o guia', variant: 'primary' }],
      ['destaque', { nivel: 2, aberto: true, 'cta-text': 'Veja' }],
      ['cta', { href: '/contato', label: 'Fale com a gente' }],
      ['banner', { titulo: 'Promoção', link: 'https://stack201.com.br' }],
      ['note', { type: 'tip' }],
    ]);
    const plain = blocksOf(custom.hast).find((b) => b.name === 'destaque');
    expect(plain?.attributes).toEqual({ nivel: '2', aberto: 'true', 'cta-text': 'Veja' });
    expect(readBlock({ type: 'text', value: 'x' })).toBeNull();
  });

  it('RS-12: says which blocks of the space have no component', () => {
    expect(missingBlocks(customBlocks, { cta: () => '' })).toEqual(['destaque', 'banner']);
    expect(missingBlocks(customBlocks, ['cta', 'destaque', 'banner'])).toEqual([]);
    expect(missingBlocks(null, {})).toEqual([]);
  });
});

describe('renderHtml (RS-13)', () => {
  const cta = (block: CmsBlock) =>
    `<a class="cta" href="${String(block.attributes.href)}">${String(block.attributes.label)}</a>`;
  const destaque = (block: CmsBlock, children: string) =>
    `<section class="destaque" data-types="${typeof block.attributes.nivel} ${typeof block.attributes.aberto}">${children}</section>`;

  it('without replacements, gives the HTML of the CMS, without the blocks of the space', () => {
    expect(tree(renderHtml(fixture.hast, { warn: false }))).toEqual(
      tree(withoutCustomBlocks(fixture.html)),
    );
    expect(renderHtml(fixture.hast, { warn: false })).toContain(
      '<section id="resposta" data-block="answer">',
    );
  });

  it('CS-03: each block becomes what its function gives; the rest stays the same', () => {
    const html = renderHtml(fixture.hast, {
      blocks: { cta: (block, children) => `<a class="cta">${children}</a>` },
    });
    expect(tree(html)).toEqual(
      tree(
        fixture.html.replace(/<div data-block="cta"[^>]*>(.*?)<\/div>/s, '<a class="cta">$1</a>'),
      ),
    );
  });

  it('replaces blocks of the space, nested ones and elements, with typed attributes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const html = renderHtml(custom.hast, {
      customBlocks,
      blocks: { cta, destaque },
      components: {
        a: ({ attributes }, children) =>
          `<a href="${attributes.href ?? ''}" data-site-link="">${children}</a>`,
      },
      warn: true,
    });
    expect(tree(html)).toEqual(tree(CUSTOM_EXPECTED));
    // RS-12: the banner has no component: it goes away, with a warning in development.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"banner"'));
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('a block of the space with content and no component leaves its content', () => {
    const html = renderHtml(custom.hast, { blocks: { cta }, warn: false });
    expect(html).toContain(
      '<p>Texto <strong>forte</strong> do destaque.</p><a class="cta" href="/contato">',
    );
    expect(html).not.toContain('data-block="destaque"');
    expect(html).not.toContain('banner');
  });
});

describe('the types of the attributes (RS-14)', () => {
  const definition = {
    name: 'cta',
    container: false,
    attributes: [
      { name: 'href', type: 'link', required: true },
      { name: 'variant', type: 'enum', values: ['primary', 'secondary'] },
      { name: 'nivel', type: 'number' },
      { name: 'aberto', type: 'boolean', required: true },
    ],
  } as const;

  it('gives the attributes of a definition as const', () => {
    expect(definition.attributes).toHaveLength(4);
    expectTypeOf<AttributesOf<typeof definition>>().toEqualTypeOf<{
      href: string;
      aberto: boolean;
      variant?: 'primary' | 'secondary';
      nivel?: number;
    }>();
  });

  it('writes the types of the blocks of the space', () => {
    expect(blockTypes(customBlocks))
      .toBe(`// Gerado por @stack201/cms-sdk (blockTypes) a partir de space.customBlocks. Não edite à mão.

/** Os atributos de cada bloco do space, pelo nome. */
export interface CmsBlockAttributes {
  /** Chamada para ação, no máximo uma por post. */
  cta: {
    /** Para onde a chamada leva. */
    href: string;
    label: string;
    variant?: 'primary' | 'secondary';
  };
  destaque: {
    nivel?: number;
    aberto?: boolean;
    'cta-text'?: string;
  };
  banner: {
    titulo?: string;
    link?: string;
  };
}

export type CmsCustomBlockName = keyof CmsBlockAttributes;
`);
  });
});
