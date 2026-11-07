/**
 * The builders for a Content Contract: one description of what a site owner can edit, which gives
 * the code its types, the build its checks and the CMS its fields. They check structure only. What
 * the owner chooses to say is theirs, so no builder limits length or wording.
 */
import { z } from 'zod';

export interface FieldMeta {
  label: string;
  hint?: string;
  widget: 'string' | 'text' | 'richtext' | 'image' | 'datetime' | 'object' | 'list';
  /** The owner may leave it empty. */
  optional?: boolean;
  /** The layout depends on this many items, so the CMS locks adding, removing and reordering. */
  count?: number;
  /** Starts closed in the CMS, to keep long forms readable. */
  collapsed?: boolean;
  /** One value for every language, edited in the default one. */
  shared?: boolean;
  /** Passed to the CMS field as they are. */
  options?: Record<string, unknown>;
}

const withMeta = <T extends z.ZodType>(schema: T, meta: FieldMeta): T => schema.meta(meta as unknown as Record<string, unknown>) as T;

const required = z.string().refine((value) => value.trim().length > 0, 'This text cannot be empty');

export const line = (label: string, hint?: string) => withMeta(required, { label, hint, widget: 'string' });

export const paragraph = (label: string, hint?: string) => withMeta(required, { label, hint, widget: 'text' });

export const optionalParagraph = (label: string, hint?: string) => withMeta(z.string(), { label, hint, widget: 'text', optional: true });

export const richText = (label: string, hint?: string) => withMeta(required, { label, hint, widget: 'richtext' });

/** Photo formats the CMS converts on upload. SVG and animated GIF would stay as they are. */
const PHOTO_FORMATS = 'image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif';

export const image = (label: string, { hint, optional, shared }: { hint?: string; optional?: boolean; shared?: boolean } = {}) =>
  withMeta(optional ? z.string() : required, { label, hint, widget: 'image', optional, shared, options: { accept: PHOTO_FORMATS } });

/** A calendar date, stored as YYYY-MM-DD so it reads the same in every time zone. */
export const date = (label: string, { hint, shared }: { hint?: string; shared?: boolean } = {}) =>
  withMeta(z.iso.date(), { label, hint, widget: 'datetime', shared, options: { format: 'YYYY-MM-DD', time_format: false } });

export const group = <Shape extends z.ZodRawShape>(label: string, shape: Shape, collapsed = true) =>
  withMeta(z.strictObject(shape), { label, widget: 'object', collapsed });

export const list = <Item extends z.ZodType>(label: string, item: Item, options: { count?: number; optional?: boolean } = {}) => {
  const { count, optional } = options;
  // One needs exactly `count` items and the other allows none, so a field could not honestly say both.
  if (count !== undefined && optional) throw new Error(`The list "${label}" cannot be both a fixed size and optional`);
  const schema = count === undefined ? (optional ? z.array(item) : z.array(item).min(1)) : z.array(item).length(count);
  return withMeta(schema, { label, widget: 'list', count, optional });
};

/** A content file rewritten in the contract's order, which is the order the CMS saves it in. */
export const canonicalJson = (contract: z.ZodType, text: string): string => `${JSON.stringify(contract.parse(JSON.parse(text)), null, 2)}\n`;
