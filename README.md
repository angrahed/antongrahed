# antongrahed.com

Personal website of Anton Grahed — economist at the EBRD's Office of the Chief Economist, film photographer, and stamp collector.

The main portfolio is a motion-led editorial design built around IBM Plex, a restrained blue-and-paper palette, a Conway's Game of Life hero, and dedicated film and philately archives. Writing and supporting routes retain the site's original Carbon-inspired shell.

Built on the [Astro Cactus](https://github.com/chrismwilliams/astro-theme-cactus) starter, heavily redesigned.

## Stack

- [Astro 5](https://astro.build) — static site, content collections, view transitions
- [Tailwind CSS 4](https://tailwindcss.com) — CSS-first config; design tokens live in `src/styles/global.css`
- [IBM Plex](https://www.ibm.com/plex/) — self-hosted via Fontsource
- [Pagefind](https://pagefind.app) — static search (⌘K), production builds only
- [Satori](https://github.com/vercel/satori) — Open Graph image generation
- GitHub Actions checks for every push and pull request to `main`

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

- `src/pages/` — motion-led home, film gallery, stamp catalogue, writing, supporting pages, and 404
- `src/styles/alternative.css` — the main portfolio, gallery, and catalogue design system
- `src/styles/global.css` — Carbon-derived design tokens (`--color-*`), IBM Plex font tokens, component classes (`.shell`, `.eyebrow`, `.title`, `.btn-primary`, …)
- `src/content/` — content collections for posts, notes, and tags (currently empty)
- `scripts/generate-brand-assets.mjs` — regenerates `public/icon.svg` (AG monogram) and `public/social-card.png` from IBM Plex
- `src/archived/` — unrouted blog/notes pages kept from the starter for future use

## Adding content

Blog infrastructure (posts, notes, tags, RSS, OG images, webmentions) is wired up; drop `.md`/`.mdx` files into `src/content/post/` to publish. Film photos go in `src/assets/film/` named `YYYY_MM_location.jpeg` — the gallery, captions, and lightbox pick them up automatically.
