# @yesid/content-contract

One description of what a site owner can edit. Write it once with Zod and you get the TypeScript types, the build checks and the [Sveltia CMS](https://sveltiacms.app) fields from the same file.

It checks structure only: a required text can't be blank, a misspelled field is refused, and a list the layout depends on keeps its size. It never limits what the owner says.

## Install

Releases are tarballs on GitHub, not on npm. Pin the exact version, and install Zod yourself so the project keeps a single copy:

```sh
bun add -E zod https://github.com/mgkdante/yesid.content-contract/releases/download/v0.6.0/yesid-content-contract-0.6.0.tgz
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
| `image(label, { hint, optional, shared })` | `image`, photo formats | Not blank, unless `optional` |
| `date(label, { hint, shared })` | `datetime`, date only | A real `YYYY-MM-DD` date |
| `group(label, shape, collapsed = true)` | `object` | Unknown fields are refused |
| `list(label, item, { count, optional })` | `list` | Exactly `count` items; otherwise at least one, unless `optional`. Asking for both is an error |

`shared: true` keeps one value for every language, edited in the default one.

## Other exports

- `cmsConfig(input)`: the whole CMS configuration. `fileGroups` put several JSON files under one name in the sidebar, such as a site's pages, with one file per language. `singletons` are single JSON files; a site with only singletons shows them as one list, without separators. `collections` are folders people can add to, such as a blog, with one Markdown file per language of an entry. `branch` defaults to `main`, and the media folders to `static/images/uploads` and `/images/uploads`. A new folder entry starts in the default language, and the editor offers the others. A folder's `identifierField` names the field a new entry's file name is made from, once, when it is first saved; without it the editor uses `title`, or a random code when there is no `title`. Type the folder as `ContentFolder<typeof contract>` to have the name checked as you write it. It throws on a setup that would only fail later: a `repo` that isn't `owner/name`, a `loginOrigin` that isn't only an HTTP or HTTPS origin, with no path or trailing slash, a slug that isn't valid or that the login service keeps for itself, a default language outside the list, a blank branch, nothing to edit, a name used twice at the same level, or an `identifierField` that isn't one of its folder's fields.
- `contractFields(contract)`: only the CMS fields, for a configuration you build yourself.
- `canonicalJson(contract, text)`: a content file rewritten in the contract's order, which is the order the CMS saves in. Run it after reordering a contract, so the next save only shows what really changed.

## Login service

`cmsConfig` sends sign-in to `loginOrigin`, and every CMS request to `loginOrigin/siteSlug`. That service signs people in and makes the commits, so editors don't need a GitHub account. It is not part of this package.

It also keeps saved names plain, because the service can limit which file paths it accepts. A post titled `Été à Montréal` is saved as `ete-a-montreal.fr.md`. A photo named `Mon Été.JPG` is saved as `mon-ete.webp`, at most 2048 pixels wide or tall, converted in the browser before it is uploaded. `image()` fields only offer photo formats, because SVG and animated images aren't converted. An image added inside rich text or the asset library has no such limit, and ASCII names can still contain `~`, so a service's rules should allow it.

## Documentation

- [Architecture](https://yesid-dev.notion.site/4113e863069081a0a0a2d6e6e00b1f63): how the package works, how a site uses it, and how releases are cut and proven. Public, and each page names the commit it was checked against.
## License

MIT
