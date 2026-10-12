export interface FilmNote {
	alt?: string;
	camera?: string;
	stock?: string;
	title?: string;
}

/**
 * Hand-written notes per frame id. Camera and film stock are left empty on purpose:
 * the scans' EXIF only records the lab scanner, so fill these in by hand, e.g.
 * `"film-2026-07-paris-01": { camera: "Nikon F5", stock: "Kodak Portra 400" }`.
 */
export const filmNotes: Record<string, FilmNote> = {
	"film-2025-04-cafe-moskau": {
		alt: "Café Moskau in Berlin beneath a darkening sky",
		title: "Café Moskau",
	},
	"film-2026-03-spitafields": { title: "Spitalfields" },
	"film-2026-07-paris-08": {
		alt: "Passenger aircraft and two smaller aircraft crossing a pale sky over Paris",
	},
};
