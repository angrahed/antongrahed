# antongrahed.com

Personal website of Anton Grahed, Research Analyst in the Office of the Chief Economist at the EBRD.

The design is a "research instrument": quiet type on paper, with the technical detail carried by real data. The home page opens on Figure 1, an interactive chart and tile map of 30 post-communist economies built from World Bank and V-Dem data. Its views cover income over time, the distribution of income across economies in any year (against 1990), recovery since 1990, convergence with advanced economies (income as a share of the G7, the United States or the EU-15 over time, and a catch-up scatter of relative income against relative growth), life expectancy and liberal democracy. Project cards read their figures from the GitHub API, and the film archive shows scan metadata, colour palettes and histograms computed from each negative scan at build time.

## Stack

- [Astro 5](https://astro.build): static site, content collections, cross-document view transitions
- Plain CSS with one token set and two themes (`light-dark()`); tokens live in `src/styles/site.css`
- [IBM Plex Sans Variable and Plex Mono](https://www.ibm.com/plex/), self-hosted via Fontsource
- [Expressive Code](https://expressive-code.com) for code blocks, configured in `ec.config.mjs`
- [Pagefind](https://pagefind.app) for full-text search inside the ⌘K command palette (production builds only)
- sharp and exif-reader for build-time film analysis; Natural Earth (world-atlas) for the film map

## Commands

| Command             | Action                                                                |
| :------------------ | :-------------------------------------------------------------------- |
| `pnpm install`      | Install dependencies                                                  |
| `pnpm dev`          | Dev server at `localhost:4321`                                        |
| `pnpm check`        | Type-check with `astro check`                                         |
| `pnpm lint`         | Lint with Biome                                                       |
| `pnpm build`        | Production build to `./dist/` (+ Pagefind indexing)                   |
| `pnpm preview`      | Preview the production build (needed for search)                      |
| `pnpm verify:site`  | Browser checks against `pnpm preview --port 4322` (needs Chrome)      |
| `pnpm data:refresh` | Re-fetch the World Bank and GitHub snapshots                          |
| `pnpm data:basemap` | Regenerate the dot-matrix land map for the film page                  |

`node scripts/generate-brand-assets.mjs` regenerates `public/icon.svg`, `public/favicon.ico` and `public/social-card.png`. The favicon is the initials AG in white on ink, matching the header's wordmark once it folds on scroll; the social card draws a static Figure 1 from the snapshot.

## Data

Builds never call an API. They read committed snapshots in `src/data/generated/`:

- `transition.json`: World Bank WDI series (GDP per capita PPP, growth, CPI and deflator inflation, trade, life expectancy) for 30 economies from 1990, V-Dem's liberal democracy index (read from Our World in Data's copy, since the full V-Dem release is several hundred megabytes), and population-weighted GDP per capita for three benchmarks (G7, United States, EU-15) built from member countries' GDP per capita and population. The figure uses income, life expectancy, democracy and the benchmarks; growth, inflation and trade are kept for the CSV download.
- `github.json`: repository stats and cleaned README HTML for the projects in `src/data/projects.ts`.
- `basemap.json`: projected land dots for the film map.

`pnpm data:refresh` rewrites a snapshot only when its contents change. The `refresh-data` workflow runs it every Monday and opens a pull request when anything moved (enable "Allow GitHub Actions to create and approve pull requests" in the repository settings).

The Figure 1 data is downloadable at `/data/transition.csv`.

## Structure

- `src/layouts/Site.astro`: the one page shell (header, footer, status bar, command palette, theme)
- `src/components/home/TransitionFigure.astro` + `src/lib/transition.ts`: Figure 1; the library computes scales, paths and bins for both the server render and the browser
- `src/components/film/`: film strip, archive, place map (Figure 2) and viewer; `src/lib/film.ts` builds the catalogue
- `src/components/projects/`, `src/pages/projects/`: project cards and pages
- `src/data/`: hand-edited metadata (projects, film places and notes, stamps, books) plus generated snapshots

## Adding content

- **Film:** drop scans into `src/assets/film/` named `YYYY_MM_location.jpg`. Places are matched in `src/data/film-places.ts`; titles, alt text, camera and film stock can be set per frame in `src/data/film-notes.ts`.
- **Projects:** add an entry to `src/data/projects.ts` and its repository to `scripts/fetch-data.mjs`, then run `pnpm data:refresh`.
- **Writing, stamps, books:** these sections are built but switched off. Flip the flags in `siteFeatures` in `src/site.config.ts`; posts go in `src/content/post/`.

## Previous designs

The design before this one (the Game of Life version) is preserved on branch `archive/2026-10-alternative-design` and tag `site-v2-alternative`.
