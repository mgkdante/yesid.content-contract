/** Turns a Content Contract into the configuration Sveltia CMS reads. Meant for build time. */
import { z } from 'zod';
import type { FieldMeta } from './contract.ts';

export interface CmsField {
  name: string;
  label: string;
  widget: string;
  i18n: true | 'duplicate';
  [option: string]: unknown;
}

/** One JSON file per language, such as the text of the site. */
export interface ContentFile {
  name: string;
  label: string;
  /** Path from the repository root, with `{{locale}}` where the language goes. */
  file: string;
  contract: z.ZodObject;
}

/** A folder people can add entries to, such as a blog. Each language of an entry is one Markdown file. */
export interface ContentFolder {
  name: string;
  label: string;
  labelSingular?: string;
  folder: string;
  contract: z.ZodObject;
}

export interface CmsConfigInput {
  /** `owner/name` of the site's repository. */
  repo: string;
  /** The login service every CMS request goes through. */
  loginOrigin: string;
  locales: readonly string[];
  defaultLocale: string;
  singletons: readonly ContentFile[];
  collections?: readonly ContentFolder[];
  branch?: string;
  mediaFolder?: string;
  publicFolder?: string;
}

export interface CmsConfig {
  backend: {
    name: 'github';
    repo: string;
    branch: string;
    base_url: string;
    auth_endpoint: string;
    api_root: string;
    graphql_api_root: string;
  };
  media_folder: string;
  public_folder: string;
  i18n: { structure: 'multiple_files'; locales: string[]; default_locale: string };
  singletons: { name: string; label: string; file: string; format: 'json'; i18n: true; fields: CmsField[] }[];
  collections?: {
    name: string;
    label: string;
    label_singular?: string;
    folder: string;
    create: true;
    extension: 'md';
    format: 'yaml-frontmatter';
    i18n: true;
    fields: CmsField[];
  }[];
}

const metaOf = (schema: z.ZodType, name: string): FieldMeta => {
  const meta = schema.meta() as unknown as FieldMeta | undefined;
  if (!meta?.label) throw new Error(`The contract field "${name}" has no label`);
  return meta;
};

const fieldsOf = (shape: z.ZodRawShape): CmsField[] => Object.entries(shape).map(([name, schema]) => toField(name, schema as z.ZodType));

function listField(name: string, schema: z.ZodArray<z.ZodType>, meta: FieldMeta): CmsField {
  const { element } = schema;
  const items = element instanceof z.ZodObject ? { fields: fieldsOf(element.shape) } : { field: toField('value', element) };
  const locked = meta.count === undefined ? {} : { min: meta.count, max: meta.count, allow_add: false, allow_remove: false, allow_reorder: false };
  return {
    name,
    label: meta.label,
    widget: 'list',
    i18n: true,
    collapsed: true,
    ...(meta.optional ? { required: false } : {}),
    ...locked,
    ...items
  };
}

function toField(name: string, schema: z.ZodType): CmsField {
  const meta = metaOf(schema, name);
  const common = {
    name,
    label: meta.label,
    i18n: meta.shared ? ('duplicate' as const) : (true as const),
    ...(meta.hint ? { hint: meta.hint } : {})
  };

  if (schema instanceof z.ZodArray) return { ...listField(name, schema as z.ZodArray<z.ZodType>, meta), ...common };
  if (schema instanceof z.ZodObject) {
    return { ...common, widget: 'object', collapsed: meta.collapsed ?? true, fields: fieldsOf(schema.shape) };
  }
  return { ...common, widget: meta.widget, ...(meta.optional ? { required: false } : {}), ...meta.options };
}

/** The CMS fields for a contract, in the contract's order. */
export const contractFields = (contract: z.ZodObject): CmsField[] => fieldsOf(contract.shape);

/** A site's whole editor setup. Saves only reach a branch the login service also allows. */
export function cmsConfig(input: CmsConfigInput): CmsConfig {
  const { repo, loginOrigin, locales, defaultLocale, singletons, collections = [] } = input;
  if (!locales.includes(defaultLocale)) throw new Error(`The default language "${defaultLocale}" is not in the list of languages`);

  return {
    backend: {
      name: 'github',
      repo,
      branch: input.branch ?? 'main',
      base_url: loginOrigin,
      auth_endpoint: 'auth/popup',
      api_root: loginOrigin,
      graphql_api_root: loginOrigin
    },
    media_folder: input.mediaFolder ?? 'static/images/uploads',
    public_folder: input.publicFolder ?? '/images/uploads',
    i18n: { structure: 'multiple_files', locales: [...locales], default_locale: defaultLocale },
    singletons: singletons.map(({ name, label, file, contract }) => ({
      name,
      label,
      file,
      format: 'json',
      i18n: true,
      fields: contractFields(contract)
    })),
    ...(collections.length === 0
      ? {}
      : {
          collections: collections.map(({ name, label, labelSingular, folder, contract }) => ({
            name,
            label,
            ...(labelSingular ? { label_singular: labelSingular } : {}),
            folder,
            create: true as const,
            extension: 'md' as const,
            format: 'yaml-frontmatter' as const,
            i18n: true as const,
            fields: contractFields(contract)
          }))
        })
  };
}
