import type { ReactNode } from 'react';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';

import { type HeadInput, headTags, jsonLdString } from '../head.js';
import type { JsonLd } from '../types.js';

/**
 * RS-06: the `<head>` of a page of the CMS: title, description, canonical, `robots`, Open Graph, `hreflang`
 * with the `x-default` and the JSON-LD. React 19 moves the tags into the `<head>` by itself.
 */
export function CmsHead(page: HeadInput): ReactNode {
  return jsx(Fragment, {
    children: headTags(page).map((tag, index) => {
      switch (tag.tag) {
        case 'title':
          return jsx('title', { children: tag.text }, 'title');
        case 'script':
          return jsx(
            'script',
            { ...tag.attributes, dangerouslySetInnerHTML: { __html: tag.text } },
            'json-ld',
          );
        default:
          return jsx(tag.tag, tag.attributes, `${tag.tag}-${String(index)}`);
      }
    }),
  });
}

/** RS-06, CS-04: only the JSON-LD, escaped. */
export function JsonLdScript({ data }: { data: JsonLd }): ReactNode {
  return jsxs('script', {
    type: 'application/ld+json',
    dangerouslySetInnerHTML: { __html: jsonLdString(data) },
  });
}
