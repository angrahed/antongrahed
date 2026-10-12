/**
 * Regenerates the brand assets:
 *   - public/icon.svg        the initials, AG, in white on ink (the header's folded state)
 *   - public/favicon.ico     the same at 16, 32 and 48 px
 *   - public/social-card.png default Open Graph card (1200x630): name, headline and a static Figure 1
 *
 * Run from the repo root: node scripts/generate-brand-assets.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import opentype from "opentype.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plexFile = (pkg, file) => path.join(root, "node_modules", "@fontsource", pkg, "files", file);

const readArrayBuffer = (filePath) => {
	const buf = fs.readFileSync(filePath);
	return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};

const sans = (weight) =>
	opentype.parse(
		readArrayBuffer(plexFile("ibm-plex-sans", `ibm-plex-sans-latin-${weight}-normal.woff`)),
	);
const fonts = { light: sans(300), medium: sans(500), regular: sans(400), semibold: sans(600) };

// opentype.js's toPathData() emits NaN for some valid quadratic segments (e.g. in "Ukraine"),
// so path data is serialised here from the glyph commands.
const round = (value) => Math.round(value * 10) / 10;
const pathData = (glyphPath) =>
	glyphPath.commands
		.map((c) => {
			if (c.type === "M" || c.type === "L") return `${c.type}${round(c.x)} ${round(c.y)}`;
			if (c.type === "Q") return `Q${round(c.x1)} ${round(c.y1)} ${round(c.x)} ${round(c.y)}`;
			if (c.type === "C")
				return `C${round(c.x1)} ${round(c.y1)} ${round(c.x2)} ${round(c.y2)} ${round(c.x)} ${round(c.y)}`;
			return "Z";
		})
		.join("");
const text = (value, x, y, size, font, fill) =>
	`<path d="${pathData(font.getPath(value, x, y, size, { kerning: false }))}" fill="${fill}"/>`;
const textWidth = (value, size, font) => font.getAdvanceWidth(value, size, { kerning: false });

/* ---------- favicon: the initials, white on ink ---------- */
const initials = fonts.semibold.getPath("AG", 0, 0, 16.5, { kerning: false });
const box = initials.getBoundingBox();
const dx = (32 - (box.x2 - box.x1)) / 2 - box.x1;
const dy = (32 - (box.y2 - box.y1)) / 2 - box.y1;
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
	<rect width="32" height="32" rx="7" fill="#0b1b2e"/>
	<path transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)})" d="${pathData(initials)}" fill="#ffffff"/>
</svg>
`;
fs.writeFileSync(path.join(root, "public", "icon.svg"), iconSvg);
console.log("wrote public/icon.svg");

// favicon.ico holding PNG images (supported by every current browser).
const sizes = [16, 32, 48];
const pngs = sizes.map((size) =>
	new Resvg(iconSvg, { fitTo: { mode: "width", value: size } }).render().asPng(),
);
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, index) => {
	const entry = 6 + 16 * index;
	header.writeUInt8(size, entry);
	header.writeUInt8(size, entry + 1);
	header.writeUInt16LE(1, entry + 4);
	header.writeUInt16LE(32, entry + 6);
	header.writeUInt32LE(pngs[index].length, entry + 8);
	header.writeUInt32LE(offset, entry + 12);
	offset += pngs[index].length;
});
fs.writeFileSync(path.join(root, "public", "favicon.ico"), Buffer.concat([header, ...pngs]));
console.log("wrote public/favicon.ico");

/* ---------- default social card: headline and a static Figure 1 ---------- */
const ink = "#0b1b2e";
const ink2 = "#44566c";
const ink3 = "#5f7088";
const W = 1200;
const H = 630;

const data = JSON.parse(
	fs.readFileSync(path.join(root, "src/data/generated/transition.json"), "utf8"),
);
const series = data.values.gdppc;
const years = data.years;
const frame = { x: 72, y: 312, w: 1056, h: 250 };
const plot = { x: frame.x + 28, y: frame.y + 26, w: frame.w - 28 - 130, h: frame.h - 52 };
const [lo, hi] = [Math.log10(1000), Math.log10(50000)];
const px = (index) => plot.x + (index / (years.length - 1)) * plot.w;
const py = (value) => plot.y + (1 - (Math.log10(value) - lo) / (hi - lo)) * plot.h;
const pathOf = (values) => {
	let d = "";
	let pen = false;
	values.forEach((value, index) => {
		if (value == null) {
			pen = false;
			return;
		}
		d += `${pen ? "L" : "M"}${px(index).toFixed(1)} ${py(value).toFixed(1)}`;
		pen = true;
	});
	return d;
};
const median = years.map((_, index) => {
	const values = Object.values(series)
		.map((values) => values[index])
		.filter((value) => value != null)
		.sort((a, b) => a - b);
	if (values.length < 15) return null;
	const middle = Math.floor(values.length / 2);
	return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
});
// End labels: keep at least 21px between them; a displaced label gets a short leader line.
const highlighted = [
	{ colour: "#0f62fe", label: "Poland", values: series.POL },
	{ colour: "#1baf7a", label: "Russia", values: series.RUS },
	{ colour: "#eb6834", label: "Ukraine", values: series.UKR },
	{ colour: ink, label: "Median", values: median },
];
const placed = highlighted
	.map((item) => ({ ...item, labelY: 0, y: py(item.values.at(-1)) }))
	.sort((a, b) => a.y - b.y);
placed.forEach((item, index) => {
	item.labelY = index === 0 ? item.y : Math.max(item.y, placed[index - 1].labelY + 21);
});
const endLabels = placed
	.map((item) => {
		const x = px(item.values.length - 1);
		const leader =
			Math.abs(item.labelY - item.y) > 2
				? `<path d="M${x + 7} ${item.y}L${plot.x + plot.w + 12} ${item.labelY}" stroke="#aebccd" stroke-width="1" fill="none"/>`
				: "";
		return `${leader}<circle cx="${x}" cy="${item.y}" r="5" fill="${item.colour}" stroke="#fff" stroke-width="2"/>${text(item.label, plot.x + plot.w + 16, item.labelY + 6, 17, fonts.regular, ink2)}`;
	})
	.join("");
const mark = (x, y, dx, dy) =>
	`<path d="M${x + dx * 6} ${y}h${dx * 12}M${x} ${y + dy * 6}v${dy * 12}" stroke="${ink3}" stroke-width="1.5"/>`;

// The header's wordmark: capitals A and G heavier than the rest of the name.
const wordmark = (x, y, size) => {
	const parts = [
		["A", fonts.semibold],
		["nton ", fonts.regular],
		["G", fonts.semibold],
		["rahed", fonts.regular],
	];
	let cursor = x;
	return parts
		.map(([value, font]) => {
			const glyphs = text(value, cursor, y, size, font, ink);
			cursor += textWidth(value, size, font);
			return glyphs;
		})
		.join("");
};
const headline = ["Working on the economics", "of transition."];
const card = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
	<rect width="${W}" height="${H}" fill="#f4f7fb"/>
	${wordmark(72, 88, 26)}
	${text("antongrahed.com", W - 72 - textWidth("antongrahed.com", 18, fonts.regular), 87, 18, fonts.regular, ink3)}
	${headline.map((line, index) => text(line, 68, 186 + index * 70, 64, fonts.light, ink)).join("")}
	<rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" fill="#fff" stroke="#aebccd"/>
	${mark(frame.x - 1, frame.y - 1, -1, -1)}${mark(frame.x + frame.w + 1, frame.y - 1, 1, -1)}${mark(frame.x - 1, frame.y + frame.h + 1, -1, 1)}${mark(frame.x + frame.w + 1, frame.y + frame.h + 1, 1, 1)}
	${[2000, 5000, 10000, 20000, 50000].map((tick) => `<line x1="${plot.x}" x2="${plot.x + plot.w}" y1="${py(tick)}" y2="${py(tick)}" stroke="#e6ebf2"/>`).join("")}
	<g fill="none" stroke-linecap="round" stroke-linejoin="round">
		${Object.values(series)
			.map(
				(values) => `<path d="${pathOf(values)}" stroke="rgba(11,27,46,0.16)" stroke-width="1.4"/>`,
			)
			.join("")}
		<path d="${pathOf(median)}" stroke="${ink}" stroke-width="2"/>
		<path d="${pathOf(series.UKR)}" stroke="#eb6834" stroke-width="3"/>
		<path d="${pathOf(series.RUS)}" stroke="#1baf7a" stroke-width="3"/>
		<path d="${pathOf(series.POL)}" stroke="#0f62fe" stroke-width="3"/>
	</g>
	${endLabels}
	${text(`Figure 1. GDP per capita in 30 post-communist economies, ${years[0]}–${years.at(-1)}. Source: World Bank WDI.`, 72, 600, 17, fonts.regular, ink3)}
	<rect y="${H - 6}" width="${W}" height="6" fill="#0f62fe"/>
</svg>`;

fs.writeFileSync(path.join(root, "public", "social-card.png"), new Resvg(card).render().asPng());
console.log("wrote public/social-card.png");
