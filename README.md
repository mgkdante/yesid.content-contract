# @yesid/content-contract

One description of what a site owner can edit. Write it once with Zod and you get the TypeScript types, the build checks and the [Sveltia CMS](https://sveltiacms.app) fields from the same file.

It checks structure only: a required text can't be blank, a misspelled field is refused, and a list the layout depends on keeps its size. It never limits what the owner says.

## Install

Releases are tarballs on GitHub, not on npm. Pin the exact version, and install Zod yourself so the project keeps a single copy:

```sh
bun add -E zod https://github.com/mgkdante/yesid.content-contract/releases/download/v0.2.0/yesid-content-contract-0.2.0.tgz
```

The package ships TypeScript source, so your `tsconfig.json` needs `allowImportingTsExtensions`. It is meant for build scripts, tests and `import type`. If you import it at runtime through Vite's server build, list it in `ssr.noExternal`.

## Use

```ts
import { z } from 'zod';
import { cmsConfig, group, line, list, paragraph } from '@yesid/content-contract';

export const siteText = z.strictObject({
  hero: group('Top of page', { title: line('Title'), intro: paragraph('Introduction') }, false),
  // The layout has room for exactly three, so the CMS locks adding, removing and reordering.
  steps: list('Steps', z.strictObject({ title: line('Title'), body: paragraph('Text') }), { count: 3 })
});

export type SiteText = z.infer<typeof siteText>;

export const config = cmsConfig({
  repo: 'owner/site',
  loginOrigin: 'https://login.example.com',
  siteSlug: 'site',
  locales: ['fr', 'en'],
  defaultLocale: 'fr',
  singletons: [{ name: 'site-text', label: 'Site text', file: 'src/lib/content/{{locale}}.json', contract: siteText }]
});
```

Write `config` to YAML in a build script, with `Bun.YAML.stringify(config, null, 2)` for example, and check in a test that the committed file still matches.

## Builders

| Builder | CMS field | Rule |
| --- | --- | --- |
| `line(label, hint?)` | `string` | Not blank |
| `paragraph(label, hint?)` | `text` | Not blank |
| `optionalParagraph(label, hint?)` | `text` | May be empty |
| `richText(label, hint?)` | `richtext` | Not blank |
| `image(label, { hint, optional, shared })` | `image` | Not blank, unless `optional` |
| `date(label, { hint, shared })` | `datetime`, date only | A real `YYYY-MM-DD` date |
| `group(label, shape, collapsed = true)` | `object` | Unknown fields are refused |
| `list(label, item, { count, optional })` | `list` | Exactly `count` items; otherwise at least one, unless `optional` |

`shared: true` keeps one value for every language, edited in the default one.

## Other exports

- `cmsConfig(input)`: the whole CMS configuration. `singletons` are one JSON file per language. `collections` are folders people can add to, such as a blog, with one Markdown file per language of an entry. `branch` defaults to `main`, and the media folders to `static/images/uploads` and `/images/uploads`.
- `contractFields(contract)`: only the CMS fields, for a configuration you build yourself.
- `canonicalJson(contract, text)`: a content file rewritten in the contract's order, which is the order the CMS saves in. Run it after reordering a contract, so the next save only shows what really changed.

## Login service

`cmsConfig` sends sign-in to `loginOrigin`, and every CMS request to `loginOrigin/siteSlug`. That service signs people in and makes the commits, so editors don't need a GitHub account. It is not part of this package.

## License

MIT
