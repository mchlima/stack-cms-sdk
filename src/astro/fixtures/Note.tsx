import type { ReactNode } from 'react';

/** A block made in React, drawn by Astro on the server. */
export default function Note({
  attributes,
  children,
}: {
  attributes: { type?: string };
  children?: ReactNode;
}) {
  return (
    <div role="note" data-seen={attributes.type}>
      {children}
    </div>
  );
}
