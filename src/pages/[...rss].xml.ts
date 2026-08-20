import rss from "@astrojs/rss";
import type { GetStaticPaths } from "astro";
import { getAllPosts } from "@/data/post";
import { siteConfig, siteFeatures } from "@/site.config";

export const getStaticPaths = (() => {
	return siteFeatures.posts ? [{ params: { rss: "rss" } }] : [];
}) satisfies GetStaticPaths;

export const GET = async () => {
	const posts = await getAllPosts();

	return rss({
		title: siteConfig.title,
		description: siteConfig.description,
		site: import.meta.env.SITE,
		items: posts.map((post) => ({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.publishDate,
			link: `posts/${post.id}/`,
		})),
	});
};
