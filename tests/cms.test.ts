import { expect, test } from 'bun:test';
import { z } from 'zod';
import { cmsConfig, contractFields, date, group, image, line, list, optionalParagraph, paragraph, richText, type CmsConfigInput, type CmsField, type ContentFolder } from '../src/index.ts';

const pageContract = z.strictObject({
  hero: group(
    'Top of page',
    { title: line('Title', 'Shown large.'), intro: optionalParagraph('Introduction') },
    false
  ),
  steps: list('Steps', z.strictObject({ title: line('Title'), body: paragraph('Text') }), { count: 4 }),
  questions: list('Questions', line('Question')),
  notes: list('Notes', line('Note'), { optional: true })
});

const postContract = z.strictObject({
  title: line('Title'),
  published: date('Published', { shared: true }),
  photo: image('Photo', { optional: true, shared: true }),
  body: richText('Article')
});

const input: CmsConfigInput = {
  repo: 'owner/site',
  loginOrigin: 'https://login.example.com',
  siteSlug: 'site',
  locales: ['fr', 'en'],
  defaultLocale: 'fr',
  singletons: [{ name: 'page', label: 'Page', file: 'src/lib/content/{{locale}}.json', contract: pageContract }]
};

const named = (fields: CmsField[], name: string): CmsField => {
  const field = fields.find((item) => item.name === name);
  if (!field) throw new Error(`no field ${name}`);
  return field;
};

test('fields keep the contract order, with their labels and hints', () => {
  const fields = contractFields(pageContract);
  expect(fields.map((field) => field.name)).toEqual(['hero', 'steps', 'questions', 'notes']);

  const title = named(named(fields, 'hero').fields as CmsField[], 'title');
  expect(title).toEqual({ name: 'title', label: 'Title', i18n: true, hint: 'Shown large.', widget: 'string' });
});

test('a group can start open or closed', () => {
  const closed = group('Closed', { title: line('Title') });
  const fields = contractFields(z.strictObject({ open: group('Open', { title: line('Title') }, false), closed }));
  expect(named(fields, 'open').collapsed).toBe(false);
  expect(named(fields, 'closed').collapsed).toBe(true);
});

test('a list the layout depends on is locked, a free one stays open', () => {
  const fields = contractFields(pageContract);
  const fixed = named(fields, 'steps');
  expect([fixed.min, fixed.max, fixed.allow_add, fixed.allow_remove, fixed.allow_reorder]).toEqual([4, 4, false, false, false]);

  const free = named(fields, 'questions');
  expect(free.allow_add).toBeUndefined();
  expect(free.min).toBeUndefined();
});

test('a list of plain text uses a single field, and an optional list is not required', () => {
  const notes = named(contractFields(pageContract), 'notes');
  expect((notes.field as CmsField).widget).toBe('string');
  expect(notes.required).toBe(false);
});

test('a list of objects lists its fields', () => {
  const steps = named(contractFields(pageContract), 'steps');
  expect((steps.fields as CmsField[]).map((field) => field.name)).toEqual(['title', 'body']);
});

test('an optional text is not required', () => {
  const hero = named(contractFields(pageContract), 'hero');
  expect(named(hero.fields as CmsField[], 'intro').required).toBe(false);
});

test('blog fields use the widgets the CMS expects', () => {
  const fields = contractFields(postContract);
  expect(named(fields, 'body').widget).toBe('richtext');
  expect(named(fields, 'photo').widget).toBe('image');
  expect(named(fields, 'published')).toMatchObject({ widget: 'datetime', time_format: false, format: 'YYYY-MM-DD' });
});

test('a shared field has one value across languages, every other field is translated', () => {
  const fields = contractFields(postContract);
  expect(named(fields, 'published').i18n).toBe('duplicate');
  expect(named(fields, 'photo').i18n).toBe('duplicate');
  expect(named(fields, 'title').i18n).toBe(true);
});

test('a field without a label is an error, naming the field', () => {
  expect(() => contractFields(z.strictObject({ loose: z.string() }))).toThrow('loose');
});

test('every request goes to this site on the login service, on the chosen branch', () => {
  const { backend } = cmsConfig({ ...input, branch: 'preview' });
  expect(backend).toEqual({
    name: 'github',
    repo: 'owner/site',
    branch: 'preview',
    base_url: 'https://login.example.com',
    auth_endpoint: 'auth/popup',
    api_root: 'https://login.example.com/site',
    graphql_api_root: 'https://login.example.com/site'
  });
});

test('a site slug that is not a plain path segment is an error, naming it', () => {
  for (const siteSlug of ['', 'a/b', '../other', 'Site', 'a b']) {
    expect(() => cmsConfig({ ...input, siteSlug })).toThrow(`"${siteSlug}"`);
  }
});

test('a slug the login service keeps for itself is an error, naming it', () => {
  for (const siteSlug of ['auth', 'api', 'admin', 'login', 'editor', 'account', 'privacy', 'terms', 'legal', 'relay']) {
    expect(() => cmsConfig({ ...input, siteSlug })).toThrow(`"${siteSlug}"`);
  }
});

test('a slug from untyped code is an error, not the text "undefined"', () => {
  expect(() => cmsConfig({ ...input, siteSlug: undefined as unknown as string })).toThrow('"undefined"');
});

test('the login origin must be only an origin, so the API root has no double slash', () => {
  const refused = [
    'https://login.example.com/',
    'https://login.example.com/path',
    'https://login.example.com\\path',
    'https://login.example.com?a=1',
    'https://login.example.com#top',
    'https://user@login.example.com',
    'ftp://login.example.com',
    'ws://login.example.com',
    'login.example.com',
    ''
  ];
  for (const loginOrigin of refused) {
    expect(() => cmsConfig({ ...input, loginOrigin })).toThrow(`"${loginOrigin}"`);
  }
});

test('any spelling of an origin passes and is kept as written', () => {
  const accepted = ['https://LOGIN.example.com', 'https://école.example', 'https://login.example.com:443', 'http://localhost:5173', 'http://[::1]:8787'];
  for (const loginOrigin of accepted) {
    expect(cmsConfig({ ...input, loginOrigin }).backend.api_root).toBe(`${loginOrigin}/site`);
  }
});

test('a repository must be owner/name', () => {
  for (const repo of ['not a repo', 'owner', 'owner/site/extra', '']) {
    expect(() => cmsConfig({ ...input, repo })).toThrow(`"${repo}"`);
  }
});

test('a blank branch is an error', () => {
  expect(() => cmsConfig({ ...input, branch: ' ' })).toThrow('branch');
});

test('a site with nothing to edit is an error, because the CMS could not load it', () => {
  const { singletons: _singletons, ...withoutContent } = input;
  expect(() => cmsConfig(withoutContent)).toThrow('nothing to edit');
  expect(() => cmsConfig({ ...withoutContent, singletons: [] })).toThrow('nothing to edit');
  expect(() => cmsConfig({ ...withoutContent, fileGroups: [{ name: 'pages', label: 'Pages', files: [] }] })).toThrow('nothing to edit');
});

test('an empty folder still counts, because people can add entries to it', () => {
  const { singletons: _singletons, ...withoutContent } = input;
  const collections = [{ name: 'posts', label: 'Blog', folder: 'src/lib/content/posts', contract: postContract }];
  expect(cmsConfig({ ...withoutContent, collections }).collections).toHaveLength(1);
});

test('a name used twice at the same level is an error, naming it', () => {
  const page = { name: 'home', label: 'Home', file: 'src/lib/content/home.{{locale}}.json', contract: pageContract };
  const folder = { name: 'pages', label: 'Posts', folder: 'src/lib/content/posts', contract: postContract };
  const { singletons: _singletons, ...withoutContent } = input;
  expect(() => cmsConfig({ ...withoutContent, singletons: [page, page] })).toThrow('"home"');
  expect(() => cmsConfig({ ...withoutContent, fileGroups: [{ name: 'pages', label: 'Pages', files: [page, page] }] })).toThrow('"home"');
  expect(() => cmsConfig({ ...withoutContent, fileGroups: [{ name: 'pages', label: 'Pages', files: [page] }], collections: [folder] })).toThrow('"pages"');
});

test('changing one result does not change the next one', () => {
  const first = cmsConfig(input);
  (first.slug as { encoding: string }).encoding = 'unicode';
  (first.media_libraries.default.config.transformations.raster_image as { quality: number }).quality = 1;
  const next = cmsConfig(input);
  expect(next.slug.encoding).toBe('ascii');
  expect(next.media_libraries.default.config.transformations.raster_image.quality).toBe(85);
});

test('the branch defaults to main and photos to the upload folder', () => {
  const config = cmsConfig(input);
  expect(config.backend.branch).toBe('main');
  expect(config.media_folder).toBe('static/images/uploads');
  expect(config.public_folder).toBe('/images/uploads');
});

test('languages are one file each', () => {
  expect(cmsConfig(input).i18n).toEqual({ structure: 'multiple_files', locales: ['fr', 'en'], default_locale: 'fr' });
});

test('a default language outside the list is an error', () => {
  expect(() => cmsConfig({ ...input, defaultLocale: 'es' })).toThrow('es');
});

test('a content file becomes a singleton', () => {
  const [page] = cmsConfig(input).singletons ?? [];
  expect(page).toMatchObject({ name: 'page', label: 'Page', file: 'src/lib/content/{{locale}}.json', format: 'json', i18n: true });
  expect(page?.fields.map((field) => field.name)).toEqual(['hero', 'steps', 'questions', 'notes']);
});

test('a content group lists its files under one name in the sidebar', () => {
  const { singletons, ...withoutSingletons } = input;
  const config = cmsConfig({
    ...withoutSingletons,
    fileGroups: [{ name: 'pages', label: 'Pages', icon: 'web', files: singletons ?? [] }]
  });
  expect(config.singletons).toBeUndefined();
  const [pages] = config.collections ?? [];
  expect(pages).toMatchObject({ name: 'pages', label: 'Pages', icon: 'web', format: 'json', i18n: true });
  expect('files' in pages! && pages.files[0]).toMatchObject({ name: 'page', label: 'Page', file: 'src/lib/content/{{locale}}.json', i18n: true });
  expect('files' in pages! && pages.files[0]?.fields.map((field) => field.name)).toEqual(['hero', 'steps', 'questions', 'notes']);
});

test('content groups come before blog folders', () => {
  const config = cmsConfig({
    ...input,
    fileGroups: [{ name: 'pages', label: 'Pages', files: [] }],
    collections: [{ name: 'posts', label: 'Articles', folder: 'src/lib/content/posts', contract: postContract }]
  });
  expect(config.collections?.map(({ name }) => name)).toEqual(['pages', 'posts']);
});

test('a site without a blog has no collections at all', () => {
  expect('collections' in cmsConfig(input)).toBe(false);
});

test('a content folder becomes a collection people can add to, as Markdown files', () => {
  const config = cmsConfig({
    ...input,
    collections: [{ name: 'posts', label: 'Articles', labelSingular: 'Article', folder: 'src/lib/content/posts', contract: postContract }]
  });
  const [posts] = config.collections ?? [];
  expect(posts).toMatchObject({
    name: 'posts',
    label: 'Articles',
    label_singular: 'Article',
    folder: 'src/lib/content/posts',
    create: true,
    extension: 'md',
    format: 'yaml-frontmatter',
    i18n: { initial_locales: 'default' }
  });
  expect(posts && 'fields' in posts && posts.fields.map((field) => field.name)).toEqual(['title', 'published', 'photo', 'body']);
});

test('saved names stay plain, so a login service with strict file rules accepts them', () => {
  const config = cmsConfig(input);
  expect(config.slug).toEqual({ encoding: 'ascii', clean_accents: true });
  expect(config.media_libraries.default.config.slugify_filename).toBe(true);
});

test('photos are converted and scaled down when uploaded, so a phone photo can be served as it is', () => {
  expect(cmsConfig(input).media_libraries.default.config.transformations.raster_image).toEqual({ format: 'webp', quality: 85, width: 2048, height: 2048 });
});

test('an image field only offers photo formats, which are the ones that get converted', () => {
  const { accept } = named(contractFields(postContract), 'photo');
  expect(accept).toBe('image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif');
  expect(accept).not.toContain('svg');
  expect(accept).not.toContain('gif');
});

test('a new folder entry starts in the default language, while file pages stay in every language', () => {
  const files = { name: 'pages', label: 'Pages', files: [{ name: 'home', label: 'Home', file: 'src/lib/content/home.{{locale}}.json', contract: pageContract }] };
  const folder = { name: 'posts', label: 'Blog', folder: 'src/lib/content/posts', contract: postContract };
  const [group, posts] = cmsConfig({ ...input, singletons: undefined, fileGroups: [files], collections: [folder] }).collections!;
  expect(group.i18n).toBe(true);
  expect(posts.i18n).toEqual({ initial_locales: 'default' });
});

const projectContract = z.strictObject({ name: line('Name'), summary: paragraph('Summary') });
const projects: ContentFolder<typeof projectContract> = {
  name: 'projects',
  label: 'Projects',
  folder: 'src/lib/content/projects',
  contract: projectContract,
  identifierField: 'name'
};

test('a folder can name the field a new entry file name comes from, written after its fields', () => {
  const { singletons: _singletons, ...withoutContent } = input;
  const [folder] = cmsConfig({ ...withoutContent, collections: [projects] }).collections!;
  expect(folder).toMatchObject({ name: 'projects', identifier_field: 'name' });
  expect(Object.keys(folder!).slice(-2)).toEqual(['fields', 'identifier_field']);
});

test('an identifier field that is not one of the folder fields is an error, naming it', () => {
  const { singletons: _singletons, ...withoutContent } = input;
  for (const identifierField of ['title', 'toString', '']) {
    const folder = { ...projects, identifierField } as ContentFolder;
    expect(() => cmsConfig({ ...withoutContent, collections: [folder] })).toThrow(`"${identifierField}"`);
  }
});

test('a folder without an identifier field generates what it did before', () => {
  const folder = { name: 'posts', label: 'Blog', folder: 'src/lib/content/posts', contract: postContract };
  const [posts] = cmsConfig({ ...input, collections: [folder] }).collections!;
  expect('identifier_field' in posts!).toBe(false);
  expect(Object.keys(posts!)).toEqual(['name', 'label', 'folder', 'create', 'extension', 'format', 'i18n', 'fields']);
});

test('the identifier field type only accepts the folder contract field names', () => {
  const typed: ContentFolder<typeof projectContract> = {
    ...projects,
    // @ts-expect-error `title` is not a field of this contract
    identifierField: 'title'
  };
  expect(typed.identifierField as string).toBe('title');
});
