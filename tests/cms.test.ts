import { expect, test } from 'bun:test';
import { z } from 'zod';
import { cmsConfig, contractFields, date, group, image, line, list, optionalParagraph, paragraph, richText, type CmsConfigInput, type CmsField } from '../src/index.ts';

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
  const [page] = cmsConfig(input).singletons;
  expect(page).toMatchObject({ name: 'page', label: 'Page', file: 'src/lib/content/{{locale}}.json', format: 'json', i18n: true });
  expect(page?.fields.map((field) => field.name)).toEqual(['hero', 'steps', 'questions', 'notes']);
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
    i18n: true
  });
  expect(posts?.fields.map((field) => field.name)).toEqual(['title', 'published', 'photo', 'body']);
});
