import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import custom from '../test/fixtures/custom-blocks.json' with { type: 'json' };
import { CUSTOM_EXPECTED, tree, withoutCustomBlocks } from '../test/html.js';
import { type BlockProps, CmsContent } from './content.js';
import fixture from './fixtures/post.json' with { type: 'json' };

const Cta = ({ attributes, children }: BlockProps) => (
  <a className="cta" href={attributes.href}>
    {attributes.label}
    {children}
  </a>
);

describe('<CmsContent> (RS-05)', () => {
  it('without replacements, draws the HTML of the CMS, without the blocks of the space', () => {
    const html = renderToStaticMarkup(<CmsContent hast={fixture.hast} warn={false} />);
    expect(tree(html)).toEqual(tree(withoutCustomBlocks(fixture.html)));
  });

  it('CS-03: a block of the space becomes the component of the site; the rest stays the same', () => {
    const html = renderToStaticMarkup(<CmsContent hast={fixture.hast} blocks={{ cta: Cta }} />);
    const expected = fixture.html.replace(
      /<div data-block="cta"[^>]*>(.*?)<\/div>/s,
      '<a class="cta" href="https://stack201.com.br/contato">Fale com a gente$1</a>',
    );
    expect(expected).not.toBe(fixture.html);
    expect(tree(html)).toEqual(tree(expected));
  });

  it('blocks of the CMS and elements are replaced too, with their attributes and id', () => {
    const seen: BlockProps[] = [];
    const Note = (props: BlockProps) => {
      seen.push(props);
      return <div role="note">{props.children}</div>;
    };
    const Answer = ({ id, children }: BlockProps) => <div id={id}>{children}</div>;
    const html = renderToStaticMarkup(
      <CmsContent
        hast={fixture.hast}
        blocks={{ note: Note, answer: Answer }}
        components={{
          a: ({ href, children }) => (
            <a href={href} data-site-link="">
              {children}
            </a>
          ),
        }}
      />,
    );
    expect(seen[0]?.attributes).toEqual({ type: 'warning' });
    expect(html).toContain('<div role="note"><p>Imagens sem tamanho pioram o CLS.</p></div>');
    expect(html).toContain('<div id="resposta"><p>O LCP bom');
    expect(html).toContain('<a href="https://web.dev/lcp" data-site-link="">guia do Google</a>');
  });

  it('blocks of the space in the new form, nested, with attributes typed by customBlocks', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const Destaque = ({
      attributes,
      children,
    }: BlockProps<{ nivel?: number; aberto?: boolean }>) => (
      <section
        className="destaque"
        data-types={`${typeof attributes.nivel} ${typeof attributes.aberto}`}
      >
        {children}
      </section>
    );
    const html = renderToStaticMarkup(
      <CmsContent
        hast={custom.hast}
        customBlocks={custom.customBlocks}
        blocks={{ cta: Cta, destaque: Destaque }}
        components={{
          a: ({ href, children }) => (
            <a href={href} data-site-link="">
              {children}
            </a>
          ),
        }}
        warn
      />,
    );
    expect(tree(html)).toEqual(tree(CUSTOM_EXPECTED));
    // RS-12: the banner has no component: it goes away, with a warning in development.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"banner"'));
    warn.mockRestore();
  });

  it('serves Server Components: no hooks, no state, no "use client"', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(new URL('./content.tsx', import.meta.url), 'utf8');
    expect(source).not.toMatch(/use client|useState|useEffect|useContext|useMemo/);
  });
});
