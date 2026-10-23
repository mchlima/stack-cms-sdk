import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';

import fixture from '../react/fixtures/post.json' with { type: 'json' };
import custom from '../test/fixtures/custom-blocks.json' with { type: 'json' };
import { CUSTOM_EXPECTED, tree, withoutCustomBlocks } from '../test/html.js';
import Answer from './fixtures/Answer.svelte';
import Cta from './fixtures/Cta.svelte';
import Destaque from './fixtures/Destaque.svelte';
import Link from './fixtures/Link.svelte';
import Note from './fixtures/Note.svelte';
import { CmsContent, type CmsContentProps } from './index.js';

const draw = (props: CmsContentProps) => render(CmsContent, { props }).body;

describe('<CmsContent> for Svelte (RS-11)', () => {
  it('without replacements, draws the HTML of the CMS, without the blocks of the space', () => {
    const html = draw({ hast: fixture.hast, warn: false });
    expect(tree(html)).toEqual(tree(withoutCustomBlocks(fixture.html)));
  });

  it('CS-03: a block of the space becomes the component of the site; the rest stays the same', () => {
    const html = draw({ hast: fixture.hast, blocks: { cta: Cta } });
    const expected = fixture.html.replace(
      /<div data-block="cta"[^>]*>(.*?)<\/div>/s,
      '<a class="cta" href="https://stack201.com.br/contato">Fale com a gente$1</a>',
    );
    expect(tree(html)).toEqual(tree(expected));
  });

  it('blocks of the CMS and elements are replaced, with their attributes and id', () => {
    const html = draw({
      hast: fixture.hast,
      blocks: { note: Note, answer: Answer },
      components: { a: Link },
      warn: false,
    });
    expect(tree(html)).toEqual(
      tree(
        withoutCustomBlocks(fixture.html)
          .replace(
            /<aside data-block="note"[^>]*>(.*?)<\/aside>/s,
            '<div role="note" data-seen="warning">$1</div>',
          )
          .replace(/<section id="resposta"[^>]*>(.*?)<\/section>/s, '<div id="resposta">$1</div>')
          .replace(' rel="noopener"', ' data-site-link=""'),
      ),
    );
  });

  it('blocks of the space in the new form, nested, with attributes typed by customBlocks', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const html = draw({
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

  it('keeps the text of a <pre> exactly as the CMS wrote it', () => {
    const html = draw({ hast: fixture.hast, components: { code: 'code' }, warn: false });
    const pre = /<pre[^]*<\/pre>/.exec(fixture.html)?.[0] ?? '';
    expect(html.replace(/<!--[^]*?-->/g, '')).toContain(pre);
  });
});
