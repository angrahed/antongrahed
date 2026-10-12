/**
 * Build-time film catalogue: joins the scans in src/assets/film with filename
 * dates, mapped places, hand-written notes and the per-frame analysis.
 */
import path from "node:path";
import type { ImageMetadata } from "astro";
import { type FilmNote, filmNotes } from "@/data/film-notes";
import { type FilmPlace, resolveFilmPlace } from "@/data/film-places";
import { analyzeFilmDirectory, analyzeFilmFile, type FilmAnalysis } from "@/lib/film-analysis";

export interface FilmFrame {
	alt: string;
	analysis: FilmAnalysis;
	aspect: number;
	camera: string | null;
	dateLabel: string;
	file: string;
	frame: number;
	id: string;
	image: ImageMetadata;
	month: number | null;
	orientation: "landscape" | "portrait" | "square";
	place: FilmPlace | null;
	stock: string | null;
	title: string;
	year: number | null;
}

const filmModules = import.meta.glob<{ default: ImageMetadata }>(
	"/src/assets/film/*.{jpg,jpeg,JPG,JPEG,png,webp,avif}",
	{ eager: true },
);

const WORD_LABELS: Record<string, string> = { eu: "EU", lot: "LOT", moma: "MoMA" };

const titleCase = (words: readonly string[]) =>
	words
		.map((word) => WORD_LABELS[word] ?? `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
		.join(" ");

const foldName = (name: string) =>
	name
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
const sameName = (left: string, right: string) => foldName(left) === foldName(right);

function parseFilename(file: string) {
	const stem = file.replace(/\.[^/.]+$/, "");
	const id = `film-${stem
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")}`;
	const parts = stem.split(/[-_]+/);
	const hasDate =
		parts.length > 2 && /^\d{4}$/.test(parts[0] ?? "") && /^\d{1,2}$/.test(parts[1] ?? "");
	const year = hasDate ? Number(parts[0]) : null;
	const month = hasDate ? Number(parts[1]) : null;
	const words = (hasDate ? parts.slice(2) : parts)
		.join(" ")
		.replace(/\d+$/, "")
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean);
	return {
		dateLabel: year && month ? `${String(month).padStart(2, "0")}/${year}` : "",
		id,
		month,
		words,
		year,
	};
}

async function loadFilmFrames(): Promise<FilmFrame[]> {
	const directory = path.join(process.cwd(), "src/assets/film");
	const analyses = await analyzeFilmDirectory(directory);

	const unsorted = await Promise.all(
		Object.entries(filmModules).map(async ([modulePath, module]) => {
			const file = modulePath.split("/").pop() ?? modulePath;
			const parsed = parseFilename(file);
			const note: FilmNote = filmNotes[parsed.id] ?? {};
			const place = resolveFilmPlace(parsed.words);
			const analysis = analyses[file] ?? (await analyzeFilmFile(path.join(directory, file)));
			const width = analysis.width || module.default.width;
			const height = analysis.height || module.default.height;
			const aspect = Math.round((width / height) * 10_000) / 10_000;
			const wordTitle = titleCase(parsed.words) || "Untitled frame";
			// "Gdansk" from the filename becomes the place's proper name "Gdańsk".
			const title =
				note.title ?? (place && sameName(place.name, wordTitle) ? place.name : wordTitle);
			const placeSuffix = place && !sameName(place.name, title) ? `, ${place.name}` : "";

			return {
				alt: note.alt ?? `Film photograph, ${title}${placeSuffix}`,
				analysis,
				aspect,
				camera: note.camera ?? null,
				dateLabel: parsed.dateLabel,
				file,
				frame: 0,
				id: parsed.id,
				image: module.default,
				month: parsed.month,
				orientation:
					aspect >= 0.95 && aspect <= 1.05 ? "square" : aspect > 1 ? "landscape" : "portrait",
				place,
				stock: note.stock ?? null,
				title,
				year: parsed.year,
			} satisfies FilmFrame;
		}),
	);

	const ids = new Set<string>();
	for (const frame of unsorted) {
		if (ids.has(frame.id)) throw new Error(`Duplicate film frame id: ${frame.id}`);
		ids.add(frame.id);
	}

	const sortKey = (value: number | null) => value ?? Number.POSITIVE_INFINITY;
	return unsorted
		.sort(
			(left, right) =>
				sortKey(left.year) - sortKey(right.year) ||
				sortKey(left.month) - sortKey(right.month) ||
				left.file.localeCompare(right.file),
		)
		.map((frame, index) => ({ ...frame, frame: index + 1 }));
}

let framesPromise: Promise<FilmFrame[]> | undefined;

export function getFilmFrames(): Promise<FilmFrame[]> {
	framesPromise ??= loadFilmFrames();
	return framesPromise;
}

export function getFilmPlaces(frames: readonly FilmFrame[]) {
	const counts = new Map<string, { count: number; place: FilmPlace }>();
	for (const { place } of frames) {
		if (!place) continue;
		const entry = counts.get(place.id) ?? { count: 0, place };
		entry.count += 1;
		counts.set(place.id, entry);
	}
	return [...counts.values()].sort(
		(left, right) => right.count - left.count || left.place.name.localeCompare(right.place.name),
	);
}

export function getFilmYears(frames: readonly FilmFrame[]) {
	const counts = new Map<number, number>();
	for (const { year } of frames) {
		if (year === null) continue;
		counts.set(year, (counts.get(year) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([year, count]) => ({ count, year }))
		.sort((left, right) => left.year - right.year);
}
