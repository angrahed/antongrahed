import PlexMono from "@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff";
import PlexSansLight from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-300-normal.woff";
import PlexSansSemiBold from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff";
import { getAllPosts } from "@/data/post";
import { siteConfig, siteFeatures } from "@/site.config";
import { getFormattedDate } from "@/utils/date";
import { Resvg } from "@resvg/resvg-js";
import type { APIContext, InferGetStaticPropsType } from "astro";
import satori, { type SatoriOptions } from "satori";
import { html } from "satori-html";

const ogOptions: SatoriOptions = {
	// debug: true,
	fonts: [
		{
			data: Buffer.from(PlexSansLight),
			name: "IBM Plex Sans",
			style: "normal",
			weight: 300,
		},
		{
			data: Buffer.from(PlexSansSemiBold),
			name: "IBM Plex Sans",
			style: "normal",
			weight: 600,
		},
		{
			data: Buffer.from(PlexMono),
			name: "IBM Plex Mono",
			style: "normal",
			weight: 400,
		},
	],
	height: 630,
	width: 1200,
};

const markup = (title: string, pubDate: string) =>
	html`<div tw="flex flex-col w-full h-full bg-[#f4f7fb] text-[#0b1b2e]">
		<div tw="flex items-center justify-between w-full px-16 pt-14">
			<div tw="flex items-center">
				<div
					tw="flex items-center justify-center w-10 h-10 bg-[#0f62fe] text-white text-base"
					style="font-weight: 600;"
				>
					AG
				</div>
				<p tw="ml-4 text-2xl" style="font-weight: 600;">${siteConfig.title}</p>
			</div>
			<p tw="text-xl text-[#5f7088]">antongrahed.com</p>
		</div>
		<div tw="flex flex-col flex-1 w-full px-16 justify-center">
			<h1 tw="text-6xl" style="font-weight: 300; line-height: 1.15;">${title}</h1>
			<p tw="mt-8 text-2xl text-[#44566c]" style="font-family: 'IBM Plex Mono';">${pubDate}</p>
		</div>
		<div tw="flex w-full h-2 bg-[#0f62fe]"></div>
	</div>`;

type Props = InferGetStaticPropsType<typeof getStaticPaths>;

export async function GET(context: APIContext) {
	const { pubDate, title } = context.props as Props;

	const postDate = getFormattedDate(pubDate, {
		month: "long",
		weekday: "long",
	});
	const svg = await satori(markup(title, postDate), ogOptions);
	const png = new Resvg(svg).render().asPng();
	return new Response(png, {
		headers: {
			"Cache-Control": "public, max-age=31536000, immutable",
			"Content-Type": "image/png",
		},
	});
}

export async function getStaticPaths() {
	if (!siteFeatures.posts) return [];

	const posts = await getAllPosts();
	return posts
		.filter(({ data }) => !data.ogImage)
		.map((post) => ({
			params: { slug: post.id },
			props: {
				pubDate: post.data.updatedDate ?? post.data.publishDate,
				title: post.data.title,
			},
		}));
}
