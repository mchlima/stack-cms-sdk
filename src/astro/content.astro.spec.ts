/// <reference types="astro/client" />
import { getContainerRenderer } from '@astrojs/react/container-renderer';
import { loadRenderers } from 'astro:container';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import fixture from '../react/fixtures/post.json' with { type: 'json' };
import custom from '../test/fixtures/custom-blocks.json' with { type: 'json' };
import { CUSTOM_EXPECTED, tree, withoutCustomBlocks } from '../test/html.js';
import CmsContent from './CmsContent.astro';
import Cta from './fixtures/Cta.astro';
import Destaque from './fixtures/Destaque.astro';
import Link from './fixtures/Link.astro';
import Note from './fixtures/Note.js';

let container: AstroContainer;
beforeAll(async () => {
  const renderers = await loadRenderers([getContainerRenderer()]);
  container = await AstroContainer.create({ renderers });
});

const draw = (props: Record<string, unknown>) =>
  container.renderToString(CmsContent as never, { props });

describe('<CmsContent> for Astro (RS-11)', () => {
  it('without replacements, draws the HTML of the CMS, without the blocks of the space', async () => {
    const html = await draw({ hast: fixture.hast, warn: false });
    expect(tree(html)).toEqual(tree(withoutCustomBlocks(fixture.html)));
  });

  it('CS-03: a block of the space becomes the component of the site; the rest stays the same', async () => {
    const html = await draw({ hast: fixture.hast, blocks: { cta: Cta } });
    const expected = fixture.html.replace(
      /<div data-block="cta"[^>]*>(.*?)<\/div>/s,
      '<a class="cta" href="https://stack201.com.br/contato">Fale com a gente$1</a>',
    );
    expect(tree(html)).toEqual(tree(expected));
  });

  it('takes components of other frameworks (React) and elements of the site', async () => {
    const html = await draw({
      hast: fixture.hast,
      blocks: { note: Note },
      components: { a: Link },
      warn: false,
    });
    expect(html).toContain('<div role="note" data-seen="warning">');
    expect(html).toContain('Imagens sem tamanho pioram o CLS.');
    expect(html).toContain('<a href="https://web.dev/lcp" data-site-link="">guia do Google</a>');
  });

  it('blocks of the space in the new form, nested, with attributes typed by customBlocks', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const html = await draw({
      hast: custom.hast,
      customBlocks: custom.customBlocks,
      blocks: { cta: Cta, destaque: Destaque },
      components: { a: Link },
      warn: true,
    });
    expect(tree(html)).toEqual(tree(CUSTOM_EXPECTED));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"banner"'));
    warn.mockRestore();
  });

  it('keeps the text of a <pre> exactly as the CMS wrote it', async () => {
    const html = await draw({ hast: fixture.hast, components: { code: 'code' }, warn: false });
    const pre = /<pre[^]*<\/pre>/.exec(fixture.html)?.[0] ?? '';
    expect(html).toContain(pre);
  });
});
