import type { Element, Nodes, Root } from 'hast';
import { fromHtml } from 'hast-util-from-html';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { type BlockProps, CmsContent } from './content.js';
import fixture from './fixtures/post.json' with { type: 'json' };

/** HTML as a tree to compare: no positions, no whitespace between tags, styles without spaces. */
function tree(html: string): Root {
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
  return clean(fromHtml(html, { fragment: true })) as Root;
}

const Cta = ({ attributes, children }: BlockProps) => (
  <a className="cta" href={attributes.href}>
    {attributes.label}
    {children}
  </a>
);

describe('<CmsContent> (RS-05)', () => {
  it('without replacements, draws the same HTML as the CMS', () => {
    const html = renderToStaticMarkup(<CmsContent hast={fixture.hast} />);
    expect(tree(html)).toEqual(tree(fixture.html));
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
});
