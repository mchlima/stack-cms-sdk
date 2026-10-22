import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CmsHead, JsonLdScript } from './head.js';

describe('<CmsHead> and <JsonLdScript> (RS-06)', () => {
  it('draw the tags, with the JSON-LD escaped (CS-04)', () => {
    const html = renderToStaticMarkup(
      <CmsHead
        seo={{
          title: 'Post',
          description: null,
          canonical: 'https://www.cliente.com.br/blog/post',
          robots: { index: false, follow: true, content: 'noindex, follow' },
          ogTitle: 'Post',
          ogDescription: null,
          ogImage: null,
        }}
        jsonLd={{ headline: '</script>' }}
      />,
    );
    expect(html).toContain('<title>Post</title>');
    expect(html).toContain('<meta name="robots" content="noindex, follow"/>');
    expect(html).toContain(
      '<script type="application/ld+json">{"headline":"\\u003c/script\\u003e"}</script>',
    );

    expect(renderToStaticMarkup(<JsonLdScript data={{ a: '<' }} />)).toBe(
      '<script type="application/ld+json">{"a":"\\u003c"}</script>',
    );
  });
});
