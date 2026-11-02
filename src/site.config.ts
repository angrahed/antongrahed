import type { SiteConfig } from "@/types";

export const siteConfig: SiteConfig = {
	// Used as both a meta property (src/components/BaseHead.astro L:31 + L:49) & the generated satori png (src/pages/og-image/[slug].png.ts)
	author: "Anton Grahed",
	// Date.prototype.toLocaleDateString() parameters, found in src/utils/date.ts.
	date: {
		locale: "en-GB",
		options: {
			day: "numeric",
			month: "short",
			year: "numeric",
		},
	},
	// Used as the default description meta property and webmanifest description
	description: "Anton Grahed, Research Analyst at the EBRD's Office of the Chief Economist.",
	// HTML lang property, found in src/layouts/Base.astro L:18 & astro.config.ts L:48
	lang: "en-GB",
	// Meta property, found in src/components/BaseHead.astro L:42
	ogLocale: "en_GB",
	/* 
		- Used to construct the meta title property found in src/components/BaseHead.astro L:11 
		- The webmanifest name found in astro.config.ts L:42
		- The link value found in src/components/layout/Header.astro L:35
		- In the footer found in src/components/layout/Footer.astro L:12
	*/
	title: "Anton Grahed",
	// ! Please remember to replace the following site property with your own domain, used in astro.config.ts
	url: "https://antongrahed.com",
};

// Flip a section to `true` to restore its existing navigation and content.
export const siteFeatures = {
	books: false,
	posts: false,
	stamps: false,
} as const;

// Primary navigation, shared by the header, footer, and command palette.
export const menuLinks: { path: string; title: string }[] = [
	{ path: "/about/", title: "About" },
	{ path: "/projects/", title: "Projects" },
	{ path: "/film/", title: "Film" },
	...(siteFeatures.posts ? [{ path: "/posts/", title: "Writing" }] : []),
	...(siteFeatures.stamps ? [{ path: "/stamps/", title: "Stamps" }] : []),
	...(siteFeatures.books ? [{ path: "/#books", title: "Books" }] : []),
];

export const contact = {
	email: "graheda@ebrd.com",
	github: "https://github.com/angrahed",
} as const;
