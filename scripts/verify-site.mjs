/*
 * Browser-level checks for the main portfolio site.
 *
 * Start a production preview on port 4322, then run:
 *   pnpm verify:site
 *
 * Override the server or Chrome binary when needed:
 *   BASE_URL=http://127.0.0.1:4322 PUPPETEER_EXECUTABLE_PATH=/path/to/chrome pnpm verify:site
 */
import { access, mkdir, readdir, readFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const BASE_URL = (process.env.BASE_URL ?? "http://127.0.0.1:4322").replace(/\/$/, "");
const SCREENSHOT_DIR = "/tmp/site-shots";
const GAME_OF_LIFE_SOURCE = new URL(
	"../src/components/alternative/GameOfLifeHero.astro",
	import.meta.url,
);
const FILM_ASSET_DIRECTORY = new URL("../src/assets/film/", import.meta.url);
const STAMP_MANIFEST_SOURCE = new URL("../src/data/stamps.ts", import.meta.url);
const STAMP_ASSET_DIRECTORY = new URL("../src/assets/stamps/", import.meta.url);
const FILM_PREVIEW_COUNT = 3;
const LIFE_SIZE = 25;
const LIFE_CELL_COUNT = LIFE_SIZE * LIFE_SIZE;
const LIFE_STEP_MS = 420;
const LIFE_SCENE_COUNT = 6;
const LIFE_SCENE_LENGTH = 24;
const LIFE_STATES = new Set(["dead", "newborn", "alive", "mature"]);
const ROOT_HEADING = "Working on the economics of transition.";
const HOME_ANCHOR_TARGETS = ["about", "projects", "archive", "contact"];
const STAMP_IDS = Array.from(
	{ length: 42 },
	(_, index) => `stamp-${String(index + 1).padStart(3, "0")}`,
);
const HEADER_HREFS = ["/", "/#about", "/#projects", "/film/"];
const FOOTER_HREFS = [...HEADER_HREFS];
const HIDDEN_REDIRECT_PATHS = ["/stamps/", "/posts/", "/tags/"];
const HIDDEN_NOT_FOUND_PATHS = ["/rss.xml"];
const SITE_ROUTES = [
	{
		activeHref: "/",
		canonicalPath: "/",
		label: "site home",
		pathname: "/",
	},
	{
		activeHref: "/film/",
		canonicalPath: "/film/",
		label: "site film",
		pathname: "/film/",
	},
];
const VIEWPORTS = [
	{ height: 1000, label: "desktop", width: 1440 },
	{ height: 900, label: "compact", width: 800 },
	{ height: 1024, label: "tablet", width: 768 },
	{ height: 844, label: "mobile", width: 390 },
	{ height: 800, label: "mobile-narrow", width: 320 },
];

const browserCandidates = [
	process.env.PUPPETEER_EXECUTABLE_PATH,
	process.env.CHROME_PATH,
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	"/Applications/Chromium.app/Contents/MacOS/Chromium",
	"/usr/bin/google-chrome-stable",
	"/usr/bin/google-chrome",
	"/usr/bin/chromium",
	"/usr/bin/chromium-browser",
].filter(Boolean);

const results = [];
let failureCount = 0;
let filmAssetIds = [];

function report(name, ok, detail = "") {
	const status = ok ? "PASS" : "FAIL";
	results.push(`${status}  ${name}${detail ? ` — ${detail}` : ""}`);
	if (!ok) failureCount += 1;
}

function describeError(error) {
	return error instanceof Error ? error.message : String(error);
}

function arraysEqual(left, right) {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function unorderedArraysEqual(left, right) {
	return arraysEqual([...left].sort(), [...right].sort());
}

function filmPreviewId(filename) {
	return `film-${filename
		.replace(/\.[^/.]+$/, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")}`;
}

function isAliveLifeState(state) {
	return state !== "dead";
}

function nextLifeGeneration(states, size) {
	const next = new Array(states.length).fill(false);
	for (let row = 0; row < size; row += 1) {
		for (let column = 0; column < size; column += 1) {
			let neighbours = 0;
			for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
				for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
					if (rowOffset === 0 && columnOffset === 0) continue;
					const neighbourRow = row + rowOffset;
					const neighbourColumn = column + columnOffset;
					if (
						neighbourRow < 0 ||
						neighbourRow >= size ||
						neighbourColumn < 0 ||
						neighbourColumn >= size
					) {
						continue;
					}
					if (states[neighbourRow * size + neighbourColumn]) neighbours += 1;
				}
			}

			const index = row * size + column;
			next[index] = neighbours === 3 || (states[index] && neighbours === 2);
		}
	}
	return next;
}

async function checkAlternativeSource() {
	try {
		const [source, filmAssetEntries, stampManifest, stampAssetEntries] = await Promise.all([
			readFile(GAME_OF_LIFE_SOURCE, "utf8"),
			readdir(FILM_ASSET_DIRECTORY, { withFileTypes: true }),
			readFile(STAMP_MANIFEST_SOURCE, "utf8"),
			readdir(STAMP_ASSET_DIRECTORY, { withFileTypes: true }),
		]);
		const lowerSource = source.toLowerCase();
		filmAssetIds = filmAssetEntries
			.filter((entry) => entry.isFile() && /\.(?:avif|gif|jpe?g|png|webp)$/i.test(entry.name))
			.map((entry) => filmPreviewId(entry.name))
			.sort();
		const stampAssetFiles = stampAssetEntries
			.filter((entry) => entry.isFile() && /^stamp-\d{3}\.jpe?g$/i.test(entry.name))
			.map((entry) => entry.name)
			.sort();
		const referencedStampFiles = [
			...stampManifest.matchAll(/@\/assets\/stamps\/([^"\n]+\.jpe?g)"/gi),
		]
			.map((match) => match[1])
			.sort();
		const requiredLifeHooks = [
			"data-life-art",
			"data-life-board",
			"data-life-cell",
			"data-life-generation",
			"data-life-paused",
			"data-life-running",
			"data-life-scene",
			"data-life-scene-count",
			"data-life-scene-length",
			"data-life-size",
			"data-life-step",
			"data-life-toggle",
			"data-column",
			"data-row",
			"data-state",
		].filter((token) => !lowerSource.includes(token));
		const legacyHeroTokens = [
			"data-abstract-art",
			"data-abstract-form",
			"data-form-kind",
			"data-motion-layer",
			"data-scroll-story",
			"--scroll-progress",
			"cut-paper",
			"data-pixel-journey",
			"alt-pixel-mark",
			"pixel-stamp",
			"crispedges",
			"journey__panorama",
			"journey__traveller",
		].filter((token) => lowerSource.includes(token));

		report(
			"site source: Game of Life hooks exist",
			requiredLifeHooks.length === 0,
			requiredLifeHooks.length === 0 ? "complete" : `missing ${requiredLifeHooks.join(", ")}`,
		);
		report(
			"site source: film preview IDs cover a unique image pool",
			filmAssetIds.length >= FILM_PREVIEW_COUNT &&
				new Set(filmAssetIds).size === filmAssetIds.length,
			`${filmAssetIds.length} images; ${new Set(filmAssetIds).size} unique IDs`,
		);
		report(
			"site source: old cut-paper and scroll-story hooks are absent",
			legacyHeroTokens.length === 0,
			legacyHeroTokens.join(", ") || "none",
		);
		report(
			"site source: all 42 stamp assets are referenced exactly once",
			stampAssetFiles.length === STAMP_IDS.length &&
				referencedStampFiles.length === STAMP_IDS.length &&
				new Set(referencedStampFiles).size === STAMP_IDS.length &&
				arraysEqual(stampAssetFiles, referencedStampFiles),
			`${stampAssetFiles.length} assets; ${referencedStampFiles.length} references; ${new Set(referencedStampFiles).size} unique references`,
		);
	} catch (error) {
		report("site source: static checks complete", false, describeError(error));
	}
}

async function findBrowser() {
	for (const candidate of browserCandidates) {
		try {
			await access(candidate);
			return candidate;
		} catch {
			// Try the next common installation path.
		}
	}

	throw new Error(
		"Chrome/Chromium was not found. Set PUPPETEER_EXECUTABLE_PATH to the browser executable.",
	);
}

function pageUrl(pathname) {
	return new URL(pathname, `${BASE_URL}/`).toString();
}

async function settle(page) {
	await page.evaluate(async () => {
		if (document.fonts?.ready) await document.fonts.ready;
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	});
}

function watchPage(page, label) {
	const errors = [];
	page.on("console", (message) => {
		const source = message.location().url;
		const isExpectedLocalAnalyticsError =
			message.type() === "error" && source.endsWith("/_vercel/insights/script.js");
		if (message.type() === "error" && !isExpectedLocalAnalyticsError) {
			errors.push(`console: ${message.text()}`);
		}
	});
	page.on("pageerror", (error) => errors.push(`page: ${describeError(error)}`));
	return () =>
		report(`${label}: no console or page errors`, errors.length === 0, errors.join(" | "));
}

async function open(page, pathname, label) {
	try {
		const response = await page.goto(pageUrl(pathname), {
			timeout: 15_000,
			waitUntil: "domcontentloaded",
		});
		const status = response?.status();
		const successfulResponse =
			typeof status === "number" && ((status >= 200 && status < 300) || status === 304);
		report(
			`${label}: returns a successful HTTP response`,
			successfulResponse,
			`status ${status ?? "unknown"}`,
		);
		if (page.isJavaScriptEnabled()) await settle(page);
		return successfulResponse;
	} catch (error) {
		report(`${label}: loads`, false, describeError(error));
		return false;
	}
}

async function checkRoot(browser) {
	const page = await browser.newPage();
	const finishErrorCheck = watchPage(page, "current root");

	try {
		await page.setViewport({ height: 1000, width: 1440 });
		if (!(await open(page, "/", "current root"))) return;

		const state = await page.evaluate(() => ({
			alternativeBody: document.body.classList.contains("alternative-site"),
			heading: document.querySelector("main h1, h1")?.textContent?.replace(/\s+/g, " ").trim(),
		}));
		report(
			"current root: expected main heading remains",
			state.heading === ROOT_HEADING,
			`found ${JSON.stringify(state.heading)}`,
		);
		report("current root: promoted portfolio shell is active", state.alternativeBody);
		await page.screenshot({ path: `${SCREENSHOT_DIR}/current-root-desktop.png`, fullPage: true });
	} catch (error) {
		report("current root: checks complete", false, describeError(error));
	} finally {
		finishErrorCheck();
		await page.close();
	}
}

async function checkHiddenRoutes(browser) {
	for (const pathname of HIDDEN_REDIRECT_PATHS) {
		const page = await browser.newPage();
		const label = `hidden route ${pathname}`;
		const finishErrorCheck = watchPage(page, label);

		try {
			await page.setViewport({ height: 900, width: 1440 });
			await page.goto(pageUrl(pathname), {
				timeout: 15_000,
				waitUntil: "domcontentloaded",
			});
			try {
				await page.waitForFunction(() => window.location.pathname === "/", {
					polling: 50,
					timeout: 5_000,
				});
			} catch {
				// The final URL assertion below reports a missing or incorrect redirect.
			}
			await settle(page);
			const state = await page.evaluate(() => ({
				heading: document.querySelector("main h1, h1")?.textContent?.replace(/\s+/g, " ").trim(),
				pathname: window.location.pathname,
			}));
			report(
				`${label}: redirects to the site home`,
				state.pathname === "/" && state.heading === ROOT_HEADING,
				`final path=${JSON.stringify(state.pathname)}; heading=${JSON.stringify(state.heading)}`,
			);
		} catch (error) {
			report(`${label}: redirect completes`, false, describeError(error));
		} finally {
			finishErrorCheck();
			await page.close();
		}
	}

	for (const pathname of HIDDEN_NOT_FOUND_PATHS) {
		const page = await browser.newPage();
		const label = `hidden route ${pathname}`;

		try {
			const response = await page.goto(pageUrl(pathname), {
				timeout: 15_000,
				waitUntil: "domcontentloaded",
			});
			report(
				`${label}: is not published`,
				response?.status() === 404 && page.url() === pageUrl(pathname),
				`status=${response?.status() ?? "unknown"}; final URL=${JSON.stringify(page.url())}`,
			);
		} catch (error) {
			report(`${label}: hidden-state check completes`, false, describeError(error));
		} finally {
			await page.close();
		}
	}
}

async function inspectAlternativeShell(page, route) {
	const structure = await page.evaluate(() => {
		const normalise = (value) => value?.toLowerCase().replace(/\s+/g, "") ?? "";
		const canonicalHref =
			document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "";
		let canonicalPath = "";
		try {
			canonicalPath = new URL(canonicalHref, window.location.href).pathname;
		} catch {
			canonicalPath = "invalid";
		}

		const nav = document.querySelector(".alt-header__nav");
		const links = nav ? [...nav.querySelectorAll("a[href]")] : [];
		const footerNav = document.querySelector('.alt-footer nav[aria-label="Footer navigation"]');
		const footerLinks = footerNav ? [...footerNav.querySelectorAll("a[href]")] : [];
		return {
			activeHrefs: links
				.filter((link) => link.getAttribute("aria-current") === "page")
				.map((link) => link.getAttribute("href")),
			bodyClass: document.body.className,
			canonicalHref,
			canonicalPath,
			footerHrefs: footerLinks.map((link) => link.getAttribute("href")),
			footerNavAriaLabel: footerNav?.getAttribute("aria-label") ?? "",
			hasAlternativeBody: document.body.classList.contains("alternative-site"),
			hasMain: Boolean(document.querySelector("main#main")),
			hasPagefindExclusion: document.body.getAttribute("data-pagefind-ignore") === "all",
			navAriaLabel: nav?.getAttribute("aria-label") ?? "",
			navHrefs: links.map((link) => link.getAttribute("href")),
			robots: normalise(document.querySelector('meta[name="robots" i]')?.getAttribute("content")),
		};
	});
	const prefix = route.label;

	report(
		`${prefix}: portfolio shell and main landmark exist`,
		structure.hasAlternativeBody && structure.hasMain,
		`body class=${JSON.stringify(structure.bodyClass)}`,
	);
	report(`${prefix}: included in Pagefind`, !structure.hasPagefindExclusion);
	report(
		`${prefix}: robots directive permits indexing`,
		structure.robots.includes("index") &&
			structure.robots.includes("follow") &&
			!structure.robots.includes("noindex") &&
			!structure.robots.includes("nofollow"),
		`content=${JSON.stringify(structure.robots)}`,
	);
	report(
		`${prefix}: canonical matches ${route.canonicalPath}`,
		structure.canonicalPath === route.canonicalPath,
		`href=${JSON.stringify(structure.canonicalHref)}`,
	);
	report(
		`${prefix}: header exposes the exact site navigation`,
		arraysEqual(structure.navHrefs, HEADER_HREFS) && Boolean(structure.navAriaLabel),
		`hrefs=${structure.navHrefs.join(", ") || "none"}`,
	);
	report(
		`${prefix}: footer exposes the complete site navigation`,
		arraysEqual(structure.footerHrefs, FOOTER_HREFS) && Boolean(structure.footerNavAriaLabel),
		`hrefs=${structure.footerHrefs.join(", ") || "none"}`,
	);
	report(
		`${prefix}: active navigation state matches the route`,
		arraysEqual(structure.activeHrefs, [route.activeHref]),
		`active=${structure.activeHrefs.join(", ") || "none"}`,
	);
}

async function inspectHome(page) {
	try {
		await page.waitForSelector('[data-alt-film-preview][data-alt-film-preview-ready="true"]', {
			timeout: 2_500,
		});
	} catch {
		// The readiness assertion below reports a client-side fallback or initialization failure.
	}
	const structure = await page.evaluate(
		({ allowedStates, anchorIds, expectedFilmIds }) => {
			const lifeArt = document.querySelector("[data-life-art]");
			const lifeBoard = document.querySelector("[data-life-board]");
			const lifeCells = lifeBoard ? [...lifeBoard.querySelectorAll("[data-life-cell]")] : [];
			const lifeHeading = document.querySelector("#life-hero-title");
			const lifeCursor = lifeHeading?.querySelector(".life-hero__cursor");
			const lifeCursorStyle = lifeCursor ? getComputedStyle(lifeCursor) : null;
			const lifeToggle = document.querySelector("[data-life-toggle]");
			const forbiddenArtElements = lifeArt
				? [
						...lifeArt.querySelectorAll(
							[
								"a[href]",
								"button",
								"input",
								"select",
								"textarea",
								"label",
								"output",
								"meter",
								"progress",
								"table",
								"img",
								"picture",
								"video",
								"iframe",
								"canvas",
								"svg text",
								"svg foreignObject",
								"[contenteditable]",
								"[tabindex]",
							].join(", "),
						),
					]
				: [];
			const parseColor = (color) => {
				if (!color || color === "none") return null;
				const channels = color.match(/[\d.]+/g)?.map(Number) ?? [];
				if (channels.length < 3) return null;
				let [red, green, blue, alpha = 1] = channels;
				if (color.startsWith("color(srgb") && Math.max(red, green, blue) <= 1) {
					red *= 255;
					green *= 255;
					blue *= 255;
				}
				if (alpha <= 0.05) return null;
				return { alpha, blue, green, red };
			};
			const liveCellColors = lifeCells
				.filter((element) => element.getAttribute("data-state") !== "dead")
				.map((element) => {
					const { backgroundColor, color, fill } = getComputedStyle(element);
					return [backgroundColor, color, fill].map(parseColor).find(Boolean) ?? null;
				})
				.filter(Boolean);
			const blueLiveCellColors = liveCellColors.filter(
				({ blue, green, red }) => blue >= red + 15 && blue >= green - 5,
			);
			const blueColors = new Set(
				blueLiveCellColors.map(
					({ alpha, blue, green, red }) =>
						`${Math.round(red)},${Math.round(green)},${Math.round(blue)},${alpha.toFixed(2)}`,
				),
			);
			const states = lifeCells.map(
				(element) => element.getAttribute("data-state")?.trim().toLowerCase() ?? "",
			);
			const livingStates = new Set(states.filter((state) => state !== "dead"));
			const coordinates = lifeCells.map((element) => ({
				column: Number.parseInt(element.getAttribute("data-column") ?? "", 10),
				row: Number.parseInt(element.getAttribute("data-row") ?? "", 10),
			}));
			const coordinateKeys = coordinates.map(({ column, row }) => `${row}:${column}`);
			const validCoordinates = coordinates.every(
				({ column, row }) =>
					Number.isInteger(column) &&
					column >= 0 &&
					column < 25 &&
					Number.isInteger(row) &&
					row >= 0 &&
					row < 25,
			);
			const toggleLabel =
				lifeToggle?.getAttribute("aria-label") ??
				lifeToggle?.textContent?.replace(/\s+/g, " ").trim() ??
				"";
			const toggleStyle = lifeToggle ? getComputedStyle(lifeToggle) : null;
			const toggleRect = lifeToggle?.getBoundingClientRect();
			const boardStyle = lifeBoard ? getComputedStyle(lifeBoard) : null;
			const gridColumns = boardStyle?.gridTemplateColumns.split(/\s+/).filter(Boolean).length ?? 0;
			const stampPreviews = [...document.querySelectorAll("[data-alt-stamp-preview-item]")];
			const filmPreviews = [...document.querySelectorAll("[data-alt-film-preview]")];
			const filmPreview = filmPreviews[0];
			const filmPreviewItems = filmPreview
				? [...filmPreview.querySelectorAll("[data-alt-film-preview-item]")]
				: [];
			const filmManifestElement = document.querySelector(
				'script[type="application/json"][data-alt-film-preview-data]',
			);
			let filmManifest = null;
			try {
				filmManifest = JSON.parse(filmManifestElement?.textContent ?? "null");
			} catch {
				filmManifest = null;
			}
			const filmCandidates = Array.isArray(filmManifest?.candidates) ? filmManifest.candidates : [];
			const filmCandidateById = new Map(
				filmCandidates.map((candidate) => [candidate?.id, candidate]),
			);
			const filmCandidateIds = filmCandidates.map((candidate) => candidate?.id ?? "");
			const filmPreviewIds = filmPreviewItems.map(
				(item) => item.getAttribute("data-alt-film-preview-item")?.trim() ?? "",
			);
			const filmPreviewSlots = filmPreviewItems.map(
				(item) => item.getAttribute("data-alt-film-preview-slot")?.trim() ?? "",
			);
			const filmPreviewItemsValid = filmPreviewItems.every((item) => {
				const id = item.getAttribute("data-alt-film-preview-item")?.trim() ?? "";
				const image = item.querySelector("[data-alt-film-preview-image]");
				const caption = item.querySelector("[data-alt-film-preview-caption]");
				const candidate = filmCandidateById.get(id);
				return (
					item.getAttribute("data-alt-film-preview-id") === id &&
					image instanceof HTMLImageElement &&
					Boolean(image.getAttribute("alt")?.trim()) &&
					Boolean(image.getAttribute("src")?.trim()) &&
					Boolean(image.getAttribute("srcset")?.trim()) &&
					Boolean(image.getAttribute("sizes")?.trim()) &&
					image.getAttribute("loading") === "lazy" &&
					image.getAttribute("decoding") === "async" &&
					Number.parseInt(image.getAttribute("width") ?? "", 10) > 0 &&
					Number.parseInt(image.getAttribute("height") ?? "", 10) > 0 &&
					Boolean(caption?.textContent?.trim()) &&
					Boolean(candidate) &&
					image.getAttribute("alt") === candidate.alt &&
					image.getAttribute("src") === candidate.src &&
					image.getAttribute("srcset") === candidate.srcset &&
					caption?.textContent === candidate.caption
				);
			});
			const expectedFilmIdsSorted = [...expectedFilmIds].sort();
			const filmCandidateIdsSorted = [...filmCandidateIds].sort();
			let storedFilmPreviewIds = [];
			try {
				const storageKey = filmPreview?.getAttribute("data-alt-film-preview-storage-key") ?? "";
				const stored = storageKey ? sessionStorage.getItem(storageKey) : null;
				const parsed = stored ? JSON.parse(stored) : [];
				if (Array.isArray(parsed)) storedFilmPreviewIds = parsed;
			} catch {
				storedFilmPreviewIds = [];
			}
			const hiddenFeatureHrefs = [
				...document.querySelectorAll(
					'main a[href="/posts/"], main a[href="/rss.xml"], main a[href="/tags/"], main a[href="/stamps/"], main a[href^="/stamps/#"], main a[href="/#books"]',
				),
			].map((link) => link.getAttribute("href") ?? "");

			return {
				anchorTargets: anchorIds.filter((id) => document.getElementById(id)),
				bookSectionCount: document.querySelectorAll("#books[data-alt-book-section]").length,
				blueColorCount: blueColors.size,
				blueLiveCellCount: blueLiveCellColors.length,
				boardDisplay: boardStyle?.display ?? "",
				boardGeneration: Number.parseInt(lifeBoard?.getAttribute("data-life-generation") ?? "", 10),
				boardRunning: lifeBoard?.getAttribute("data-life-running") ?? "",
				boardScene: lifeBoard?.getAttribute("data-life-scene") ?? "",
				boardSceneCount: Number.parseInt(
					lifeBoard?.getAttribute("data-life-scene-count") ?? "",
					10,
				),
				boardSceneLength: Number.parseInt(
					lifeBoard?.getAttribute("data-life-scene-length") ?? "",
					10,
				),
				boardSize: Number.parseInt(lifeBoard?.getAttribute("data-life-size") ?? "", 10),
				boardStep: Number.parseInt(lifeBoard?.getAttribute("data-life-step") ?? "", 10),
				cellCount: lifeCells.length,
				coordinateCount: new Set(coordinateKeys).size,
				forbiddenArtElementCount: forbiddenArtElements.length,
				filmCandidateCount: filmCandidates.length,
				filmCandidateIdsMatch:
					filmCandidateIdsSorted.length === expectedFilmIdsSorted.length &&
					filmCandidateIdsSorted.every((id, index) => id === expectedFilmIdsSorted[index]),
				filmCandidatesOptimized: filmCandidates.every(
					(candidate) =>
						Boolean(candidate?.alt?.trim()) &&
						Boolean(candidate?.caption?.trim()) &&
						Number(candidate?.width) > 0 &&
						Number(candidate?.height) > 0 &&
						/^\/_astro\/.*\.webp(?:\?.*)?$/.test(candidate?.src ?? "") &&
						Boolean(candidate?.srcset?.trim()),
				),
				filmPreviewCount: filmPreviews.length,
				filmPreviewDeclaredTotal: Number.parseInt(
					filmPreview?.getAttribute("data-alt-film-preview-total") ?? "",
					10,
				),
				filmPreviewIds,
				filmPreviewItemsValid,
				filmPreviewReady: filmPreview?.getAttribute("data-alt-film-preview-ready") === "true",
				filmPreviewSlots,
				filmPreviewStorageMatches:
					storedFilmPreviewIds.length === filmPreviewIds.length &&
					storedFilmPreviewIds.every((id, index) => id === filmPreviewIds[index]),
				gridColumns,
				hasLifeArt: Boolean(lifeArt),
				hasLifeBoard: Boolean(lifeBoard),
				hiddenFeatureHrefs,
				homeFilmCtaCount: document.querySelectorAll('main a[href="/film/"]').length,
				homeStampsCtaCount: document.querySelectorAll('main a[href="/stamps/"]').length,
				stampPanelCount: document.querySelectorAll(".stamp-panel").length,
				stampPreviewCount: stampPreviews.length,
				invalidStateCount: states.filter((state) => !allowedStates.includes(state)).length,
				legacyHeroNodeCount: document.querySelectorAll(
					"[data-abstract-art], [data-abstract-form], [data-motion-layer], [data-scroll-story], .cut-paper, .journey__panorama, .journey__traveller",
				).length,
				lifeArtHidden: lifeArt?.getAttribute("aria-hidden") === "true",
				lifeArtText: lifeArt?.textContent?.replace(/\s+/g, "") ?? "",
				lifeCursorAnimation: lifeCursorStyle?.animationName ?? "",
				lifeCursorHidden: lifeCursor?.getAttribute("aria-hidden") === "true",
				lifeCursorIterationCount: lifeCursorStyle?.animationIterationCount ?? "",
				lifeCursorIsEnding:
					lifeCursor?.parentElement?.classList.contains("life-hero__ending") === true,
				lifeHeadingText: lifeHeading?.textContent?.replace(/\s+/g, " ").trim() ?? "",
				liveCellCount: states.filter((state) => state !== "dead").length,
				livingStateCount: livingStates.size,
				sectionIds: [...document.querySelectorAll("main > section[id]")].map(
					(section) => section.id,
				),
				toggleIsButton: lifeToggle instanceof HTMLButtonElement,
				toggleIsOutsideArt: Boolean(lifeToggle && lifeArt && !lifeArt.contains(lifeToggle)),
				toggleLabel,
				toggleVisible: Boolean(
					lifeToggle &&
						toggleStyle &&
						toggleRect &&
						toggleStyle.display !== "none" &&
						toggleStyle.visibility !== "hidden" &&
						toggleRect.width > 0 &&
						toggleRect.height > 0,
				),
				validCoordinates,
				writingPanelCount: document.querySelectorAll(".writing-panel").length,
			};
		},
		{
			allowedStates: [...LIFE_STATES],
			anchorIds: HOME_ANCHOR_TARGETS,
			expectedFilmIds: filmAssetIds,
		},
	);

	report(
		"site home: required section targets remain",
		arraysEqual(structure.anchorTargets, HOME_ANCHOR_TARGETS) &&
			arraysEqual(structure.sectionIds, HOME_ANCHOR_TARGETS),
		`found ${structure.anchorTargets.join(", ") || "none"}`,
	);
	report(
		"site home: Books, Writing, and Stamps content is hidden",
		structure.bookSectionCount === 0 &&
			structure.writingPanelCount === 0 &&
			structure.stampPanelCount === 0 &&
			structure.stampPreviewCount === 0 &&
			structure.hiddenFeatureHrefs.length === 0,
		`books=${structure.bookSectionCount}; writing=${structure.writingPanelCount}; stamp panels=${structure.stampPanelCount}; stamp previews=${structure.stampPreviewCount}; hidden links=${structure.hiddenFeatureHrefs.join(", ") || "none"}`,
	);
	report(
		"site home: Film call-to-action remains while Stamps is hidden",
		structure.homeFilmCtaCount >= 1 && structure.homeStampsCtaCount === 0,
		`film=${structure.homeFilmCtaCount}; stamps=${structure.homeStampsCtaCount}`,
	);
	report(
		"site home: random film preview covers the complete optimized asset pool",
		structure.filmPreviewCount === 1 &&
			structure.filmPreviewReady &&
			structure.filmPreviewDeclaredTotal === filmAssetIds.length &&
			structure.filmCandidateCount === filmAssetIds.length &&
			structure.filmCandidateIdsMatch &&
			structure.filmCandidatesOptimized,
		`declared=${structure.filmPreviewDeclaredTotal}; candidates=${structure.filmCandidateCount}; expected=${filmAssetIds.length}; ready=${structure.filmPreviewReady}`,
	);
	report(
		"site home: three unique film previews render coherently and persist",
		structure.filmPreviewIds.length === FILM_PREVIEW_COUNT &&
			new Set(structure.filmPreviewIds).size === FILM_PREVIEW_COUNT &&
			structure.filmPreviewIds.every((id) => filmAssetIds.includes(id)) &&
			arraysEqual(structure.filmPreviewSlots, ["wide", "portrait", "architecture"]) &&
			structure.filmPreviewItemsValid &&
			structure.filmPreviewStorageMatches,
		`ids=${structure.filmPreviewIds.join(", ") || "none"}; slots=${structure.filmPreviewSlots.join(", ") || "none"}; stored=${structure.filmPreviewStorageMatches}`,
	);
	await page.evaluate(() => {
		document.querySelector("[data-alt-film-preview]")?.scrollIntoView({ block: "center" });
	});
	let allFilmPreviewsLoaded = false;
	try {
		await page.waitForFunction(
			(expectedCount) => {
				const images = [...document.querySelectorAll("[data-alt-film-preview-item] img")];
				return (
					images.length === expectedCount &&
					images.every(
						(image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
					)
				);
			},
			{ polling: 50, timeout: 10_000 },
			FILM_PREVIEW_COUNT,
		);
		allFilmPreviewsLoaded = true;
	} catch {
		// The loaded count below identifies a failed preview image.
	}
	const loadedFilmPreviewCount = await page.$$eval(
		"[data-alt-film-preview-item] img",
		(images) =>
			images.filter((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0)
				.length,
	);
	report(
		"site home: all randomized film previews load with natural dimensions",
		allFilmPreviewsLoaded && loadedFilmPreviewCount === FILM_PREVIEW_COUNT,
		`${loadedFilmPreviewCount}/${FILM_PREVIEW_COUNT} loaded`,
	);
	report(
		"site home: 25x25 Game of Life board exists",
		structure.hasLifeArt &&
			structure.hasLifeBoard &&
			structure.boardSize === LIFE_SIZE &&
			structure.cellCount === LIFE_CELL_COUNT &&
			structure.boardDisplay === "grid" &&
			structure.gridColumns === LIFE_SIZE,
		`size=${structure.boardSize}; cells=${structure.cellCount}; columns=${structure.gridColumns}; display=${structure.boardDisplay || "missing"}`,
	);
	report(
		"site home: Life cells have complete coordinates and valid states",
		structure.coordinateCount === LIFE_CELL_COUNT &&
			structure.validCoordinates &&
			structure.invalidStateCount === 0,
		`${structure.coordinateCount}/${LIFE_CELL_COUNT} unique coordinates; invalid states=${structure.invalidStateCount}`,
	);
	report(
		"site home: Life timing and scene metadata match the contract",
		structure.boardStep === LIFE_STEP_MS &&
			structure.boardSceneCount === LIFE_SCENE_COUNT &&
			structure.boardSceneLength === LIFE_SCENE_LENGTH &&
			Array.from({ length: LIFE_SCENE_COUNT }, (_, index) => String(index)).includes(
				structure.boardScene,
			) &&
			Number.isInteger(structure.boardGeneration) &&
			["true", "false"].includes(structure.boardRunning),
		`step=${structure.boardStep}; scenes=${structure.boardSceneCount}; scene=${structure.boardScene || "missing"}; scene length=${structure.boardSceneLength}; generation=${structure.boardGeneration}; running=${structure.boardRunning || "missing"}`,
	);
	report(
		"site home: decorative Life art is hidden and text-free",
		structure.lifeArtHidden &&
			structure.lifeArtText === "" &&
			structure.forbiddenArtElementCount === 0,
		`hidden=${structure.lifeArtHidden}; text=${JSON.stringify(structure.lifeArtText.slice(0, 60))}; forbidden elements=${structure.forbiddenArtElementCount}`,
	);
	report(
		"site home: cursor blinks after the completed transition heading",
		structure.lifeHeadingText === "Working on the economics of transition." &&
			structure.lifeCursorHidden &&
			structure.lifeCursorIsEnding &&
			structure.lifeCursorAnimation === "life-cursor-blink" &&
			structure.lifeCursorIterationCount === "infinite",
		`heading=${JSON.stringify(structure.lifeHeadingText)}; hidden=${structure.lifeCursorHidden}; animation=${structure.lifeCursorAnimation}; iterations=${structure.lifeCursorIterationCount}`,
	);
	report(
		"site home: Life board has a mixed live population in multiple blue states",
		structure.liveCellCount > 0 &&
			structure.liveCellCount < LIFE_CELL_COUNT &&
			structure.livingStateCount >= 2 &&
			structure.blueColorCount >= 2 &&
			structure.blueLiveCellCount / structure.liveCellCount >= 0.8,
		`${structure.liveCellCount} live cells; ${structure.livingStateCount} live states; ${structure.blueColorCount} blue colors; ${structure.blueLiveCellCount}/${structure.liveCellCount} live cells are blue-family`,
	);
	report(
		"site home: Play/Pause control is visible, accessible, and outside decorative art",
		structure.toggleIsButton &&
			structure.toggleIsOutsideArt &&
			structure.toggleVisible &&
			/\b(?:pause|play)\b/i.test(structure.toggleLabel),
		`button=${structure.toggleIsButton}; outside art=${structure.toggleIsOutsideArt}; visible=${structure.toggleVisible}; label=${JSON.stringify(structure.toggleLabel)}`,
	);
	report(
		"site home: old cut-paper and scroll-story nodes are absent",
		structure.legacyHeroNodeCount === 0,
		`${structure.legacyHeroNodeCount} legacy nodes`,
	);
}

async function checkKeyboardNavigation(page, label) {
	const inventory = await page.evaluate(() => {
		const isVisible = (element) => {
			const style = getComputedStyle(element);
			const rect = element.getBoundingClientRect();
			return (
				style.display !== "none" &&
				style.visibility !== "hidden" &&
				Number(style.opacity) !== 0 &&
				rect.width > 0 &&
				rect.height > 0
			);
		};
		const links = [...document.querySelectorAll("a[href]")].filter(isVisible);
		const navLinks = [...document.querySelectorAll(".alt-header__nav a[href]")].filter(isVisible);
		return {
			blocked: links
				.filter((link) => link.tabIndex < 0)
				.map((link) => link.getAttribute("href") ?? link.textContent?.trim() ?? "unknown"),
			linkCount: links.length,
			navLinkCount: navLinks.length,
		};
	});

	report(
		`${label}: visible links are keyboard-focusable`,
		inventory.linkCount > 0 && inventory.blocked.length === 0,
		`${inventory.linkCount} links; blocked: ${inventory.blocked.join(", ") || "none"}`,
	);
	report(
		`${label}: all ${HEADER_HREFS.length} header tabs are visible`,
		inventory.navLinkCount === HEADER_HREFS.length,
		`${inventory.navLinkCount} tabs`,
	);

	await page.evaluate(() => {
		document.body.setAttribute("tabindex", "-1");
		document.body.focus();
		document.body.removeAttribute("tabindex");
	});

	let focusedLink = false;
	let focusedNavLink = false;
	for (let index = 0; index < Math.min(inventory.linkCount + 10, 60); index += 1) {
		await page.keyboard.press("Tab");
		const focused = await page.evaluate(() => ({
			isLink: document.activeElement?.matches("a[href]") ?? false,
			isNavLink: document.activeElement?.matches(".alt-header__nav a[href]") ?? false,
		}));
		focusedLink ||= focused.isLink;
		focusedNavLink ||= focused.isNavLink;
		if (focusedLink && focusedNavLink) break;
	}

	report(`${label}: Tab reaches a link`, focusedLink);
	report(`${label}: Tab reaches the header navigation`, focusedNavLink);
}

// Kept ready for when the preserved Stamps section is enabled again.
async function _inspectStamps(page) {
	const inventory = await page.evaluate(() => {
		const catalogue = document.querySelector("[data-alt-stamp-catalogue]");
		const items = catalogue ? [...catalogue.querySelectorAll("[data-alt-stamp-item]")] : [];
		const lists = catalogue ? [...catalogue.querySelectorAll("ol, ul")] : [];
		const catalogueList =
			lists.find((list) => items.every((item) => item.closest("ol, ul") === list)) ?? null;
		const modal = document.querySelector("[data-alt-stamp-modal]");
		const dialog = document.querySelector("[data-alt-stamp-dialog]");
		const itemDetails = items.map((item) => {
			const images = [...item.querySelectorAll("img")];
			const triggers = [...item.querySelectorAll("[data-alt-stamp-trigger]")];
			const image = images[0];
			const trigger = triggers[0];
			const reference = trigger?.getAttribute("data-alt-stamp-reference")?.trim() ?? "";
			return {
				accessibleTrigger:
					triggers.length === 1 &&
					trigger instanceof HTMLButtonElement &&
					!trigger.disabled &&
					Boolean(trigger.getAttribute("aria-controls")) &&
					Boolean(trigger.textContent?.trim() || trigger.getAttribute("aria-label")),
				id: item.getAttribute("data-alt-stamp-id")?.trim() ?? "",
				hasResearchMetadata:
					Boolean(trigger?.getAttribute("data-alt-stamp-details")?.trim()) &&
					/^https:\/\//.test(reference) &&
					/\bValue\b/.test(trigger?.textContent ?? "") &&
					/\bPhotographed\b/.test(trigger?.textContent ?? ""),
				imageCount: images.length,
				isListItem: item.tagName === "LI",
				responsiveImage: Boolean(
					image?.getAttribute("alt")?.trim() &&
						image?.getAttribute("srcset")?.trim() &&
						image?.getAttribute("sizes")?.trim() &&
						image?.getAttribute("loading") === "lazy",
				),
			};
		});
		return {
			catalogueExists: Boolean(catalogue),
			catalogueListCount: lists.length,
			crossLinkCount: document.querySelectorAll('main a[href="/film/"]').length,
			hasClose: Boolean(document.querySelector("[data-alt-stamp-close]")),
			hasDialog: Boolean(dialog),
			hasModal: Boolean(modal),
			hasActiveImage: Boolean(document.querySelector("[data-alt-stamp-active]")),
			hasCaption: Boolean(modal?.querySelector("[data-alt-stamp-caption]")),
			hasDetails: Boolean(modal?.querySelector("[data-alt-stamp-details]")),
			hasReferenceLink: Boolean(modal?.querySelector("[data-alt-stamp-reference-link]")),
			initiallyHidden:
				modal?.hasAttribute("hidden") === true && modal?.getAttribute("aria-hidden") === "true",
			itemDetails,
			itemIds: itemDetails.map(({ id }) => id),
			pageText: document.querySelector("main")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
			sectionHookCount: catalogue?.querySelectorAll("[data-alt-stamp-section]").length ?? 0,
			semanticCatalogueList:
				catalogueList?.tagName === "OL" &&
				items.every((item) => item.tagName === "LI" && item.closest("ol, ul") === catalogueList),
		};
	});

	report(
		"site stamps: catalogue contains all 42 stable IDs exactly once in original order",
		inventory.catalogueExists &&
			inventory.itemIds.length === STAMP_IDS.length &&
			new Set(inventory.itemIds).size === STAMP_IDS.length &&
			arraysEqual(inventory.itemIds, STAMP_IDS),
		`${inventory.itemIds.length} items; ${new Set(inventory.itemIds).size} unique IDs`,
	);
	report(
		"site stamps: one semantic ordered list replaces all catalogue sections",
		inventory.catalogueListCount === 1 &&
			inventory.sectionHookCount === 0 &&
			inventory.semanticCatalogueList &&
			inventory.itemDetails.every(({ isListItem }) => isListItem),
		`lists=${inventory.catalogueListCount}; section hooks=${inventory.sectionHookCount}`,
	);
	report(
		"site stamps: every item has one accessible trigger and one responsive lazy image",
		inventory.itemDetails.length === STAMP_IDS.length &&
			inventory.itemDetails.every(
				({ accessibleTrigger, imageCount, responsiveImage }) =>
					accessibleTrigger && imageCount === 1 && responsiveImage,
			),
		`${inventory.itemDetails.filter(({ accessibleTrigger }) => accessibleTrigger).length} accessible triggers; ${inventory.itemDetails.filter(({ imageCount, responsiveImage }) => imageCount === 1 && responsiveImage).length} responsive images`,
	);
	report(
		"site stamps: every item exposes researched issue details and an HTTPS reference",
		inventory.itemDetails.length === STAMP_IDS.length &&
			inventory.itemDetails.every(({ hasResearchMetadata }) => hasResearchMetadata),
		`${inventory.itemDetails.filter(({ hasResearchMetadata }) => hasResearchMetadata).length}/${inventory.itemDetails.length} researched entries`,
	);
	report(
		"site stamps: placeholder copy has been removed",
		!/(?:\bsoon\b|scans?\s+pending|first\s+scans?)/i.test(inventory.pageText),
		`text match=${JSON.stringify(inventory.pageText.match(/(?:\bsoon\b|scans?\s+pending|first\s+scans?)/i)?.[0] ?? "none")}`,
	);
	report(
		"site stamps: Film cross-link stays in the alternative site",
		inventory.crossLinkCount >= 1,
		`${inventory.crossLinkCount} matching links`,
	);
	report(
		"site stamps: lightbox starts hidden with dialog, image, caption, and close hooks",
		inventory.hasModal &&
			inventory.hasDialog &&
			inventory.hasClose &&
			inventory.hasActiveImage &&
			inventory.hasCaption &&
			inventory.hasDetails &&
			inventory.hasReferenceLink &&
			inventory.initiallyHidden,
	);

	await page.evaluate(async () => {
		const images = [...document.querySelectorAll("[data-alt-stamp-item] img")];
		for (const image of images) {
			image.scrollIntoView({ block: "center" });
			await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
		}
	});
	let allImagesLoaded = false;
	try {
		await page.waitForFunction(
			() =>
				[...document.querySelectorAll("[data-alt-stamp-item] img")].every(
					(image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
				),
			{ polling: 50, timeout: 15_000 },
		);
		allImagesLoaded = true;
	} catch {
		// The loaded count below identifies any failed or missing images.
	}
	const loadedImageCount = await page.$$eval(
		"[data-alt-stamp-item] img",
		(images) =>
			images.filter((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0)
				.length,
	);
	report(
		"site stamps: all lazy catalogue images load with natural dimensions after scrolling",
		allImagesLoaded && loadedImageCount === STAMP_IDS.length,
		`${loadedImageCount}/${STAMP_IDS.length} loaded`,
	);

	if (
		inventory.itemIds.length !== STAMP_IDS.length ||
		!inventory.hasModal ||
		!inventory.hasDialog
	) {
		return;
	}

	const selectedId = "stamp-024";
	const triggerSelector = `[data-alt-stamp-id="${selectedId}"] [data-alt-stamp-trigger]`;
	const modalSelector = "[data-alt-stamp-modal]";
	const selected = await page.$eval(triggerSelector, (trigger) => {
		const item = trigger.closest("[data-alt-stamp-item]");
		return {
			alt: item?.querySelector("img")?.getAttribute("alt")?.trim() ?? "",
			text: item?.textContent?.replace(/\s+/g, " ").trim() ?? "",
		};
	});
	await page.focus(triggerSelector);
	const bodyOverflowBefore = await page.$eval("body", (body) => body.style.overflow);
	await page.click(triggerSelector);
	await page.waitForFunction(
		(selector) => {
			const modal = document.querySelector(selector);
			return (
				modal && !modal.hasAttribute("hidden") && modal.getAttribute("aria-hidden") === "false"
			);
		},
		{ timeout: 2_000 },
		modalSelector,
	);
	await settle(page);

	const opened = await page.evaluate(
		({ expectedAlt, expectedText }) => {
			const modal = document.querySelector("[data-alt-stamp-modal]");
			const dialog = document.querySelector("[data-alt-stamp-dialog]");
			const activeImage = document.querySelector("[data-alt-stamp-active]");
			const caption = modal
				?.querySelector("[data-alt-stamp-caption]")
				?.textContent?.replace(/\s+/g, " ")
				.trim();
			const details = modal
				?.querySelector("[data-alt-stamp-details]")
				?.textContent?.replace(/\s+/g, " ")
				.trim();
			const referenceLink = modal?.querySelector("[data-alt-stamp-reference-link]");
			const labelledBy = dialog?.getAttribute("aria-labelledby");
			const hasName = Boolean(
				dialog?.getAttribute("aria-label") ||
					(labelledBy && document.getElementById(labelledBy)?.textContent?.trim()),
			);
			return {
				bodyLocked: document.body.style.overflow === "hidden",
				captionMatches: Boolean(caption && expectedText.includes(caption)),
				detailsPresent: Boolean(details),
				focusInside: dialog?.contains(document.activeElement) === true,
				hasName,
				imageMatches:
					activeImage?.getAttribute("alt")?.trim() === expectedAlt &&
					Boolean(activeImage?.getAttribute("src")),
				isDialog: dialog?.getAttribute("role") === "dialog",
				isModal: dialog?.getAttribute("aria-modal") === "true",
				referencePresent:
					referenceLink instanceof HTMLAnchorElement &&
					!referenceLink.hasAttribute("hidden") &&
					referenceLink.href.startsWith("https://"),
				visible:
					modal?.hasAttribute("hidden") === false && modal?.getAttribute("aria-hidden") === "false",
			};
		},
		{ expectedAlt: selected.alt, expectedText: selected.text },
	);
	report(
		"site stamps: selected item opens as a named modal dialog with focus inside",
		opened.visible && opened.isDialog && opened.isModal && opened.hasName && opened.focusInside,
	);
	report(
		"site stamps: lightbox shows the selected image and caption and locks scrolling",
		opened.imageMatches &&
			opened.captionMatches &&
			opened.detailsPresent &&
			opened.referencePresent &&
			opened.bodyLocked,
		`image=${opened.imageMatches}; caption=${opened.captionMatches}; details=${opened.detailsPresent}; reference=${opened.referencePresent}; locked=${opened.bodyLocked}`,
	);

	await page.keyboard.press("Escape");
	await page.waitForFunction(
		(selector) => document.querySelector(selector)?.hasAttribute("hidden") === true,
		{ timeout: 2_000 },
		modalSelector,
	);
	const escaped = await page.evaluate(
		({ before, selector }) => ({
			bodyRestored: document.body.style.overflow === before,
			focusRestored: document.activeElement?.matches(selector) === true,
			modalHidden:
				document.querySelector("[data-alt-stamp-modal]")?.getAttribute("aria-hidden") === "true",
		}),
		{ before: bodyOverflowBefore, selector: triggerSelector },
	);
	report(
		"site stamps: Escape closes, restores focus, and releases body scrolling",
		escaped.modalHidden && escaped.focusRestored && escaped.bodyRestored,
	);

	await page.click(triggerSelector);
	await page.evaluate(() => {
		const modal = document.querySelector("[data-alt-stamp-modal]");
		if (modal instanceof HTMLElement) modal.click();
	});
	const backdropState = await page.evaluate(
		({ before, selector }) => ({
			bodyRestored: document.body.style.overflow === before,
			focusRestored: document.activeElement?.matches(selector) === true,
			modalHidden:
				document.querySelector("[data-alt-stamp-modal]")?.hasAttribute("hidden") === true,
		}),
		{ before: bodyOverflowBefore, selector: triggerSelector },
	);
	report(
		"site stamps: backdrop closes and restores focus and scrolling",
		backdropState.modalHidden && backdropState.focusRestored && backdropState.bodyRestored,
	);
}

async function inspectFilm(page) {
	const inventory = await page.evaluate(() => {
		const gallery = document.querySelector("[data-alt-film-gallery]");
		const triggers = gallery ? [...gallery.querySelectorAll("[data-alt-film-trigger]")] : [];
		const modal = document.querySelector("[data-alt-film-modal]");
		const dialog = document.querySelector("[data-alt-film-dialog]");
		return {
			accessibleTriggerCount: triggers.filter(
				(trigger) =>
					trigger instanceof HTMLButtonElement &&
					!trigger.disabled &&
					Boolean(trigger.getAttribute("aria-controls")) &&
					Boolean(trigger.textContent?.trim() || trigger.getAttribute("aria-label")),
			).length,
			hasClose: Boolean(document.querySelector("[data-alt-film-close]")),
			hasDialog: Boolean(dialog),
			hasModal: Boolean(modal),
			initiallyHidden:
				modal?.hasAttribute("hidden") === true && modal?.getAttribute("aria-hidden") === "true",
			lazyImageCount: gallery?.querySelectorAll('img[loading="lazy"]').length ?? 0,
			triggerCount: triggers.length,
		};
	});

	report(
		`site film: all ${filmAssetIds.length} photographs are accessible gallery triggers`,
		inventory.triggerCount === filmAssetIds.length &&
			inventory.accessibleTriggerCount === filmAssetIds.length,
		`${inventory.accessibleTriggerCount}/${inventory.triggerCount} accessible triggers`,
	);
	report(
		"site film: gallery thumbnails are lazy-loaded",
		inventory.lazyImageCount === filmAssetIds.length,
		`${inventory.lazyImageCount} lazy images`,
	);
	report(
		"site film: lightbox starts hidden with dialog and close controls",
		inventory.hasModal && inventory.hasDialog && inventory.hasClose && inventory.initiallyHidden,
	);
	if (inventory.triggerCount !== filmAssetIds.length || !inventory.hasModal || !inventory.hasDialog)
		return;

	const triggerSelector = "[data-alt-film-trigger]";
	const modalSelector = "[data-alt-film-modal]";
	await page.focus(triggerSelector);
	const bodyOverflowBefore = await page.$eval("body", (body) => body.style.overflow);
	await page.click(triggerSelector);
	await page.waitForFunction(
		(selector) => {
			const modal = document.querySelector(selector);
			return (
				modal && !modal.hasAttribute("hidden") && modal.getAttribute("aria-hidden") === "false"
			);
		},
		{ timeout: 2_000 },
		modalSelector,
	);
	await settle(page);

	const opened = await page.evaluate(() => {
		const modal = document.querySelector("[data-alt-film-modal]");
		const dialog = document.querySelector("[data-alt-film-dialog]");
		const activeImage = document.querySelector("[data-alt-film-active]");
		const labelledBy = dialog?.getAttribute("aria-labelledby");
		const hasName = Boolean(
			dialog?.getAttribute("aria-label") ||
				(labelledBy && document.getElementById(labelledBy)?.textContent?.trim()),
		);
		return {
			activeImageHasContent: Boolean(
				activeImage?.getAttribute("src") && activeImage?.getAttribute("alt")?.trim(),
			),
			bodyLocked: document.body.style.overflow === "hidden",
			focusInside: dialog?.contains(document.activeElement) === true,
			hasName,
			isDialog: dialog?.getAttribute("role") === "dialog",
			isModal: dialog?.getAttribute("aria-modal") === "true",
			visible: modal?.hasAttribute("hidden") === false,
		};
	});
	report(
		"site film: lightbox opens as a named modal dialog and moves focus inside",
		opened.visible && opened.isDialog && opened.isModal && opened.hasName && opened.focusInside,
	);
	report(
		"site film: opened lightbox has image content and locks body scrolling",
		opened.activeImageHasContent && opened.bodyLocked,
	);

	const focusableCount = await page.$$eval(
		"[data-alt-film-dialog] button:not([disabled]), [data-alt-film-dialog] a[href], [data-alt-film-dialog] [tabindex]:not([tabindex='-1'])",
		(elements) => elements.length,
	);
	if (focusableCount > 0) {
		await page.evaluate(() => {
			const focusables = document.querySelectorAll(
				"[data-alt-film-dialog] button:not([disabled]), [data-alt-film-dialog] a[href], [data-alt-film-dialog] [tabindex]:not([tabindex='-1'])",
			);
			focusables[0]?.focus();
		});
		await page.keyboard.down("Shift");
		await page.keyboard.press("Tab");
		await page.keyboard.up("Shift");
		const wrappedBackward = await page.evaluate(() => {
			const focusables = [
				...document.querySelectorAll(
					"[data-alt-film-dialog] button:not([disabled]), [data-alt-film-dialog] a[href], [data-alt-film-dialog] [tabindex]:not([tabindex='-1'])",
				),
			];
			return document.activeElement === focusables.at(-1);
		});
		report("site film: modal focus wraps within the dialog", wrappedBackward);
	} else {
		report("site film: modal focus wraps within the dialog", false, "no focusable controls");
	}

	await page.keyboard.press("Escape");
	await page.waitForFunction(
		(selector) => document.querySelector(selector)?.hasAttribute("hidden") === true,
		{ timeout: 2_000 },
		modalSelector,
	);
	const escaped = await page.evaluate(
		({ before, selector }) => ({
			bodyRestored: document.body.style.overflow === before,
			focusRestored: document.activeElement?.matches(selector) === true,
			modalHidden:
				document.querySelector("[data-alt-film-modal]")?.getAttribute("aria-hidden") === "true",
		}),
		{ before: bodyOverflowBefore, selector: triggerSelector },
	);
	report(
		"site film: Escape closes, restores focus, and releases body scrolling",
		escaped.modalHidden && escaped.focusRestored && escaped.bodyRestored,
	);

	await page.click(triggerSelector);
	await page.click("[data-alt-film-close]");
	const closeButtonState = await page.evaluate(
		({ before, selector }) => ({
			bodyRestored: document.body.style.overflow === before,
			focusRestored: document.activeElement?.matches(selector) === true,
			modalHidden: document.querySelector("[data-alt-film-modal]")?.hasAttribute("hidden") === true,
		}),
		{ before: bodyOverflowBefore, selector: triggerSelector },
	);
	report(
		"site film: close button restores focus and scrolling",
		closeButtonState.modalHidden && closeButtonState.focusRestored && closeButtonState.bodyRestored,
	);

	await page.click(triggerSelector);
	await page.evaluate(() => {
		const modal = document.querySelector("[data-alt-film-modal]");
		if (modal instanceof HTMLElement) modal.click();
	});
	const backdropState = await page.evaluate(
		({ before, selector }) => ({
			bodyRestored: document.body.style.overflow === before,
			focusRestored: document.activeElement?.matches(selector) === true,
			modalHidden: document.querySelector("[data-alt-film-modal]")?.hasAttribute("hidden") === true,
		}),
		{ before: bodyOverflowBefore, selector: triggerSelector },
	);
	report(
		"site film: backdrop closes and restores focus and scrolling",
		backdropState.modalHidden && backdropState.focusRestored && backdropState.bodyRestored,
	);
}

async function inspectFilmSizing(page, viewport, label) {
	const sizing = await page.evaluate(() => {
		const gallery = document.querySelector("[data-alt-film-gallery]");
		const cards = gallery ? [...gallery.querySelectorAll(".film-card")] : [];
		const galleryRect = gallery?.getBoundingClientRect();
		const cardRects = cards.map((card) => card.getBoundingClientRect());
		const widths = cardRects.map((rect) => rect.width);
		const ratioErrors = cards
			.map((card) => card.querySelector("img"))
			.filter((image) => image instanceof HTMLImageElement)
			.map((image) => {
				const rect = image.getBoundingClientRect();
				const declaredWidth = Number.parseFloat(image.getAttribute("width") ?? "0");
				const declaredHeight = Number.parseFloat(image.getAttribute("height") ?? "0");
				if (rect.height <= 0 || declaredWidth <= 0 || declaredHeight <= 0)
					return Number.POSITIVE_INFINITY;
				return Math.abs(rect.width / rect.height - declaredWidth / declaredHeight);
			});
		const densityShortfalls = cards.map((card, index) => {
			const image = card.querySelector("img");
			const srcsetWidths = (image?.getAttribute("srcset") ?? "")
				.split(",")
				.map((candidate) => Number.parseFloat(candidate.trim().match(/\s(\d+)w$/)?.[1] ?? "0"))
				.filter((width) => width > 0);
			const fallbackWidth = Number.parseFloat(image?.getAttribute("width") ?? "0");
			const availableWidth = srcsetWidths.length > 0 ? Math.max(...srcsetWidths) : fallbackWidth;
			return Math.max(0, cardRects[index].width * 2 - availableWidth);
		});
		const centerErrors = cardRects.map((rect) =>
			galleryRect
				? Math.abs(rect.left + rect.width / 2 - (galleryRect.left + galleryRect.width / 2))
				: Number.POSITIVE_INFINITY,
		);
		const verticallyOrdered = cardRects.every(
			(rect, index) => index === 0 || rect.top > cardRects[index - 1].bottom,
		);
		const declaredCapsHonored = cards.every((card, index) => {
			const maximumWidth = Number.parseFloat(card.getAttribute("data-film-max-width") ?? "0");
			return maximumWidth > 0 && cardRects[index].width <= maximumWidth + 1;
		});
		return {
			cardCount: cards.length,
			declaredCapsHonored,
			distinctWidths: new Set(widths.map((width) => Math.round(width))).size,
			galleryWidth: galleryRect?.width ?? 0,
			maxCenterError:
				centerErrors.length > 0 ? Math.max(...centerErrors) : Number.POSITIVE_INFINITY,
			maxDensityShortfall:
				densityShortfalls.length > 0 ? Math.max(...densityShortfalls) : Number.POSITIVE_INFINITY,
			maxRatioError: ratioErrors.length > 0 ? Math.max(...ratioErrors) : Number.POSITIVE_INFINITY,
			maxWidth: widths.length > 0 ? Math.max(...widths) : 0,
			minWidth: widths.length > 0 ? Math.min(...widths) : 0,
			verticallyOrdered,
		};
	});

	const minimumExpectedWidth = Math.min(480, viewport.width * 0.82);
	report(
		`${label}: Film frames retain substantial visual size`,
		sizing.cardCount === filmAssetIds.length && sizing.minWidth >= minimumExpectedWidth,
		`minimum ${Math.round(sizing.minWidth)}px; expected at least ${Math.round(minimumExpectedWidth)}px`,
	);
	report(
		`${label}: Film thumbnails preserve their intrinsic proportions`,
		sizing.maxRatioError <= 0.01,
		`maximum ratio error ${sizing.maxRatioError.toFixed(4)}`,
	);
	report(
		`${label}: Film cards form one centered single-column stream`,
		sizing.verticallyOrdered && sizing.maxCenterError <= 1,
		`maximum center error ${sizing.maxCenterError.toFixed(2)}px`,
	);
	report(
		`${label}: Film card widths respect each scan's two-density-pixel cap`,
		sizing.declaredCapsHonored && sizing.maxDensityShortfall <= 1,
		`maximum density shortfall ${sizing.maxDensityShortfall.toFixed(2)}px`,
	);
	if (viewport.width >= 1280) {
		report(
			`${label}: Film widths vary with scan resolution`,
			sizing.distinctWidths >= 4 && sizing.maxWidth - sizing.minWidth >= 300,
			`${sizing.distinctWidths} widths across ${Math.round(sizing.minWidth)}–${Math.round(sizing.maxWidth)}px`,
		);
	}
}

async function horizontalOverflow(page) {
	return page.evaluate(() => ({
		clientWidth: document.documentElement.clientWidth,
		overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
		scrollWidth: document.documentElement.scrollWidth,
	}));
}

async function waitMilliseconds(page, milliseconds) {
	await page.evaluate(
		(duration) => new Promise((resolve) => window.setTimeout(resolve, duration)),
		milliseconds,
	);
}

async function lifeSnapshot(page) {
	return page.evaluate(() => {
		const board = document.querySelector("[data-life-board]");
		if (!board) return null;
		const cells = [...board.querySelectorAll("[data-life-cell]")]
			.map((cell) => ({
				column: Number.parseInt(cell.getAttribute("data-column") ?? "", 10),
				row: Number.parseInt(cell.getAttribute("data-row") ?? "", 10),
				state: cell.getAttribute("data-state") ?? "",
			}))
			.sort((left, right) => left.row - right.row || left.column - right.column);
		const toggle = document.querySelector("[data-life-toggle]");
		const rect = board.getBoundingClientRect();
		const states = cells.map(({ state }) => state);
		return {
			generation: Number.parseInt(board.getAttribute("data-life-generation") ?? "", 10),
			isVisible:
				rect.bottom > 0 &&
				rect.right > 0 &&
				rect.top < window.innerHeight &&
				rect.left < window.innerWidth,
			running: board.getAttribute("data-life-running") === "true",
			scene: board.getAttribute("data-life-scene") ?? "",
			signature: states.join("|"),
			states,
			toggleLabel:
				toggle?.getAttribute("aria-label") ??
				toggle?.textContent?.replace(/\s+/g, " ").trim() ??
				"",
			togglePaused: toggle?.getAttribute("data-life-paused") ?? "",
		};
	});
}

async function waitForLifeRunning(page, expected, timeout = LIFE_STEP_MS * 5) {
	await page.waitForFunction(
		(value) =>
			document.querySelector("[data-life-board]")?.getAttribute("data-life-running") ===
			String(value),
		{ polling: 25, timeout },
		expected,
	);
}

async function waitForLifeChange(page, before, timeout = LIFE_STEP_MS * 5) {
	await page.waitForFunction(
		(previous) => {
			const board = document.querySelector("[data-life-board]");
			if (!board) return false;
			const signature = [...board.querySelectorAll("[data-life-cell]")]
				.map((cell) => cell.getAttribute("data-state") ?? "")
				.join("|");
			return (
				board.getAttribute("data-life-generation") !== String(previous.generation) ||
				board.getAttribute("data-life-scene") !== previous.scene ||
				signature !== previous.signature
			);
		},
		{ polling: 20, timeout },
		before,
	);
	return lifeSnapshot(page);
}

async function checkLifeAnimation(page) {
	await page.evaluate(() => {
		document.querySelector("[data-life-board]")?.scrollIntoView({ block: "center" });
	});
	await settle(page);
	await waitForLifeRunning(page, true);

	const visibleBefore = await lifeSnapshot(page);
	const visibleAfter = visibleBefore ? await waitForLifeChange(page, visibleBefore) : null;
	report(
		"alternative Life: generation and cell states change while visible",
		Boolean(
			visibleBefore &&
				visibleAfter &&
				visibleBefore.running &&
				visibleAfter.running &&
				visibleBefore.signature !== visibleAfter.signature,
		),
		`scene/generation ${visibleBefore?.scene ?? "missing"}/${visibleBefore?.generation ?? "missing"} -> ${visibleAfter?.scene ?? "missing"}/${visibleAfter?.generation ?? "missing"}`,
	);

	let sceneAfter = visibleAfter;
	if (visibleAfter) {
		try {
			await page.waitForFunction(
				(previousScene) =>
					document.querySelector("[data-life-board]")?.getAttribute("data-life-scene") !==
					previousScene,
				{ polling: 25, timeout: LIFE_STEP_MS * (LIFE_SCENE_LENGTH + 3) },
				visibleAfter.scene,
			);
			sceneAfter = await lifeSnapshot(page);
		} catch {
			// Report the missing scene transition below with the captured state.
		}
	}
	const expectedScene = visibleAfter
		? String((Number.parseInt(visibleAfter.scene, 10) + 1) % LIFE_SCENE_COUNT)
		: "";
	report(
		`alternative Life: deterministic scene advances within the declared ${LIFE_SCENE_LENGTH}-generation cycle`,
		Boolean(
			visibleAfter &&
				sceneAfter &&
				sceneAfter.scene === expectedScene &&
				sceneAfter.generation >= 0 &&
				sceneAfter.generation < LIFE_SCENE_LENGTH,
		),
		`scene ${visibleAfter?.scene ?? "missing"} -> ${sceneAfter?.scene ?? "missing"}; generation ${sceneAfter?.generation ?? "missing"}`,
	);

	await page.click("[data-life-toggle]");
	await waitForLifeRunning(page, false);
	const pausedBefore = await lifeSnapshot(page);
	await waitMilliseconds(page, LIFE_STEP_MS * 2.5);
	const pausedAfter = await lifeSnapshot(page);
	report(
		"alternative Life: Pause freezes the board and exposes Play",
		Boolean(
			pausedBefore &&
				pausedAfter &&
				!pausedAfter.running &&
				pausedBefore.scene === pausedAfter.scene &&
				pausedBefore.generation === pausedAfter.generation &&
				pausedBefore.signature === pausedAfter.signature &&
				pausedAfter.togglePaused === "true" &&
				/\bplay\b/i.test(pausedAfter.toggleLabel),
		),
		`scene/generation ${pausedBefore?.scene ?? "missing"}/${pausedBefore?.generation ?? "missing"} -> ${pausedAfter?.scene ?? "missing"}/${pausedAfter?.generation ?? "missing"}; label=${JSON.stringify(pausedAfter?.toggleLabel)}`,
	);

	let ruleBefore = pausedAfter;
	if (ruleBefore && ruleBefore.generation >= LIFE_SCENE_LENGTH) {
		await page.click("[data-life-toggle]");
		await waitForLifeRunning(page, true);
		const nextScene = await waitForLifeChange(page, ruleBefore);
		await page.click("[data-life-toggle]");
		await waitForLifeRunning(page, false);
		ruleBefore = nextScene;
	}

	let ruleAfter = null;
	if (ruleBefore) {
		await page.click("[data-life-toggle]");
		await waitForLifeRunning(page, true);
		ruleAfter = await waitForLifeChange(page, ruleBefore);
		await page.click("[data-life-toggle]");
		await waitForLifeRunning(page, false);
	}
	const expectedStates = ruleBefore
		? nextLifeGeneration(ruleBefore.states.map(isAliveLifeState), LIFE_SIZE)
		: [];
	const actualStates = ruleAfter?.states.map(isAliveLifeState) ?? [];
	const mismatchCount = expectedStates.reduce(
		(count, expected, index) => count + Number(expected !== actualStates[index]),
		0,
	);
	report(
		"alternative Life: one consecutive generation follows Conway B3/S23",
		Boolean(
			ruleBefore &&
				ruleAfter &&
				ruleBefore.scene === ruleAfter.scene &&
				ruleAfter.generation === ruleBefore.generation + 1 &&
				expectedStates.length === LIFE_CELL_COUNT &&
				actualStates.length === LIFE_CELL_COUNT &&
				mismatchCount === 0,
		),
		`scene/generation ${ruleBefore?.scene ?? "missing"}/${ruleBefore?.generation ?? "missing"} -> ${ruleAfter?.scene ?? "missing"}/${ruleAfter?.generation ?? "missing"}; ${mismatchCount} mismatches`,
	);

	const resumeBefore = await lifeSnapshot(page);
	await page.click("[data-life-toggle]");
	await waitForLifeRunning(page, true);
	const resumeAfter = resumeBefore ? await waitForLifeChange(page, resumeBefore) : null;
	report(
		"alternative Life: Play resumes the board and exposes Pause",
		Boolean(
			resumeAfter?.running &&
				resumeAfter.togglePaused === "false" &&
				/\bpause\b/i.test(resumeAfter.toggleLabel) &&
				resumeBefore?.signature !== resumeAfter.signature,
		),
		`running=${resumeAfter?.running ?? false}; label=${JSON.stringify(resumeAfter?.toggleLabel)}`,
	);

	await page.evaluate(() => {
		document.documentElement.style.scrollBehavior = "auto";
		window.scrollTo(0, document.documentElement.scrollHeight);
	});
	await waitForLifeRunning(page, false);
	const offscreenBefore = await lifeSnapshot(page);
	await waitMilliseconds(page, LIFE_STEP_MS * 2.5);
	const offscreenAfter = await lifeSnapshot(page);
	report(
		"alternative Life: offscreen board pauses without advancing",
		Boolean(
			offscreenBefore &&
				offscreenAfter &&
				!offscreenAfter.isVisible &&
				!offscreenAfter.running &&
				offscreenBefore.scene === offscreenAfter.scene &&
				offscreenBefore.generation === offscreenAfter.generation &&
				offscreenBefore.signature === offscreenAfter.signature,
		),
		`visible=${offscreenAfter?.isVisible ?? false}; running=${offscreenAfter?.running ?? false}; generation ${offscreenBefore?.generation ?? "missing"} -> ${offscreenAfter?.generation ?? "missing"}`,
	);

	await page.evaluate(() => {
		document.querySelector("[data-life-board]")?.scrollIntoView({ block: "center" });
	});
	await waitForLifeRunning(page, true);
	const returnedBefore = await lifeSnapshot(page);
	const returnedAfter = returnedBefore ? await waitForLifeChange(page, returnedBefore) : null;
	report(
		"alternative Life: returning onscreen resumes the board",
		Boolean(
			returnedBefore &&
				returnedAfter &&
				returnedAfter.isVisible &&
				returnedAfter.running &&
				returnedBefore.signature !== returnedAfter.signature,
		),
		`visible=${returnedAfter?.isVisible ?? false}; running=${returnedAfter?.running ?? false}`,
	);
}

async function runDetailedRouteChecks(page, route) {
	await inspectAlternativeShell(page, route);
	await checkKeyboardNavigation(page, route.label);
	if (route.pathname === "/") {
		await inspectHome(page);
		await checkLifeAnimation(page);
	} else if (route.pathname === "/film/") {
		await inspectFilm(page);
	}
}

async function inspectHomeFilmPreviewSizing(page, label) {
	const sizing = await page.evaluate((expectedCount) => {
		const root = document.querySelector("[data-alt-film-preview]");
		const items = root ? [...root.querySelectorAll("[data-alt-film-preview-item]")] : [];
		const rootRect = root?.getBoundingClientRect();
		const itemRects = items.map((item) => item.getBoundingClientRect());
		const images = items.map((item) => item.querySelector("img"));
		const overlaps = itemRects.some((left, leftIndex) =>
			itemRects.some((right, rightIndex) => {
				if (rightIndex <= leftIndex) return false;
				const overlapWidth = Math.min(left.right, right.right) - Math.max(left.left, right.left);
				const overlapHeight = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
				return overlapWidth > 1 && overlapHeight > 1;
			}),
		);
		const responsiveImages = images.filter((image) => {
			if (!(image instanceof HTMLImageElement)) return false;
			const renderedWidth = image.getBoundingClientRect().width;
			const declaredWidth = Number.parseInt(image.getAttribute("width") ?? "", 10);
			const sourceWidths = [
				...(image.getAttribute("srcset") ?? "").matchAll(/\s(\d+)w(?:,|$)/g),
			].map((match) => Number.parseInt(match[1] ?? "", 10));
			const largestSourceWidth = Math.max(0, ...sourceWidths);
			const requiredWidth = Math.min(declaredWidth, Math.ceil(renderedWidth * 2));
			return renderedWidth > 0 && declaredWidth > 0 && largestSourceWidth >= requiredWidth - 1;
		}).length;
		return {
			contained: Boolean(
				rootRect &&
					itemRects.every(
						(rect) =>
							rect.width > 0 &&
							rect.height > 0 &&
							rect.left >= rootRect.left - 1 &&
							rect.right <= rootRect.right + 1,
					),
			),
			count: items.length,
			expectedCount,
			overlaps,
			responsiveImages,
		};
	}, FILM_PREVIEW_COUNT);

	report(
		`${label}: randomized film preview is responsive and non-overlapping`,
		sizing.count === FILM_PREVIEW_COUNT &&
			sizing.responsiveImages === FILM_PREVIEW_COUNT &&
			sizing.contained &&
			!sizing.overlaps,
		`${sizing.count} cards; ${sizing.responsiveImages} responsive images; contained=${sizing.contained}; overlaps=${sizing.overlaps}`,
	);
}

async function checkAlternativeAtViewport(browser, route, viewport, runDetailedChecks) {
	const page = await browser.newPage();
	const label = `${route.label} ${viewport.width}x${viewport.height}`;
	const finishErrorCheck = watchPage(page, label);

	try {
		await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);
		await page.setViewport({ height: viewport.height, width: viewport.width });
		if (!(await open(page, route.pathname, label))) return;

		if (runDetailedChecks) await runDetailedRouteChecks(page, route);

		const headerState = await page.$$eval(".alt-header__nav a[href]", (links) => {
			const visibleLinks = links.filter((link) => {
				const style = getComputedStyle(link);
				const rect = link.getBoundingClientRect();
				return style.display !== "none" && rect.width > 0 && rect.height > 0;
			});
			const navRect = document.querySelector(".alt-header__nav")?.getBoundingClientRect();
			const rects = visibleLinks.map((link) => link.getBoundingClientRect());
			return {
				count: visibleLinks.length,
				nonOverlapping: rects.every(
					(rect, index) => index === 0 || rect.left >= (rects[index - 1]?.right ?? 0) - 1,
				),
				textFits: visibleLinks.every((link) => link.scrollWidth <= link.clientWidth + 1),
				withinNav: Boolean(
					navRect &&
						rects.every((rect) => rect.left >= navRect.left - 1 && rect.right <= navRect.right + 1),
				),
			};
		});
		report(
			`${label}: all ${HEADER_HREFS.length} header tabs remain visible`,
			headerState.count === HEADER_HREFS.length,
			`${headerState.count} tabs`,
		);
		report(
			`${label}: header tabs fit without overlap`,
			headerState.nonOverlapping && headerState.textFits && headerState.withinNav,
			`non-overlap=${headerState.nonOverlapping}; text fits=${headerState.textFits}; within nav=${headerState.withinNav}`,
		);

		const overflow = await horizontalOverflow(page);
		report(
			`${label}: no horizontal overflow`,
			overflow.overflow <= 1,
			`scrollWidth ${overflow.scrollWidth}; clientWidth ${overflow.clientWidth}`,
		);
		if (route.pathname === "/film/") {
			await inspectFilmSizing(page, viewport, label);
		}
		if (route.pathname === "/") {
			await inspectHomeFilmPreviewSizing(page, label);
		}
		await page.screenshot({
			path: `${SCREENSHOT_DIR}/${route.label.replaceAll(" ", "-")}-${viewport.label}-${viewport.width}x${viewport.height}.png`,
			// The full Film archive can exceed browser full-page texture limits.
			fullPage: route.pathname !== "/film/",
		});
	} catch (error) {
		report(`${label}: checks complete`, false, describeError(error));
	} finally {
		finishErrorCheck();
		await page.close();
	}
}

async function checkJavaScriptDisabledHome(browser) {
	const page = await browser.newPage();
	const label = "site home JavaScript-disabled";
	const finishErrorCheck = watchPage(page, label);

	try {
		await page.setJavaScriptEnabled(false);
		await page.setViewport({ height: 1000, width: 1440 });
		if (!(await open(page, "/", label))) return;

		const structure = await page.evaluate(
			({ allowedStates, expectedFilmIds, expectedSize }) => {
				const art = document.querySelector("[data-life-art]");
				const board = document.querySelector("[data-life-board]");
				const cells = board ? [...board.querySelectorAll("[data-life-cell]")] : [];
				const filmPreview = document.querySelector("[data-alt-film-preview]");
				const filmItems = filmPreview
					? [...filmPreview.querySelectorAll("[data-alt-film-preview-item]")]
					: [];
				const filmIds = filmItems.map(
					(item) => item.getAttribute("data-alt-film-preview-item")?.trim() ?? "",
				);
				const states = cells.map(
					(cell) => cell.getAttribute("data-state")?.trim().toLowerCase() ?? "",
				);
				const coordinateKeys = cells.map((cell) => {
					const row = Number.parseInt(cell.getAttribute("data-row") ?? "", 10);
					const column = Number.parseInt(cell.getAttribute("data-column") ?? "", 10);
					return Number.isInteger(row) &&
						row >= 0 &&
						row < expectedSize &&
						Number.isInteger(column) &&
						column >= 0 &&
						column < expectedSize
						? `${row}:${column}`
						: "invalid";
				});
				const rect = board?.getBoundingClientRect();
				return {
					artHidden: art?.getAttribute("aria-hidden") === "true",
					artText: art?.textContent?.replace(/\s+/g, "") ?? "",
					bookSectionCount: document.querySelectorAll("#books[data-alt-book-section]").length,
					boardSceneCount: Number.parseInt(board?.getAttribute("data-life-scene-count") ?? "", 10),
					boardSceneLength: Number.parseInt(
						board?.getAttribute("data-life-scene-length") ?? "",
						10,
					),
					boardSize: Number.parseInt(board?.getAttribute("data-life-size") ?? "", 10),
					cellCount: cells.length,
					coordinateCount: new Set(coordinateKeys).size,
					filmDeclaredTotal: Number.parseInt(
						filmPreview?.getAttribute("data-alt-film-preview-total") ?? "",
						10,
					),
					filmIds,
					filmItemsValid: filmItems.every((item) => {
						const id = item.getAttribute("data-alt-film-preview-item")?.trim() ?? "";
						const image = item.querySelector("img");
						const caption = item.querySelector("figcaption");
						return (
							item.getAttribute("data-alt-film-preview-id") === id &&
							expectedFilmIds.includes(id) &&
							image instanceof HTMLImageElement &&
							Boolean(image.getAttribute("alt")?.trim()) &&
							Boolean(image.getAttribute("src")?.trim()) &&
							Boolean(image.getAttribute("srcset")?.trim()) &&
							Boolean(image.getAttribute("sizes")?.trim()) &&
							image.getAttribute("loading") === "lazy" &&
							Number.parseInt(image.getAttribute("width") ?? "", 10) > 0 &&
							Number.parseInt(image.getAttribute("height") ?? "", 10) > 0 &&
							Boolean(caption?.textContent?.trim())
						);
					}),
					filmReady: filmPreview?.getAttribute("data-alt-film-preview-ready") ?? "",
					generation: Number.parseInt(board?.getAttribute("data-life-generation") ?? "", 10),
					invalidStateCount: states.filter((state) => !allowedStates.includes(state)).length,
					liveCellCount: states.filter((state) => state !== "dead").length,
					running: board?.getAttribute("data-life-running") ?? "",
					stampPanelCount: document.querySelectorAll(".stamp-panel").length,
					visible: Boolean(rect && rect.width > 0 && rect.height > 0),
					writingPanelCount: document.querySelectorAll(".writing-panel").length,
				};
			},
			{
				allowedStates: [...LIFE_STATES],
				expectedFilmIds: filmAssetIds,
				expectedSize: LIFE_SIZE,
			},
		);

		report(
			"alternative no-JS: server-rendered 25x25 Life grid remains visible",
			structure.boardSize === LIFE_SIZE &&
				structure.boardSceneCount === LIFE_SCENE_COUNT &&
				structure.boardSceneLength === LIFE_SCENE_LENGTH &&
				structure.cellCount === LIFE_CELL_COUNT &&
				structure.coordinateCount === LIFE_CELL_COUNT &&
				structure.visible,
			`size=${structure.boardSize}; scenes=${structure.boardSceneCount}; scene length=${structure.boardSceneLength}; cells=${structure.cellCount}; coordinates=${structure.coordinateCount}; visible=${structure.visible}`,
		);
		report(
			"alternative no-JS: Books, Writing, and Stamps content remains absent",
			structure.bookSectionCount === 0 &&
				structure.writingPanelCount === 0 &&
				structure.stampPanelCount === 0,
			`books=${structure.bookSectionCount}; writing=${structure.writingPanelCount}; stamps=${structure.stampPanelCount}`,
		);
		report(
			"alternative no-JS: three complete film previews remain available",
			structure.filmDeclaredTotal === filmAssetIds.length &&
				structure.filmIds.length === FILM_PREVIEW_COUNT &&
				new Set(structure.filmIds).size === FILM_PREVIEW_COUNT &&
				structure.filmItemsValid &&
				structure.filmReady === "false",
			`declared=${structure.filmDeclaredTotal}; ids=${structure.filmIds.join(", ") || "none"}; ready=${structure.filmReady}`,
		);
		report(
			"alternative no-JS: initial Life state is valid, mixed, decorative, and static",
			structure.invalidStateCount === 0 &&
				structure.liveCellCount > 0 &&
				structure.liveCellCount < LIFE_CELL_COUNT &&
				structure.generation === 0 &&
				structure.running === "false" &&
				structure.artHidden &&
				structure.artText === "",
			`live=${structure.liveCellCount}; invalid states=${structure.invalidStateCount}; generation=${structure.generation}; running=${structure.running || "missing"}; hidden=${structure.artHidden}; text=${JSON.stringify(structure.artText.slice(0, 40))}`,
		);
		await page.evaluate(() => {
			document.querySelector("[data-alt-film-preview]")?.scrollIntoView({ block: "center" });
		});
		let noJsFilmImagesLoaded = false;
		try {
			await page.waitForFunction(
				(expectedCount) => {
					const images = [...document.querySelectorAll("[data-alt-film-preview-item] img")];
					return (
						images.length === expectedCount &&
						images.every(
							(image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
						)
					);
				},
				{ polling: 50, timeout: 10_000 },
				FILM_PREVIEW_COUNT,
			);
			noJsFilmImagesLoaded = true;
		} catch {
			// Report the fallback-image loading failure below.
		}
		report(
			"alternative no-JS: film preview images load",
			noJsFilmImagesLoaded,
			noJsFilmImagesLoaded ? `${FILM_PREVIEW_COUNT} loaded` : "one or more images failed",
		);
		await page.screenshot({
			fullPage: true,
			path: `${SCREENSHOT_DIR}/alternative-home-no-javascript.png`,
		});
	} catch (error) {
		report(`${label}: checks complete`, false, describeError(error));
	} finally {
		finishErrorCheck();
		await page.close();
	}
}

async function filmPreviewSnapshot(page) {
	await page.waitForSelector('[data-alt-film-preview][data-alt-film-preview-ready="true"]', {
		timeout: 3_000,
	});
	return page.evaluate((expectedIds) => {
		const root = document.querySelector("[data-alt-film-preview]");
		const ids = root
			? [...root.querySelectorAll("[data-alt-film-preview-item]")].map(
					(item) => item.getAttribute("data-alt-film-preview-item")?.trim() ?? "",
				)
			: [];
		const storageKey = root?.getAttribute("data-alt-film-preview-storage-key") ?? "";
		let storedIds = [];
		try {
			const parsed = storageKey ? JSON.parse(sessionStorage.getItem(storageKey) ?? "[]") : [];
			if (Array.isArray(parsed)) storedIds = parsed;
		} catch {
			storedIds = [];
		}
		return {
			ids,
			ready: root?.getAttribute("data-alt-film-preview-ready") === "true",
			storageKey,
			storedIds,
			total: Number.parseInt(root?.getAttribute("data-alt-film-preview-total") ?? "", 10),
			valid:
				ids.length === 3 && new Set(ids).size === 3 && ids.every((id) => expectedIds.includes(id)),
		};
	}, filmAssetIds);
}

async function checkHomeFilmPreviewRefresh(browser) {
	const page = await browser.newPage();
	const label = "site home randomized film refresh";
	const finishErrorCheck = watchPage(page, label);

	try {
		await page.evaluateOnNewDocument(() => {
			Math.random = () => 0;
			try {
				Object.defineProperty(Crypto.prototype, "getRandomValues", {
					configurable: true,
					value(array) {
						array.fill(0);
						return array;
					},
				});
			} catch {
				// Math.random remains deterministic if this browser does not allow the Crypto override.
			}
		});
		await page.setViewport({ height: 1000, width: 1440 });
		if (!(await open(page, "/", label))) return;

		const first = await filmPreviewSnapshot(page);
		await page.reload({ timeout: 15_000, waitUntil: "domcontentloaded" });
		await settle(page);
		const second = await filmPreviewSnapshot(page);
		await page.reload({ timeout: 15_000, waitUntil: "domcontentloaded" });
		await settle(page);
		const third = await filmPreviewSnapshot(page);
		const snapshots = [first, second, third];
		const snapshotsValid = snapshots.every(
			(snapshot) =>
				snapshot.ready &&
				snapshot.valid &&
				snapshot.total === filmAssetIds.length &&
				Boolean(snapshot.storageKey) &&
				arraysEqual(snapshot.ids, snapshot.storedIds),
		);
		const setsChanged =
			!unorderedArraysEqual(first.ids, second.ids) && !unorderedArraysEqual(second.ids, third.ids);
		report(
			"site home: each refresh replaces at least one film preview",
			snapshotsValid && setsChanged,
			`${first.ids.join(", ")} -> ${second.ids.join(", ")} -> ${third.ids.join(", ")}`,
		);

		await page.evaluate((storageKey) => {
			sessionStorage.setItem(storageKey, "{");
		}, third.storageKey);
		await page.reload({ timeout: 15_000, waitUntil: "domcontentloaded" });
		await settle(page);
		const afterMalformedStorage = await filmPreviewSnapshot(page);
		report(
			"site home: malformed saved film state falls back safely",
			afterMalformedStorage.ready &&
				afterMalformedStorage.valid &&
				arraysEqual(afterMalformedStorage.ids, afterMalformedStorage.storedIds),
			`ids=${afterMalformedStorage.ids.join(", ") || "none"}`,
		);
	} catch (error) {
		report(`${label}: checks complete`, false, describeError(error));
	} finally {
		finishErrorCheck();
		await page.close();
	}
}

async function checkReducedMotion(browser) {
	for (const route of SITE_ROUTES) {
		const page = await browser.newPage();
		const label = `${route.label} reduced motion`;
		const finishErrorCheck = watchPage(page, label);

		try {
			await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
			await page.setViewport({ height: 1000, width: 1440 });
			if (!(await open(page, route.pathname, label))) continue;

			const before = route.pathname === "/" ? await lifeSnapshot(page) : null;
			if (route.pathname === "/film/") {
				await page.click("[data-alt-film-trigger]");
				await settle(page);
			}
			const readiness = await page.evaluate(() => ({
				dataReady:
					document.documentElement.getAttribute("data-motion-ready") ??
					document.body.getAttribute("data-motion-ready") ??
					document.querySelector("[data-scroll-story]")?.getAttribute("data-motion-ready"),
				hasReadyClass:
					document.documentElement.classList.contains("motion-ready") ||
					document.body.classList.contains("motion-ready") ||
					document.querySelector("[data-scroll-story]")?.classList.contains("motion-ready") ===
						true,
				runningAnimations: document
					.getAnimations()
					.filter((animation) => animation.playState === "running").length,
			}));
			if (route.pathname === "/") {
				await waitMilliseconds(page, LIFE_STEP_MS * 2.5);
			}
			const after = route.pathname === "/" ? await lifeSnapshot(page) : null;

			report(
				`${label}: motion-ready is disabled`,
				!readiness.hasReadyClass && readiness.dataReady !== "true",
				`class=${readiness.hasReadyClass}; data=${JSON.stringify(readiness.dataReady)}`,
			);
			report(
				`${label}: no CSS or Web Animations are running`,
				readiness.runningAnimations === 0,
				`${readiness.runningAnimations} running animations`,
			);

			if (route.pathname === "/") {
				report(
					"alternative reduced motion: Life board is static by default with Play available",
					Boolean(
						before &&
							after &&
							!before.running &&
							!after.running &&
							before.scene === after.scene &&
							before.generation === after.generation &&
							before.signature === after.signature &&
							after.togglePaused === "true" &&
							/\bplay\b/i.test(after.toggleLabel),
					),
					`running=${after?.running ?? false}; scene/generation ${before?.scene ?? "missing"}/${before?.generation ?? "missing"} -> ${after?.scene ?? "missing"}/${after?.generation ?? "missing"}; label=${JSON.stringify(after?.toggleLabel)}`,
				);

				if (after) {
					await page.click("[data-life-toggle]");
					await waitForLifeRunning(page, true);
				}
				const optedIn = after ? await waitForLifeChange(page, after) : null;
				report(
					"alternative reduced motion: explicit Play opt-in advances the Life board",
					Boolean(
						optedIn?.running &&
							optedIn.togglePaused === "false" &&
							/\bpause\b/i.test(optedIn.toggleLabel) &&
							after?.signature !== optedIn.signature,
					),
					`running=${optedIn?.running ?? false}; label=${JSON.stringify(optedIn?.toggleLabel)}`,
				);
				if (optedIn?.running) {
					await page.click("[data-life-toggle]");
					await waitForLifeRunning(page, false);
				}
			}
		} catch (error) {
			report(`${label}: checks complete`, false, describeError(error));
		} finally {
			finishErrorCheck();
			await page.close();
		}
	}
}

let browser;
try {
	await checkAlternativeSource();
	await mkdir(SCREENSHOT_DIR, { recursive: true });
	const executablePath = await findBrowser();
	browser = await puppeteer.launch({
		args: ["--disable-dev-shm-usage"],
		executablePath,
		headless: true,
	});

	await checkRoot(browser);
	await checkHiddenRoutes(browser);
	for (const route of SITE_ROUTES) {
		for (const [index, viewport] of VIEWPORTS.entries()) {
			await checkAlternativeAtViewport(browser, route, viewport, index === 0);
		}
	}
	await checkHomeFilmPreviewRefresh(browser);
	await checkJavaScriptDisabledHome(browser);
	await checkReducedMotion(browser);
} catch (error) {
	report("verification runner", false, describeError(error));
} finally {
	if (browser) await browser.close();
}

console.log(`\nMain-site verification against ${BASE_URL}`);
console.log(`Screenshots: ${SCREENSHOT_DIR}\n`);
console.log(results.join("\n"));
console.log(`\n${failureCount === 0 ? "All checks passed." : `${failureCount} check(s) failed.`}`);

process.exitCode = failureCount === 0 ? 0 : 1;
