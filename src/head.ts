import type { Alternate, JsonLd, ResolvedSeo } from './types.js';

/** What a page of the Delivery API brings for the `<head>` (RS-06): post, space, tag, category, author. */
export interface HeadInput {
  /** Already resolved by the API (RN-32): nothing left to fill. */
  seo: ResolvedSeo;
  alternates?: Alternate[];
  jsonLd?: JsonLd | null;
  /** The `og:type`: `article` for a post, `website` (default) for the other pages. */
  type?: 'article' | 'website' | 'profile';
}

export type HeadTag =
  | { tag: 'title'; text: string }
  | { tag: 'meta'; attributes: Record<string, string> }
  | { tag: 'link'; attributes: Record<string, string> }
  | { tag: 'script'; attributes: { type: 'application/ld+json' }; text: string };

/**
 * RS-06, CS-04: the JSON-LD ready to go inside `<script type="application/ld+json">`. `<`, `>` and `&`
 * become escapes, so a `</script>` in a text never closes the tag, and the data stays the same.
 */
export function jsonLdString(data: JsonLd): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** RS-06: the tags of the `<head>` of a page, in order, without depending on a framework. */
export function headTags(page: HeadInput): HeadTag[] {
  const { seo } = page;
  const meta = (attributes: Record<string, string>): HeadTag => ({ tag: 'meta', attributes });
  const tags: HeadTag[] = [{ tag: 'title', text: seo.title }];
  if (seo.description) {
    tags.push(meta({ name: 'description', content: seo.description }));
  }
  tags.push(
    { tag: 'link', attributes: { rel: 'canonical', href: seo.canonical } },
    meta({ name: 'robots', content: seo.robots.content }),
    meta({ property: 'og:type', content: page.type ?? 'website' }),
    meta({ property: 'og:title', content: seo.ogTitle }),
    meta({ property: 'og:url', content: seo.canonical }),
  );
  if (seo.ogDescription) {
    tags.push(meta({ property: 'og:description', content: seo.ogDescription }));
  }
  if (seo.ogImage) {
    tags.push(
      meta({ property: 'og:image', content: seo.ogImage.url }),
      meta({ property: 'og:image:width', content: String(seo.ogImage.width) }),
      meta({ property: 'og:image:height', content: String(seo.ogImage.height) }),
    );
    if (seo.ogImage.alt) {
      tags.push(meta({ property: 'og:image:alt', content: seo.ogImage.alt }));
    }
  }
  tags.push(
    meta({ name: 'twitter:card', content: seo.ogImage ? 'summary_large_image' : 'summary' }),
  );
  for (const alternate of page.alternates ?? []) {
    tags.push({
      tag: 'link',
      attributes: { rel: 'alternate', hreflang: alternate.hreflang, href: alternate.url },
    });
  }
  if (page.jsonLd) {
    tags.push({
      tag: 'script',
      attributes: { type: 'application/ld+json' },
      text: jsonLdString(page.jsonLd),
    });
  }
  return tags;
}

const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The same tags as HTML, for templates that write the `<head>` as text (Astro, server pages). */
export function headHtml(page: HeadInput): string {
  return headTags(page)
    .map((tag) => {
      if (tag.tag === 'title') {
        return `<title>${escape(tag.text)}</title>`;
      }
      const attributes = Object.entries(tag.attributes)
        .map(([name, value]) => `${name}="${escape(value)}"`)
        .join(' ');
      return tag.tag === 'script'
        ? `<script ${attributes}>${tag.text}</script>`
        : `<${tag.tag} ${attributes}>`;
    })
    .join('\n');
}
