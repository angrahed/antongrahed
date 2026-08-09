export const LIFE_SIZE = 25;
export const LIFE_STEP_MS = 420;
export const LIFE_SCENE_LENGTH = 24;
export const LIFE_TRANSITION_MS = 280;

type Pattern = readonly string[];
type Placement = {
	column: number;
	pattern: Pattern;
	row: number;
};

const PULSAR: Pattern = [
	"..111...111..",
	".............",
	"1....1.1....1",
	"1....1.1....1",
	"1....1.1....1",
	"..111...111..",
	".............",
	"..111...111..",
	"1....1.1....1",
	"1....1.1....1",
	"1....1.1....1",
	".............",
	"..111...111..",
];

const BEACON: Pattern = ["11..", "11..", "..11", "..11"];
const BLINKER: Pattern = ["111"];
const TOAD: Pattern = [".111", "111."];
const VERTICAL_TOAD: Pattern = [".1", "11", "11", "1."];
const PENTADECATHLON: Pattern = ["..1....1..", "11.1111.11", "..1....1.."];
const VERTICAL_PENTADECATHLON: Pattern = [
	".1.",
	".1.",
	"1.1",
	".1.",
	".1.",
	".1.",
	".1.",
	"1.1",
	".1.",
	".1.",
];
const KOKS_GALAXY: Pattern = [
	"..1..1.1.",
	"11.1.111.",
	".1......1",
	"11.....1.",
	".........",
	".1.....11",
	"1......1.",
	".111.1.11",
	".1.1..1..",
];
const TUMBLER: Pattern = [".1.....1.", "1.1...1.1", "1..1.1..1", "..1...1..", "..11.11.."];
const FIGURE_EIGHT: Pattern = ["11....", "11.1..", "....1.", ".1....", "..1.11", "....11"];
const ACORN: Pattern = [".1.....", "...1...", "11..111"];
const R_PENTOMINO: Pattern = [".11", "11.", ".1."];
const GLIDER: Pattern = [".1.", "..1", "111"];

export const LIFE_SCENES: readonly (readonly Placement[])[] = [
	[
		{ column: 6, pattern: PULSAR, row: 6 },
		{ column: 1, pattern: BEACON, row: 1 },
	],
	[
		{ column: 4, pattern: PENTADECATHLON, row: 5 },
		{ column: 17, pattern: VERTICAL_PENTADECATHLON, row: 11 },
	],
	[
		{ column: 3, pattern: TOAD, row: 3 },
		{ column: 17, pattern: BEACON, row: 3 },
		{ column: 4, pattern: BLINKER, row: 12 },
		{ column: 17, pattern: VERTICAL_TOAD, row: 14 },
		{ column: 5, pattern: BEACON, row: 19 },
	],
	[
		{ column: 8, pattern: KOKS_GALAXY, row: 8 },
		{ column: 2, pattern: GLIDER, row: 2 },
	],
	[
		{ column: 2, pattern: TUMBLER, row: 3 },
		{ column: 10, pattern: ACORN, row: 10 },
		{ column: 16, pattern: FIGURE_EIGHT, row: 15 },
	],
	[
		{ column: 11, pattern: R_PENTOMINO, row: 10 },
		{ column: 3, pattern: GLIDER, row: 3 },
		{ column: 15, pattern: GLIDER, row: 15 },
	],
];

function placePattern(board: Uint8Array, placement: Placement) {
	placement.pattern.forEach((line, patternRow) => {
		for (let patternColumn = 0; patternColumn < line.length; patternColumn += 1) {
			if (line[patternColumn] !== "1") continue;
			const row = placement.row + patternRow;
			const column = placement.column + patternColumn;
			if (row < 0 || row >= LIFE_SIZE || column < 0 || column >= LIFE_SIZE) continue;
			board[row * LIFE_SIZE + column] = 1;
		}
	});
}

export function createLifeScene(sceneIndex: number) {
	const board = new Uint8Array(LIFE_SIZE * LIFE_SIZE);
	const scene =
		LIFE_SCENES[((sceneIndex % LIFE_SCENES.length) + LIFE_SCENES.length) % LIFE_SCENES.length];
	for (const placement of scene ?? []) placePattern(board, placement);
	return board;
}

export function evolveLife(board: Uint8Array) {
	const next = new Uint8Array(board.length);

	for (let row = 0; row < LIFE_SIZE; row += 1) {
		for (let column = 0; column < LIFE_SIZE; column += 1) {
			let neighbours = 0;
			for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
				for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
					if (rowOffset === 0 && columnOffset === 0) continue;
					const neighbourRow = row + rowOffset;
					const neighbourColumn = column + columnOffset;
					if (
						neighbourRow < 0 ||
						neighbourRow >= LIFE_SIZE ||
						neighbourColumn < 0 ||
						neighbourColumn >= LIFE_SIZE
					) {
						continue;
					}
					neighbours += board[neighbourRow * LIFE_SIZE + neighbourColumn] ?? 0;
				}
			}

			const index = row * LIFE_SIZE + column;
			const alive = board[index] === 1;
			next[index] = neighbours === 3 || (alive && neighbours === 2) ? 1 : 0;
		}
	}

	return next;
}

export function countLivingCells(board: Uint8Array) {
	return board.reduce((total, cell) => total + cell, 0);
}

export function initialLifeAge(index: number) {
	return 1 + ((index * 17 + Math.floor(index / LIFE_SIZE) * 7) % 3);
}
