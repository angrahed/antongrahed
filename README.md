# antongrahed.com

Personal website of Anton Grahed — economist at the EBRD's Office of the Chief Economist, film photographer, and stamp collector.

The design is inspired by IBM's website and the [Carbon Design System](https://carbondesignsystem.com/): IBM Plex throughout (Sans for the interface, Serif for long-form writing, Mono for labels and captions), IBM Blue `#0f62fe`, sharp corners, hairline rules, and the black footer. Light and dark themes both map onto Carbon's White and Gray 100 palettes.

Built on the [Astro Cactus](https://github.com/chrismwilliams/astro-theme-cactus) starter, heavily redesigned.

## Stack

- [Astro 5](https://astro.build) — static site, content collections, view transitions
- [Tailwind CSS 4](https://tailwindcss.com) — CSS-first config; design tokens live in `src/styles/global.css`
- [IBM Plex](https://www.ibm.com/plex/) — self-hosted via Fontsource
- [Pagefind](https://pagefind.app) — static search (⌘K), production builds only
- [Satori](https://github.com/vercel/satori) — Open Graph image generation
- GitHub Pages via the CI workflow in `.github/workflows/ci.yml`

## Commands

| Command        | Action                                                |
| :------------- | :---------------------------------------------------- |
| `pnpm install` | Install dependencies                                  |
| `pnpm dev`     | Dev server at `localhost:4321`                        |
| `pnpm check`   | Type-check with `astro check`                         |
| `pnpm build`   | Production build to `./dist/` (+ Pagefind indexing)   |
| `pnpm preview` | Preview the production build (needed to test search)  |
| `pnpm lint`    | Lint with Biome                                       |

## Structure

- `src/pages/` — home, about, projects (password-gated demo), film gallery (lightbox), stamps, 404
- `src/styles/global.css` — Carbon-derived design tokens (`--color-*`), IBM Plex font tokens, component classes (`.shell`, `.eyebrow`, `.title`, `.btn-primary`, …)
- `src/content/` — content collections for posts, notes, and tags (currently empty)
- `scripts/generate-brand-assets.mjs` — regenerates `public/icon.svg` (AG monogram) and `public/social-card.png` from IBM Plex
- `src/archived/` — unrouted blog/notes pages kept from the starter for future use

## Adding content

Blog infrastructure (posts, notes, tags, RSS, OG images, webmentions) is wired up; drop `.md`/`.mdx` files into `src/content/post/` to publish. Film photos go in `src/assets/film/` named `YYYY_MM_location.jpeg` — the gallery, captions, and lightbox pick them up automatically.
