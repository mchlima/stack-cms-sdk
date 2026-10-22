import type { components, operations } from './generated/delivery.js';

/** The types of the Delivery API, generated from its `openapi.json` (RS-02): never written by hand. */
type Schemas = components['schemas'];

export type Space = Schemas['DeliverySpace'];
export type PostCard = Schemas['PostCard'];
export type PostCardPage = Schemas['PostCardPage'];
export type Post = Schemas['PostDetail'];
export type TagItem = Schemas['TagItem'];
export type TagPage = Schemas['TagPage'];
export type CategoryItem = Schemas['CategoryItem'];
export type CategoryPage = Schemas['CategoryPage'];
export type AuthorItem = Schemas['AuthorItem'];
export type AuthorPage = Schemas['AuthorPage'];
export type ResolvedPath = Schemas['ResolvedPath'];
export type Redirect = Schemas['DeliveryRedirect'];
export type ResolvedSeo = Schemas['ResolvedSeo'];
export type Image = Schemas['Image'];
export type ImageVariant = Schemas['ImageVariant'];
export type SharedImage = Schemas['SharedImage'];
export type TocItem = Schemas['TocItem'];
export type Alternate = Schemas['Alternate'];
export type TermLink = Schemas['TermLink'];
export type JsonLd = Schemas['JsonLd'];
/** What a notice of the CMS brings to the site (RS-09). */
export type SitePayload = Schemas['SitePayload'];
export type SiteEvent = SitePayload['type'];
/** The body of an error of the API: `{ error: { code, message, details } }`. */
export type ApiErrorBody = Schemas['Error'];
export type ErrorCode = ApiErrorBody['error']['code'];

type Query<O extends keyof operations> = NonNullable<operations[O]['parameters']['query']>;

export type PostsQuery = Query<'deliveryPosts'>;
export type TermQuery = Query<'deliveryTag'>;
export type PostQuery = Query<'deliveryPost'>;
