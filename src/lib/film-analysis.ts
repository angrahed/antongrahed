/**
 * Build-time analysis of film scans: dominant palette, channel histograms and
 * scan metadata. Pure Node (sharp + exif-reader) so it runs both inside the
 * Astro build and directly with `node`.
 */
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import exifReader from "exif-reader";
import sharp from "sharp";

export interface FilmAnalysis {
	width: number;
	height: number;
	scan: { scanner: string | null; software: string | null; edited: boolean };
	palette: { hex: string; share: number }[];
	histogram: { l: number[]; r: number[]; g: number[]; b: number[] };
	meanLuminance: number;
}

const SAMPLE_SIZE = 120;
const HISTOGRAM_BINS = 32;
const PALETTE_SIZE = 5;
const KMEANS_ITERATIONS = 20;
const MERGE_DELTA_E = 4;
const CACHE_FILE = path.join(process.cwd(), "node_modules/.cache/film-analysis/v1.json");
const IMAGE_EXTENSION = /\.(jpe?g|png|webp|avif)$/i;

/* ---------- colour maths (sRGB <-> OKLab) ---------- */

type Lab = [number, number, number];

const srgbToLinear = (channel: number) => {
	const c = channel / 255;
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const linearToSrgb = (channel: number) => {
	const c = Math.min(1, Math.max(0, channel));
	const encoded = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
	return Math.round(encoded * 255);
};

const SRGB_TO_LINEAR_LUT = Array.from({ length: 256 }, (_, index) => srgbToLinear(index));

function rgbToOklab(r: number, g: number, b: number): Lab {
	const lr = SRGB_TO_LINEAR_LUT[r] ?? 0;
	const lg = SRGB_TO_LINEAR_LUT[g] ?? 0;
	const lb = SRGB_TO_LINEAR_LUT[b] ?? 0;
	const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
	const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
	const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	];
}

function oklabToHex([L, A, B]: Lab) {
	const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
	const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
	const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
	const rgb = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	];
	return `#${rgb.map((channel) => linearToSrgb(channel).toString(16).padStart(2, "0")).join("")}`;
}

const distanceSquared = (a: Lab, b: Lab) =>
	(a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** Deterministic PRNG so the palette never changes between builds. */
function mulberry32(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function kMeansPalette(points: Lab[]): { hex: string; share: number }[] {
	if (points.length === 0) return [];
	const random = mulberry32(0x5eed);
	const k = Math.min(PALETTE_SIZE, points.length);

	// k-means++ initialisation
	const centroids: Lab[] = [points[Math.floor(random() * points.length)] as Lab];
	const nearest = new Float64Array(points.length).fill(Number.POSITIVE_INFINITY);
	while (centroids.length < k) {
		const latest = centroids.at(-1) as Lab;
		let total = 0;
		for (let index = 0; index < points.length; index += 1) {
			const d = distanceSquared(points[index] as Lab, latest);
			if (d < (nearest[index] ?? 0)) nearest[index] = d;
			total += nearest[index] ?? 0;
		}
		if (total === 0) break;
		let target = random() * total;
		let chosen = points.length - 1;
		for (let index = 0; index < points.length; index += 1) {
			target -= nearest[index] ?? 0;
			if (target <= 0) {
				chosen = index;
				break;
			}
		}
		centroids.push([...(points[chosen] as Lab)]);
	}

	const assignment = new Int32Array(points.length);
	for (let iteration = 0; iteration < KMEANS_ITERATIONS; iteration += 1) {
		const sums = centroids.map(() => [0, 0, 0, 0]);
		let moved = false;
		for (let index = 0; index < points.length; index += 1) {
			const point = points[index] as Lab;
			let best = 0;
			let bestDistance = Number.POSITIVE_INFINITY;
			for (let c = 0; c < centroids.length; c += 1) {
				const d = distanceSquared(point, centroids[c] as Lab);
				if (d < bestDistance) {
					bestDistance = d;
					best = c;
				}
			}
			if (assignment[index] !== best) moved = true;
			assignment[index] = best;
			const sum = sums[best] as number[];
			sum[0] = (sum[0] ?? 0) + point[0];
			sum[1] = (sum[1] ?? 0) + point[1];
			sum[2] = (sum[2] ?? 0) + point[2];
			sum[3] = (sum[3] ?? 0) + 1;
		}
		for (let c = 0; c < centroids.length; c += 1) {
			const [sumL, sumA, sumB, count] = sums[c] as [number, number, number, number];
			if (count > 0) {
				centroids[c] = [sumL / count, sumA / count, sumB / count];
				continue;
			}
			// Empty cluster: re-seed on the point farthest from its centroid.
			let farthest = 0;
			let farthestDistance = -1;
			for (let index = 0; index < points.length; index += 1) {
				const d = distanceSquared(points[index] as Lab, centroids[assignment[index] ?? 0] as Lab);
				if (d > farthestDistance) {
					farthestDistance = d;
					farthest = index;
				}
			}
			centroids[c] = [...(points[farthest] as Lab)];
			moved = true;
		}
		if (!moved && iteration > 0) break;
	}

	const counts = new Array<number>(centroids.length).fill(0);
	for (const cluster of assignment) counts[cluster] = (counts[cluster] ?? 0) + 1;

	// Merge clusters that are visually the same colour (ΔE OKLab×100 < 4).
	let clusters = centroids
		.map((centroid, index) => ({ centroid, count: counts[index] ?? 0 }))
		.filter((cluster) => cluster.count > 0)
		.sort((left, right) => right.count - left.count);
	const mergeThreshold = (MERGE_DELTA_E / 100) ** 2;
	let merged = true;
	while (merged) {
		merged = false;
		outer: for (let i = 0; i < clusters.length; i += 1) {
			for (let j = i + 1; j < clusters.length; j += 1) {
				const left = clusters[i];
				const right = clusters[j];
				if (!left || !right) continue;
				if (distanceSquared(left.centroid, right.centroid) >= mergeThreshold) continue;
				const total = left.count + right.count;
				left.centroid = [
					(left.centroid[0] * left.count + right.centroid[0] * right.count) / total,
					(left.centroid[1] * left.count + right.centroid[1] * right.count) / total,
					(left.centroid[2] * left.count + right.centroid[2] * right.count) / total,
				];
				left.count = total;
				clusters.splice(j, 1);
				merged = true;
				break outer;
			}
		}
	}
	clusters = clusters.sort((left, right) => right.count - left.count);

	return clusters.map(({ centroid, count }) => ({
		hex: oklabToHex(centroid),
		share: Math.round((count / points.length) * 1000) / 1000,
	}));
}

/* ---------- EXIF ---------- */

const cleanExifString = (value: unknown) =>
	typeof value === "string" ? value.replace(/\0/g, "").trim() || null : null;

function normaliseScanner(make: string | null, model: string | null) {
	const upperMake = make?.toUpperCase() ?? "";
	if (upperMake === "NORITSU KOKI" && model === "QSS-32_33") return "Noritsu QSS-32";
	if (upperMake === "NORITSU KOKI" && model === "EZ Controller") return "Noritsu (EZ Controller)";
	if (upperMake === "FUJI PHOTO FILM CO., LTD." && model === "SP500") {
		return "Fujifilm Frontier SP-500";
	}
	const joined = [make, model].filter(Boolean).join(" ").trim();
	return joined || null;
}

function readScanMetadata(exif: Buffer | undefined): FilmAnalysis["scan"] {
	if (!exif) return { edited: false, scanner: null, software: null };
	try {
		const tags = exifReader(exif);
		const image = (tags.Image ?? {}) as Record<string, unknown>;
		const software = cleanExifString(image.Software);
		return {
			edited: software ? /lightroom|photoshop|capture one/i.test(software) : false,
			scanner: normaliseScanner(cleanExifString(image.Make), cleanExifString(image.Model)),
			software,
		};
	} catch {
		return { edited: false, scanner: null, software: null };
	}
}

/* ---------- cache ---------- */

type CacheRecord = Record<string, FilmAnalysis>;
let cachePromise: Promise<CacheRecord> | undefined;
let cacheDirty = false;

function loadCache() {
	cachePromise ??= readFile(CACHE_FILE, "utf8")
		.then((text) => {
			const parsed = JSON.parse(text) as unknown;
			return parsed && typeof parsed === "object" ? (parsed as CacheRecord) : {};
		})
		.catch(() => ({}));
	return cachePromise;
}

async function saveCache() {
	if (!cacheDirty) return;
	try {
		const cache = await loadCache();
		await mkdir(path.dirname(CACHE_FILE), { recursive: true });
		await writeFile(CACHE_FILE, JSON.stringify(cache));
		cacheDirty = false;
	} catch {
		// A missing cache only costs time on the next build.
	}
}

const cacheKey = async (absPath: string) => {
	const info = await stat(absPath);
	return `${path.basename(absPath)}:${info.size}:${info.mtimeMs}`;
};

/* ---------- analysis ---------- */

async function computeAnalysis(absPath: string): Promise<FilmAnalysis> {
	const metadata = await sharp(absPath).metadata();
	const rotated = (metadata.orientation ?? 1) >= 5;
	const width = (rotated ? metadata.height : metadata.width) ?? 0;
	const height = (rotated ? metadata.width : metadata.height) ?? 0;

	const { data, info } = await sharp(absPath)
		.rotate()
		.resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: "inside" })
		.removeAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	const channels = info.channels;
	const pixelCount = info.width * info.height;
	const emptyBins = () => new Array<number>(HISTOGRAM_BINS).fill(0);
	const bins = { b: emptyBins(), g: emptyBins(), l: emptyBins(), r: emptyBins() };
	const count = (values: number[], value: number) => {
		const bin = Math.min(HISTOGRAM_BINS - 1, Math.floor((value / 256) * HISTOGRAM_BINS));
		values[bin] = (values[bin] ?? 0) + 1;
	};
	const points: Lab[] = [];
	let luminanceTotal = 0;

	for (let pixel = 0; pixel < pixelCount; pixel += 1) {
		const offset = pixel * channels;
		const r = data[offset] ?? 0;
		const g = data[offset + 1] ?? r;
		const b = data[offset + 2] ?? r;
		const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
		luminanceTotal += luma;
		count(bins.r, r);
		count(bins.g, g);
		count(bins.b, b);
		count(bins.l, luma);
		points.push(rgbToOklab(r, g, b));
	}

	const maxBin = Math.max(1, ...bins.l, ...bins.r, ...bins.g, ...bins.b);
	const normalise = (values: number[]) =>
		values.map((value) => Math.round((value / maxBin) * 1000) / 1000);

	return {
		height,
		histogram: {
			b: normalise(bins.b),
			g: normalise(bins.g),
			l: normalise(bins.l),
			r: normalise(bins.r),
		},
		meanLuminance: Math.round((luminanceTotal / Math.max(1, pixelCount) / 255) * 1000) / 1000,
		palette: kMeansPalette(points),
		scan: readScanMetadata(metadata.exif),
		width,
	};
}

export async function analyzeFilmFile(absPath: string): Promise<FilmAnalysis> {
	const cache = await loadCache();
	let key: string | undefined;
	try {
		key = await cacheKey(absPath);
		const cached = cache[key];
		if (cached) return cached;
	} catch {
		key = undefined;
	}

	const analysis = await computeAnalysis(absPath);
	if (key) {
		cache[key] = analysis;
		cacheDirty = true;
	}
	return analysis;
}

export async function analyzeFilmDirectory(dir: string): Promise<Record<string, FilmAnalysis>> {
	const files = (await readdir(dir)).filter((file) => IMAGE_EXTENSION.test(file)).sort();
	const results: Record<string, FilmAnalysis> = {};
	let cursor = 0;

	const worker = async () => {
		while (cursor < files.length) {
			const file = files[cursor] as string;
			cursor += 1;
			results[file] = await analyzeFilmFile(path.join(dir, file));
		}
	};

	await Promise.all(Array.from({ length: Math.min(4, files.length) }, worker));
	await saveCache();
	return results;
}
