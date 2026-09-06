# Reading website maintenance

## Atlas integration contract

Atlas renders the existing `src/data/researchGraph.json` export. Obsidian and Zotero remain the source of truth. Website presentation changes must not modify the Vault, the Zotero database, export scope, synchronization commands, or publishing scripts.

- Preserve node IDs, WikiLink relationships, `status`, `readingLevel`, `sourceUrl`, and `zoteroUri` from the export.
- `atlasLabel` follows Obsidian's `atlas_label`: a blank value means no persistent map label. Hovering or opening a paper may still display its full title.
- Atlas is a single, minimal constellation view on desktop and mobile. Do not add a search box, a paper list, or view-switch controls. Keep interaction on the graph and the existing paper reader.
- Only render the existing exported `atlasCardHtml` and `atlasCardImages`. Do not import additional private notes or annotations into the public site.
- Do not infer reading completion from automatic recommendations. Radar does not insert nodes into Atlas; the existing Obsidian export decides membership.
- Same-field and same-concept links are not citations. Label them separately from direct note links.
- Current commands remain `npm run sync:research` and `npm run atlas:publish`; the latter publishes, so do not use it merely to verify a UI change.

## Site-wide appearance

`ThemeHead` and `ThemeToggle` are shared by `BaseLayout` and the standalone Atlas page. Colors live in `src/styles/theme.css`. The first visit follows the system appearance; an explicit light/dark choice is saved under `txtxx-theme` in local storage and shared across same-origin pages and tabs. Storage restrictions must not disable the toggle.

Atlas listens for `txtxx:themechange` to recolor existing materials without rebuilding the graph or resetting the camera, active paper, or data mode. Its HTML fallback uses the same CSS tokens. Original figures and photographs are not inverted or filtered. Code blocks use Shiki's paired light/dark palettes.

After the normal build, run `node scripts/verify-theme.mjs` for preference-state tests, Atlas material checks and theme coverage across generated pages. These checks do not replace browser visual testing.

## Paper Radar

At the user's request on 2026-09-07, Paper Radar returned to its original edition-based presentation: the index shows the newest published daily edition, with the large title panel, date archive, complete paper cards and reading recommendation. The monthly compact list and collapsed daily text are no longer active. Historical Markdown and guide files remain intact; the global light/dark toggle remains available.

`papers` entries contain `title`, optional `short_title`, `url`, `summary` (up to 240 characters), `tags` (up to two), optional `publication`, `code_url`, and `guide_url`. `note` and `reading_status` are author-controlled: automation must not invent them. Legacy required edition fields remain supported for compatibility.

Individual editions preserve their canonical URLs and display their original text directly. If an edition supplies only structured papers, the same card layout renders those entries; existing legacy cards take precedence to avoid duplication. The earlier compact-list experiments are not part of the published site. Guides use their original large header and retain working navigation derived from actual section IDs and automatic-authoring attribution.

Keep key original-paper figures in the linked automatic guide. Usually use one method/design figure and one decisive experiment/ablation figure, with a short reading explanation, source, figure number, PDF page and verified reuse terms. Inspect the final crops and their desktop/mobile rendering. Text-only guides are an explicit fallback for access, reuse or extraction problems. Do not substitute generated cover art for evidence figures. This presentation rollback does not change the scheduled task or its key-figure requirement.

After changes, run `ASTRO_TELEMETRY_DISABLED=1 npm run build`, then `node scripts/verify-reading-site.mjs`. The second command verifies the published Atlas data against the existing export without accessing or modifying Obsidian or Zotero.

On 2026-09-07, the user explicitly approved publishing the current Atlas appearance, site-wide light/dark themes and restored edition-based Radar through the existing GitHub Pages workflow. Local figure samples, temporary PDFs, inactive compact-list experiments and the separately maintained automation prompt are excluded from this release. Sample files ending in `-preview.md` are excluded from ordinary builds before image imports; `PAPER_RADAR_PREVIEW=1` is for local inspection only and must not be set during deployment.

The scheduled task retains its key-figure reading requirement and protection for unrelated work. This release includes structured-paper card rendering, while continuing to support legacy edition HTML. Future unreviewed local interface changes still require separate publication approval; a scheduled content run must not commit or deploy them.
