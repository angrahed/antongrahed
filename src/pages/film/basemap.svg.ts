import basemap from "@/data/generated/basemap.json";
import { basemapSize } from "@/lib/geo";

/**
 * Dot-matrix land layer for the film map, used as a CSS mask so it takes the
 * theme's colour. Each dot is a zero-length round-capped segment of one path.
 */
export const GET = () => {
	const { height, width } = basemapSize();
	const scale = 10;
	const d = (basemap.dots as [number, number][])
		.map(([x, y]) => `M${Math.round(x * scale)} ${Math.round(y * scale)}h0`)
		.join("");
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.round(width * scale)} ${Math.round(height * scale)}"><path d="${d}" stroke="#000" stroke-width="${(basemap.spacing * scale * 0.38).toFixed(2)}" stroke-linecap="round"/></svg>`;
	return new Response(svg, { headers: { "Content-Type": "image/svg+xml" } });
};
