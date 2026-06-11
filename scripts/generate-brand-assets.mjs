/**
 * Regenerates the brand assets derived from IBM Plex:
 *   - public/icon.svg        AG monogram (IBM Plex Sans SemiBold outlines on IBM Blue)
 *   - public/social-card.png default Open Graph card (1200x630, matches og-image template)
 *
 * Run from the repo root: node scripts/generate-brand-assets.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import opentype from "opentype.js";
import satori from "satori";
import { html } from "satori-html";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plexFile = (pkg, file) => path.join(root, "node_modules", "@fontsource", pkg, "files", file);

const readArrayBuffer = (filePath) => {
	const buf = fs.readFileSync(filePath);
	return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};

/* ---------- favicon: blue square, white AG set in Plex Sans SemiBold ---------- */
const font = opentype.parse(
	readArrayBuffer(plexFile("ibm-plex-sans", "ibm-plex-sans-latin-600-normal.woff")),
);

const text = "AG";
const fontSize = 16;
const glyphPath = font.getPath(text, 0, 0, fontSize, { kerning: true });
const bbox = glyphPath.getBoundingBox();
const dx = (32 - (bbox.x2 - bbox.x1)) / 2 - bbox.x1;
const dy = (32 - (bbox.y2 - bbox.y1)) / 2 - bbox.y1;

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
	<rect width="32" height="32" fill="#0f62fe"/>
	<path transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)})" d="${glyphPath.toPathData(2)}" fill="#ffffff"/>
</svg>
`;
fs.writeFileSync(path.join(root, "public", "icon.svg"), iconSvg);
console.log("wrote public/icon.svg");

/* ---------- default social card (mirrors src/pages/og-image template) ---------- */
const markup = html`<div tw="flex flex-col w-full h-full bg-[#161616] text-[#f4f4f4]">
	<div tw="flex flex-col flex-1 w-full px-16 justify-center">
		<p
			tw="text-xl mb-8 text-[#8d8d8d] uppercase"
			style="font-family: 'IBM Plex Mono'; letter-spacing: 0.1em;"
		>
			antongrahed.com
		</p>
		<h1 tw="text-7xl text-white" style="font-weight: 300; line-height: 1.2;">Anton Grahed.</h1>
	</div>
	<div tw="flex items-center justify-between w-full px-16 pb-12">
		<div tw="flex items-center">
			<div
				tw="flex items-center justify-center w-16 h-16 bg-[#0f62fe] text-white text-3xl"
				style="font-weight: 600;"
			>
				AG
			</div>
			<p tw="ml-4 text-xl" style="font-weight: 600;">Research Analyst — EBRD</p>
		</div>
		<p tw="text-xl text-[#8d8d8d]" style="font-family: 'IBM Plex Mono';">BSC · MSC — LSE</p>
	</div>
	<div tw="flex w-full h-2 bg-[#0f62fe]"></div>
</div>`;

const svg = await satori(markup, {
	fonts: [
		{
			data: fs.readFileSync(plexFile("ibm-plex-sans", "ibm-plex-sans-latin-300-normal.woff")),
			name: "IBM Plex Sans",
			style: "normal",
			weight: 300,
		},
		{
			data: fs.readFileSync(plexFile("ibm-plex-sans", "ibm-plex-sans-latin-600-normal.woff")),
			name: "IBM Plex Sans",
			style: "normal",
			weight: 600,
		},
		{
			data: fs.readFileSync(plexFile("ibm-plex-mono", "ibm-plex-mono-latin-400-normal.woff")),
			name: "IBM Plex Mono",
			style: "normal",
			weight: 400,
		},
	],
	height: 630,
	width: 1200,
});

fs.writeFileSync(path.join(root, "public", "social-card.png"), new Resvg(svg).render().asPng());
console.log("wrote public/social-card.png");
