# TxTxx.github.io

Personal academic homepage and blog built with Astro.

## Local development

```bash
npm install
npm run dev
```

## Content

- Blog posts live in `src/content/blog`
- Profile content lives in `src/data/profile.ts`
- GitHub Pages deploys from `.github/workflows/deploy.yml`

## Reading pages and Atlas

- Maintenance and Obsidian/Zotero integration boundaries: [docs/reading-site.md](docs/reading-site.md)
- After building, verify integration data and reading routes with `node scripts/verify-reading-site.mjs`.
- Verify light/dark preferences and page coverage with `node scripts/verify-theme.mjs`.
