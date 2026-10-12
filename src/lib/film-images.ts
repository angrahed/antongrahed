import { getImage } from "astro:assets";
import type { FilmFrame } from "@/lib/film";

export interface FilmImage {
	height: number;
	src: string;
	srcset: string;
	width: number;
}

/** Responsive WebP renditions of a scan, capped at the source width. */
export const filmImage = async (
	frame: FilmFrame,
	widths: readonly number[] = [480, 800, 1200, 1600],
	quality = 82,
): Promise<FilmImage> => {
	const sourceWidth = frame.image.width;
	const largest = Math.min(sourceWidth, Math.max(...widths));
	const renditions = [...new Set([...widths.filter((width) => width < largest), largest])].sort(
		(a, b) => a - b,
	);
	const image = await getImage({
		format: "webp",
		quality,
		src: frame.image,
		width: largest,
		widths: renditions,
	});
	return {
		height: Number(image.attributes.height),
		src: image.src,
		srcset: image.srcSet.attribute,
		width: Number(image.attributes.width),
	};
};
