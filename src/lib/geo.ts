/**
 * Shared projection for the film location map. Equirectangular, with longitude
 * scaled by cos(47°) so mid-latitude Europe keeps its proportions. Units are
 * degrees of latitude; scale them to pixels in the UI.
 */
export const BASEMAP_BBOX = { east: 131, north: 62, south: 32, west: -11 } as const;

const LON_SCALE = Math.cos((47 * Math.PI) / 180);

export function projectLonLat(lon: number, lat: number): [number, number] {
	return [(lon - BASEMAP_BBOX.west) * LON_SCALE, BASEMAP_BBOX.north - lat];
}

export function basemapSize(): { height: number; width: number } {
	return {
		height: BASEMAP_BBOX.north - BASEMAP_BBOX.south,
		width: (BASEMAP_BBOX.east - BASEMAP_BBOX.west) * LON_SCALE,
	};
}
