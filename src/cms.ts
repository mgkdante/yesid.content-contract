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
export interface ContentFolder<Contract extends z.ZodObject = z.ZodObject> {
  name: string;
  label: string;
  labelSingular?: string;
  folder: string;
  contract: Contract;
  /**
   * The field a new entry's file name is made from, once, when it is first saved. The editor uses `title`
   * when there is one; without either, it names the file with a random code, which a site may use as an address.
   */
  identifierField?: Extract<keyof Contract['shape'], string>;
}

/** Several content files under one name in the CMS sidebar, such as a site's pages. */
export interface ContentFileGroup {
  name: string;
  label: string;
  /** A Material Symbols name. */
  icon?: string;
  files: readonly ContentFile[];
}

export interface CmsConfigInput {
  /** `owner/name` of the site's repository. */
  repo: string;
  /** The login service every CMS request goes through. */
  loginOrigin: string;
  /** This site's name on the login service, as in `login.example.com/<siteSlug>/`. */
  siteSlug: string;
  locales: readonly string[];
  defaultLocale: string;
  singletons?: readonly ContentFile[];
  fileGroups?: readonly ContentFileGroup[];
  // `any`, so a folder typed against its own contract fits: `identifierField` makes the type invariant. cmsConfig checks the name.
  collections?: readonly ContentFolder<any>[];
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
  slug: typeof PLAIN_SLUGS;
  media_libraries: typeof SAFE_UPLOADS;
  i18n: { structure: 'multiple_files'; locales: string[]; default_locale: string };
  singletons?: CmsFile[];
  collections?: (CmsFileGroup | CmsFolder)[];
}

interface CmsFile {
  name: string;
  label: string;
  file: string;
  format: 'json';
  i18n: true;
  fields: CmsField[];
}

interface CmsFileGroup {
  name: string;
  label: string;
  icon?: string;
  format: 'json';
  i18n: true;
  files: CmsFile[];
}

interface CmsFolder {
  name: string;
  label: string;
  label_singular?: string;
  folder: string;
  create: true;
  extension: 'md';
  format: 'yaml-frontmatter';
  i18n: { initial_locales: 'default' };
  fields: CmsField[];
  identifier_field?: string;
}

/** Keeps saved file names plain: an accented name is one a strict login service can refuse. */
const PLAIN_SLUGS = { encoding: 'ascii', clean_accents: true } as const;

/** Renames an upload the same way, and shrinks it while it is still in the browser, so no build step has to. */
const SAFE_UPLOADS = {
  default: {
    config: {
      slugify_filename: true,
      transformations: { raster_image: { format: 'webp', quality: 85, width: 2048, height: 2048 } }
    }
  }
} as const;

/** Site names the login service keeps for its own pages: `RESERVED` in yesid.login. It refuses them either way; this says so at build time. */
const RESERVED_SLUGS = new Set(['auth', 'api', 'admin', 'login', 'editor', 'account', 'privacy', 'terms', 'legal']);

const isSiteSlug = (slug: string): boolean => typeof slug === 'string' && /^[a-z0-9][a-z0-9.-]{0,62}$/.test(slug) && !RESERVED_SLUGS.has(slug);

/** HTTP or HTTPS and a host, with nothing after it, in any spelling a browser accepts. */
const isOrigin = (value: string): boolean => /^https?:\/\/[^/\\?#@\s]+$/i.test(value) && URL.canParse(value);

function refuseRepeats(names: readonly string[], where: string): void {
  const repeated = names.find((name, index) => names.indexOf(name) !== index);
  if (repeated !== undefined) throw new Error(`The name "${repeated}" is used twice in ${where}`);
}

/** Refuses a setup that would only fail later, in the editor or on the login service. */
function checkInput({ repo, loginOrigin, siteSlug, locales, defaultLocale, singletons = [], fileGroups = [], collections = [], branch }: CmsConfigInput): void {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error(`The repository "${repo}" is not owner/name`);
  if (!isOrigin(loginOrigin)) throw new Error(`The login origin "${loginOrigin}" must be only an HTTP or HTTPS origin, like https://login.example.com`);
  if (!isSiteSlug(siteSlug)) throw new Error(`The site slug "${siteSlug}" is not valid`);
  if (!locales.includes(defaultLocale)) throw new Error(`The default language "${defaultLocale}" is not in the list of languages`);
  if (branch?.trim() === '') throw new Error('The branch cannot be blank');
  // A group counts by its files. An empty folder counts, because people can add entries to it.
  if (singletons.length + fileGroups.flatMap(({ files }) => files).length + collections.length === 0) {
    throw new Error('The site has nothing to edit: give it singletons, file groups or collections');
  }
  refuseRepeats(singletons.map(({ name }) => name), 'the singletons');
  refuseRepeats([...fileGroups, ...collections].map(({ name }) => name), 'the file groups and collections');
  for (const { label, files } of fileGroups) refuseRepeats(files.map(({ name }) => name), `the group "${label}"`);
  // Own keys only, so a name like `toString` is not taken for a field.
  for (const { name, contract, identifierField } of collections) {
    if (identifierField !== undefined && !Object.hasOwn(contract.shape, identifierField)) {
      throw new Error(`The identifier field "${identifierField}" is not a field of the folder "${name}"`);
    }
  }
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

const toFile = ({ name, label, file, contract }: ContentFile): CmsFile => ({
  name,
  label,
  file,
  format: 'json',
  i18n: true,
  fields: contractFields(contract)
});

const toGroup = ({ name, label, icon, files }: ContentFileGroup): CmsFileGroup => ({
  name,
  label,
  ...(icon ? { icon } : {}),
  format: 'json',
  i18n: true,
  files: files.map(toFile)
});

const toFolder = ({ name, label, labelSingular, folder, contract, identifierField }: ContentFolder): CmsFolder => ({
  name,
  label,
  ...(labelSingular ? { label_singular: labelSingular } : {}),
  folder,
  create: true,
  extension: 'md',
  format: 'yaml-frontmatter',
  // An entry may exist in one language. The default still leaves the others one click away.
  i18n: { initial_locales: 'default' },
  fields: contractFields(contract),
  ...(identifierField === undefined ? {} : { identifier_field: identifierField })
});

/** The CMS fields for a contract, in the contract's order. */
export const contractFields = (contract: z.ZodObject): CmsField[] => fieldsOf(contract.shape);

/** A site's whole editor setup. Saves only reach a branch the login service also allows. */
export function cmsConfig(input: CmsConfigInput): CmsConfig {
  checkInput(input);
  const { repo, loginOrigin, siteSlug, locales, defaultLocale, singletons, fileGroups = [], collections = [] } = input;
  const groups = [...fileGroups.map(toGroup), ...collections.map(toFolder)];

  return {
    backend: {
      name: 'github',
      repo,
      branch: input.branch ?? 'main',
      base_url: loginOrigin,
      auth_endpoint: 'auth/popup',
      api_root: `${loginOrigin}/${siteSlug}`,
      graphql_api_root: `${loginOrigin}/${siteSlug}`
    },
    media_folder: input.mediaFolder ?? 'static/images/uploads',
    public_folder: input.publicFolder ?? '/images/uploads',
    slug: structuredClone(PLAIN_SLUGS),
    media_libraries: structuredClone(SAFE_UPLOADS),
    i18n: { structure: 'multiple_files', locales: [...locales], default_locale: defaultLocale },
    ...(singletons ? { singletons: singletons.map(toFile) } : {}),
    ...(groups.length === 0 ? {} : { collections: groups })
  };
}
