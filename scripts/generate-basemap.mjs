/**
 * Generates the dot-matrix land basemap used by the film location map.
 *
 *   pnpm data:basemap   ->  src/data/generated/basemap.json
 *
 * Land comes from world-atlas (Natural Earth 1:50m). Dots are sampled on a
 * 0.75° (latitude) grid, square once projected, inside BASEMAP_BBOX and stored already projected (see src/lib/geo.ts).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { geoContains } from "d3-geo";
import { feature } from "topojson-client";
import { BASEMAP_BBOX, projectLonLat } from "../src/lib/geo.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPACING = 0.75;
// Longitude is compressed by cos(47°) in the projection, so step it wider to keep the dot grid square.
const LON_STEP = SPACING / Math.cos((47 * Math.PI) / 180);
const round = (value) => Math.round(value * 100) / 100;

const topology = JSON.parse(
	await readFile(path.join(root, "node_modules/world-atlas/land-50m.json"), "utf8"),
);
const land = feature(topology, topology.objects.land);

const dots = [];
for (let lat = BASEMAP_BBOX.north - SPACING / 2; lat > BASEMAP_BBOX.south; lat -= SPACING) {
	for (let lon = BASEMAP_BBOX.west + LON_STEP / 2; lon < BASEMAP_BBOX.east; lon += LON_STEP) {
		if (!geoContains(land, [lon, lat])) continue;
		const [x, y] = projectLonLat(lon, lat);
		dots.push([round(x), round(y)]);
	}
}

const output = {
	bbox: [BASEMAP_BBOX.west, BASEMAP_BBOX.south, BASEMAP_BBOX.east, BASEMAP_BBOX.north],
	dots,
	spacing: SPACING,
};
const outFile = path.join(root, "src/data/generated/basemap.json");
await mkdir(path.dirname(outFile), { recursive: true });
const json = JSON.stringify(output);
await writeFile(outFile, `${json}\n`);
console.log(`wrote ${path.relative(root, outFile)}: ${dots.length} dots, ${json.length} bytes`);
