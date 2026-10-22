import { describe, expect, it } from 'vitest';

import { headHtml, headTags, jsonLdString } from './head.js';
import type { ResolvedSeo } from './types.js';

const seo: ResolvedSeo = {
  title: 'Core Web Vitals · Blog',
  description: 'As três medidas de velocidade do Google.',
  canonical: 'https://www.cliente.com.br/blog/core-web-vitals',
  robots: { index: true, follow: true, content: 'index, follow' },
  ogTitle: 'Core Web Vitals',
  ogDescription: 'As três medidas de velocidade do Google.',
  ogImage: {
    url: 'https://media.cliente.com.br/a-v1/capa-og-1200.jpg',
    width: 1200,
    height: 630,
    alt: 'Capa',
  },
};

describe('the <head> of a page (RS-06)', () => {
  it('has the title, description, canonical, robots, Open Graph and hreflang with x-default', () => {
    const tags = headTags({
      seo,
      type: 'article',
      alternates: [
        { hreflang: 'pt-BR', path: '/blog/core-web-vitals', url: seo.canonical },
        { hreflang: 'x-default', path: '/blog/core-web-vitals', url: seo.canonical },
      ],
    });
    expect(tags[0]).toEqual({ tag: 'title', text: 'Core Web Vitals · Blog' });
    expect(tags).toContainEqual({
      tag: 'link',
      attributes: { rel: 'canonical', href: seo.canonical },
    });
    expect(tags).toContainEqual({
      tag: 'meta',
      attributes: { name: 'robots', content: 'index, follow' },
    });
    expect(tags).toContainEqual({
      tag: 'meta',
      attributes: { property: 'og:type', content: 'article' },
    });
    expect(tags).toContainEqual({
      tag: 'meta',
      attributes: { property: 'og:image:width', content: '1200' },
    });
    expect(tags).toContainEqual({
      tag: 'link',
      attributes: { rel: 'alternate', hreflang: 'x-default', href: seo.canonical },
    });
  });

  it('CS-04: a </script> in a text of the JSON-LD comes out escaped, with the same data', () => {
    const data = {
      '@type': 'Article',
      headline: 'Fim do </script><script>alert(1)</script> & mais',
    };
    const text = jsonLdString(data);
    expect(text).not.toContain('</script>');
    expect(text).not.toContain('<');
    expect(JSON.parse(text)).toEqual(data);

    const html = headHtml({ seo, jsonLd: data });
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });

  it('as HTML, the attributes are escaped', () => {
    const html = headHtml({ seo: { ...seo, title: 'A <b> & "c"', description: 'Diz "oi"' } });
    expect(html).toContain('<title>A &lt;b&gt; &amp; &quot;c&quot;</title>');
    expect(html).toContain('<meta name="description" content="Diz &quot;oi&quot;">');
  });
});
