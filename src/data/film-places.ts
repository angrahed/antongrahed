export interface FilmPlace {
	country: string;
	id: string;
	lat: number;
	lon: number;
	name: string;
	precision: "city" | "country";
}

export const filmPlaces: Record<string, FilmPlace> = {
	azerbaijan: {
		country: "Azerbaijan",
		id: "azerbaijan",
		lat: 40.15,
		lon: 47.58,
		name: "Azerbaijan",
		precision: "country",
	},
	baku: {
		country: "Azerbaijan",
		id: "baku",
		lat: 40.4093,
		lon: 49.8671,
		name: "Baku",
		precision: "city",
	},
	berlin: {
		country: "Germany",
		id: "berlin",
		lat: 52.52,
		lon: 13.405,
		name: "Berlin",
		precision: "city",
	},
	brussels: {
		country: "Belgium",
		id: "brussels",
		lat: 50.8503,
		lon: 4.3517,
		name: "Brussels",
		precision: "city",
	},
	gdansk: {
		country: "Poland",
		id: "gdansk",
		lat: 54.352,
		lon: 18.6466,
		name: "Gdańsk",
		precision: "city",
	},
	hel: { country: "Poland", id: "hel", lat: 54.6086, lon: 18.8008, name: "Hel", precision: "city" },
	istanbul: {
		country: "Türkiye",
		id: "istanbul",
		lat: 41.0082,
		lon: 28.9784,
		name: "Istanbul",
		precision: "city",
	},
	london: {
		country: "United Kingdom",
		id: "london",
		lat: 51.5074,
		lon: -0.1278,
		name: "London",
		precision: "city",
	},
	paris: {
		country: "France",
		id: "paris",
		lat: 48.8566,
		lon: 2.3522,
		name: "Paris",
		precision: "city",
	},
	"south-korea": {
		country: "South Korea",
		id: "south-korea",
		lat: 36.5,
		lon: 127.8,
		name: "South Korea",
		precision: "country",
	},
	warsaw: {
		country: "Poland",
		id: "warsaw",
		lat: 52.2297,
		lon: 21.0122,
		name: "Warsaw",
		precision: "city",
	},
	yerevan: {
		country: "Armenia",
		id: "yerevan",
		lat: 40.1792,
		lon: 44.4991,
		name: "Yerevan",
		precision: "city",
	},
};

/**
 * Location keywords from film filenames (lower-case, trailing digits stripped) -> place id.
 * Whole phrases are matched first, then single words. `null` means the place is
 * unknown and the frame is deliberately left off the map.
 */
export const filmLocationPlaces: Record<string, string | null> = {
	// Whole phrases
	"azeri mountain": "azerbaijan",
	"brick lane": "london",
	"cafe moskau": "berlin",
	clouds: null,
	"park jubel": "brussels",
	"st catherine": "brussels",
	"st gilles": "brussels",
	"tate modern": "london",
	"wasinki park": null, // Unknown: not guessed.

	// Single words
	baku: "baku",
	berlin: "berlin",
	brussels: "brussels",
	eu: "brussels",
	flagey: "brussels",
	gdansk: "gdansk",
	heathrow: "london",
	hel: "hel",
	istanbul: "istanbul",
	korea: "south-korea", // Assumed: country-level only, no city in the filename.
	moda: "istanbul", // Moda, Kadıköy.
	paris: "paris",
	richmond: "london", // Assumed: Richmond, London.
	soho: "london", // Assumed: Soho, London.
	spitafields: "london",
	warsaw: "warsaw",
	whitechapel: "london",
	yerevan: "yerevan",
};

/** Resolve normalised location words (e.g. ["lot", "warsaw"]) to a place. */
export function resolveFilmPlace(words: readonly string[]): FilmPlace | null {
	const phrase = words.join(" ").toLowerCase();
	if (phrase in filmLocationPlaces) {
		const id = filmLocationPlaces[phrase];
		return id ? (filmPlaces[id] ?? null) : null;
	}
	for (const word of words) {
		const id = filmLocationPlaces[word.toLowerCase()];
		if (id) return filmPlaces[id] ?? null;
	}
	return null;
}
