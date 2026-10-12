/*
 * Browser-level checks for the site.
 *
 * Build, start a preview on port 4322, then run:
 *   pnpm build && pnpm preview --port 4322
 *   pnpm verify:site
 *
 * Override the server or Chrome binary when needed:
 *   BASE_URL=http://localhost:4322 PUPPETEER_EXECUTABLE_PATH=/path/to/chrome pnpm verify:site
 */
import puppeteer from "puppeteer-core";

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:4322").replace(/\/$/, "");
const CHROME =
	process.env.PUPPETEER_EXECUTABLE_PATH ??
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PAGES = [
	"/",
	"/about/",
	"/projects/",
	"/projects/tradescrapr/",
	"/projects/ebrdo/",
	"/projects/countrycodes-jl/",
	"/projects/wbdata-jl/",
	"/film/",
];
const HIDDEN = ["/stamps/", "/posts/", "/tags/"];
const WIDTHS = [375, 768, 1280];
const IGNORED_ERRORS = [/_vercel\/insights/, /pagefind/];

const results = [];
const check = async (name, fn) => {
	try {
		await fn();
		results.push({ name, ok: true });
		console.log(`  ok    ${name}`);
	} catch (error) {
		results.push({ error, name, ok: false });
		console.log(`  FAIL  ${name}\n        ${error.message}`);
	}
};
const assert = (condition, message) => {
	if (!condition) throw new Error(message);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });

const open = async (path, { motion = "reduce", scheme = "light", width = 1280 } = {}) => {
	const page = await browser.newPage();
	page.errors = [];
	page.on("pageerror", (error) => page.errors.push(String(error)));
	page.on("console", (message) => {
		if (message.type() !== "error") return;
		const text = `${message.text()} ${message.location()?.url ?? ""}`;
		if (!IGNORED_ERRORS.some((pattern) => pattern.test(text))) page.errors.push(text);
	});
	await page.setViewport({ height: 900, width });
	await page.emulateMediaFeatures([
		{ name: "prefers-reduced-motion", value: motion },
		{ name: "prefers-color-scheme", value: scheme },
	]);
	await page.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle0" });
	return page;
};

console.log(`Checking ${BASE_URL}\n\nRoutes`);

for (const path of PAGES) {
	await check(`${path} responds 200`, async () => {
		const response = await fetch(`${BASE_URL}${path}`);
		assert(response.status === 200, `status ${response.status}`);
	});
}

await check("unknown path serves the 404 page", async () => {
	const response = await fetch(`${BASE_URL}/no-such-page/`);
	const html = await response.text();
	assert(response.status === 404, `status ${response.status}`);
	assert(html.includes("This page doesn’t exist."), "404 copy missing");
});

for (const path of HIDDEN) {
	await check(`${path} redirects while its feature is off`, async () => {
		const html = await (await fetch(`${BASE_URL}${path}`)).text();
		assert(/http-equiv="refresh"/.test(html), "no redirect page");
	});
}

await check("Figure 1 CSV has a header and one row per economy-year", async () => {
	const text = await (await fetch(`${BASE_URL}/data/transition.csv`)).text();
	const lines = text.trim().split("\n");
	assert(lines[0]?.startsWith("iso3,economy,region,year,gdp_per_capita_ppp_2021usd"), "bad header");
	assert((lines.length - 1) % 30 === 0 && lines.length > 900, `${lines.length - 1} rows`);
});

await check("film basemap is an SVG", async () => {
	const response = await fetch(`${BASE_URL}/film/basemap.svg`);
	assert(response.headers.get("content-type")?.includes("svg"), "wrong content type");
	assert((await response.text()).startsWith("<svg"), "not an svg");
});

console.log("\nFirst paint without JavaScript");

await check("home HTML already contains the chart, map and table", async () => {
	const html = await (await fetch(`${BASE_URL}/`)).text();
	const contextPaths = html.match(/<path d="M[^"]+" data-iso="[A-Z]{3}"/g) ?? [];
	const tiles = html.match(/class="tfig__tile"/g) ?? [];
	assert(contextPaths.length >= 30, `${contextPaths.length} country lines`);
	assert(tiles.length === 30, `${tiles.length} tiles`);
	assert(html.includes("Figure 1"), "figure label missing");
});

console.log("\nLayout and errors");

for (const path of PAGES) {
	for (const scheme of ["light", "dark"]) {
		await check(`${path} ${scheme}: no overflow at ${WIDTHS.join("/")}px, no errors`, async () => {
			for (const width of WIDTHS) {
				const page = await open(path, { scheme, width });
				const overflow = await page.evaluate(
					() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
				);
				assert(overflow <= 0, `${overflow}px horizontal overflow at ${width}px`);
				assert(page.errors.length === 0, page.errors.join(" | "));
				await page.close();
			}
		});
	}
}

await check("every image has alt text and loads", async () => {
	for (const path of ["/", "/about/", "/film/"]) {
		const page = await open(path);
		await page.evaluate(async () => {
			for (let y = 0; y < document.body.scrollHeight; y += 600) {
				window.scrollTo(0, y);
				await new Promise((resolve) => setTimeout(resolve, 30));
			}
		});
		await sleep(800);
		const problems = await page.evaluate(() =>
			Array.from(document.images)
				.filter((image) => !image.closest("dialog"))
				.filter(
					(image) => !image.hasAttribute("alt") || !image.complete || image.naturalWidth === 0,
				)
				.map((image) => image.currentSrc || image.src),
		);
		assert(problems.length === 0, `${path}: ${problems.slice(0, 3).join(", ")}`);
		await page.close();
	}
});

await check("internal links resolve", async () => {
	const seen = new Set();
	for (const path of PAGES) {
		const page = await open(path);
		const hrefs = await page.evaluate(() =>
			Array.from(document.querySelectorAll("a[href]"))
				.map((link) => link.getAttribute("href") ?? "")
				.filter((href) => href.startsWith("/") && !href.startsWith("//")),
		);
		for (const href of hrefs) seen.add(href.split("#")[0].split("?")[0] || "/");
		await page.close();
	}
	const broken = [];
	for (const href of seen) {
		const response = await fetch(`${BASE_URL}${href}`);
		if (response.status !== 200) broken.push(`${href} (${response.status})`);
	}
	assert(broken.length === 0, broken.join(", "));
});

console.log("\nFigure 1");

await check("story: every step moves the 30 marks to a titled scene inside the plot", async () => {
	for (const phone of [false, true]) {
		const page = await open("/", phone ? { width: 390 } : {});
		const count = await page.$$eval("[data-story-step]", (steps) => steps.length);
		assert(count === 16, `expected 16 steps, found ${count}`);
		const ready = await page.$eval(".story", (story) => story.classList.contains("is-ready"));
		assert(ready, "story never became ready");
		for (let index = 0; index < count; index += 1) {
			const state = await page.evaluate((index) => {
				const step = document.querySelectorAll("[data-story-step]")[index];
				const card = step.firstElementChild;
				const line = window.innerHeight * (window.innerWidth < 960 ? 0.86 : 0.6);
				window.scrollTo({
					behavior: "instant",
					top: card.getBoundingClientRect().top + window.scrollY - line + 40,
				});
				return { chapter: step.dataset.chapter };
			}, index);
			await sleep(120);
			const scene = await page.evaluate((index) => {
				const plot = document.querySelector("[data-story-plot]").getBoundingClientRect();
				const marks = [...document.querySelectorAll(".story__mark:not(.is-hidden)")];
				const outside = marks.filter((mark) => {
					const box = mark.getBoundingClientRect();
					const x = box.left + box.width / 2;
					const y = box.top + box.height / 2;
					return x < plot.left - 1 || x > plot.right + 1 || y < plot.top - 1 || y > plot.bottom + 1;
				});
				const stage = document.querySelector("[data-story-stage]").getBoundingClientRect();
				const box = document
					.querySelectorAll("[data-story-step]")
					[index].firstElementChild.getBoundingClientRect();
				const probe = document.elementFromPoint(box.left + 20, box.top + 12);
				const readable =
					box.top >= stage.bottom - 1 &&
					Boolean(
						probe?.closest("[data-story-step]") ===
							document.querySelectorAll("[data-story-step]")[index],
					);
				return {
					chapter: document.querySelector("[data-story-chapter]")?.textContent,
					outside: outside.map((mark) => mark.dataset.iso),
					readable,
					title: document.querySelector("[data-story-title]")?.textContent ?? "",
					visible: marks.length,
				};
			}, index);
			const where = `${phone ? "phone" : "desktop"} step ${index + 1}`;
			assert(scene.chapter === state.chapter, `${where}: chapter ${scene.chapter}`);
			assert(scene.title.length > 10, `${where}: no chart title`);
			assert(scene.visible >= 24, `${where}: only ${scene.visible} marks`);
			assert(!scene.outside.length, `${where}: outside the plot ${scene.outside}`);
			// On phones the chart is pinned above the text; it must never cover it.
			if (phone) assert(scene.readable, `${where}: text is covered`);
		}
		await page.close();
	}
});

await check("intro draws the lines once, then settles on the latest year", async () => {
	const page = await open("/", { motion: "no-preference" });
	const classes = await page.$eval("#figure-1", (figure) => figure.className);
	assert(classes.includes("is-intro"), "intro did not start");
	// The intro waits until the figure is on screen (it sits below the story).
	await page.$eval("#figure-1", (figure) => figure.scrollIntoView({ behavior: "instant" }));
	await page.waitForFunction(
		() => document.getElementById("figure-1")?.classList.contains("is-done"),
		{
			timeout: 8000,
		},
	);
	const year = await page.$eval("[data-tfig-year-label]", (output) => output.textContent);
	const last = await page.$eval("[data-tfig-year]", (input) => input.max);
	assert(year === last, `settled on ${year}, expected ${last}`);
	await page.close();
});

await check("reduced motion skips the intro", async () => {
	const page = await open("/");
	const classes = await page.$eval("#figure-1", (figure) => figure.className);
	assert(!classes.includes("is-intro"), "intro ran under reduced motion");
	await page.close();
});

await check("measures switch, re-render with styles, and update the URL", async () => {
	const page = await open("/");
	await page.click('[data-tfig-tab="index"]');
	const state = await page.evaluate(() => ({
		fill: getComputedStyle(document.querySelector(".tfig__pinned path")).fill,
		search: location.search,
		tick: document.querySelector(".tfig__yaxis span")?.textContent ?? "",
		tickPosition: getComputedStyle(document.querySelector(".tfig__yaxis span")).position,
		title: document.querySelector("[data-tfig-title]")?.textContent ?? "",
	}));
	assert(state.title.startsWith("GDP per capita relative to 1990"), state.title);
	assert(state.search.includes("measure=index"), state.search);
	assert(/^\d+$/.test(state.tick), `tick "${state.tick}"`);
	assert(state.fill === "none", `pinned line fill is ${state.fill}`);
	assert(state.tickPosition === "absolute", "axis labels lost their styles");
	await page.keyboard.press("Tab");
	await page.close();
});

await check("year slider, map pinning (max three) and table view", async () => {
	const page = await open("/");
	await page.$eval("[data-tfig-year]", (input) => {
		input.value = "1995";
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
	assert(
		(await page.$eval("[data-tfig-year-label]", (o) => o.textContent)) === "1995",
		"year label",
	);
	for (const iso of ["EST", "GEO"]) await page.click(`.tfig__tile[data-iso="${iso}"]`);
	let pinned = await page.$$eval('.tfig__tile[aria-pressed="true"]', (tiles) =>
		tiles.map((t) => t.dataset.iso),
	);
	assert(pinned.length === 3 && !pinned.includes("POL"), `pinned ${pinned}`);
	const keys = await page.$$eval(".tfig__key", (items) => items.length);
	assert(keys === 4, `${keys} legend keys`);
	await page.click('.tfig__tile[data-iso="EST"]');
	pinned = await page.$$eval('.tfig__tile[aria-pressed="true"]', (tiles) => tiles.length);
	assert(pinned === 2, "unpin failed");
	await page.click('[data-tfig-view="table"]');
	const table = await page.evaluate(() => ({
		chartHidden:
			getComputedStyle(document.querySelector("[data-tfig-chart-view]")).display === "none",
		rows: document.querySelectorAll("[data-tfig-table-body] tr").length,
		year: document.querySelector("[data-tfig-table-year]")?.textContent,
	}));
	assert(table.chartHidden && table.rows === 30 && table.year === "1995", JSON.stringify(table));
	await page.close();
});

await check("distribution tab: one dot per economy, density, median, playback", async () => {
	// Motion allowed: the play control is hidden for reduced-motion users.
	const page = await open("/", { motion: "no-preference" });
	await page.click('[data-tfig-tab="distribution"]');
	await sleep(400);
	const at2025 = await page.evaluate(() => ({
		density: document.querySelector("[data-tfig-density-now]")?.getAttribute("d")?.length ?? 0,
		dots: document.querySelectorAll(".tfig__swarm i:not(.is-missing)").length,
		kind: document.getElementById("figure-1")?.dataset.kind,
		median: document.querySelector("[data-tfig-dist-median-label]")?.textContent ?? "",
		tick: document.querySelector("[data-tfig-xaxis] span")?.textContent ?? "",
	}));
	assert(at2025.kind === "distribution", `kind ${at2025.kind}`);
	assert(at2025.dots === 30 && at2025.density > 500, JSON.stringify(at2025));
	assert(
		at2025.median.startsWith("Median $") && at2025.tick.startsWith("$"),
		JSON.stringify(at2025),
	);
	const overlaps = await page.evaluate(() => {
		const boxes = Array.from(document.querySelectorAll(".tfig__swarm i:not(.is-missing)")).map(
			(dot) => dot.getBoundingClientRect(),
		);
		let count = 0;
		for (let i = 0; i < boxes.length; i += 1)
			for (let j = i + 1; j < boxes.length; j += 1) {
				const a = boxes[i];
				const b = boxes[j];
				const dx = a.x + a.width / 2 - (b.x + b.width / 2);
				const dy = a.y + a.height / 2 - (b.y + b.height / 2);
				if (Math.hypot(dx, dy) < a.width - 1) count += 1;
			}
		return count;
	});
	assert(overlaps === 0, `${overlaps} overlapping dots`);
	await page.$eval("[data-tfig-year]", (input) => {
		input.value = "1990";
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
	const at1990 = await page.evaluate(() => ({
		base: document.querySelector("[data-tfig-density-base]")?.getAttribute("d") ?? "",
		dots: document.querySelectorAll(".tfig__swarm i:not(.is-missing)").length,
	}));
	assert(at1990.dots === 27 && at1990.base === "", JSON.stringify(at1990));
	await page.click("[data-tfig-play]");
	await sleep(700);
	const playing = await page.evaluate(() => ({
		sweeping: document.getElementById("figure-1")?.classList.contains("is-sweeping"),
		year: Number(document.querySelector("[data-tfig-year-label]")?.textContent),
	}));
	assert(playing.sweeping && playing.year > 1990, JSON.stringify(playing));
	await page.click('[data-tfig-tab="gdppc"]');
	const after = await page.evaluate(() => ({
		kind: document.getElementById("figure-1")?.dataset.kind,
		sweeping: document.getElementById("figure-1")?.classList.contains("is-sweeping"),
	}));
	assert(after.kind === "series" && !after.sweeping, JSON.stringify(after));
	await page.close();
});

await check("convergence: gap to the frontier, catch-up scatter, benchmark switch", async () => {
	const page = await open("/");
	await page.click('[data-tfig-tab="convergence"]');
	await sleep(300);
	const gap = await page.evaluate(() => ({
		frontierLine: document.querySelectorAll(".tfig__grid line.is-baseline").length,
		keys: document.querySelector("[data-tfig-keys]")?.textContent ?? "",
		kind: document.getElementById("figure-1")?.dataset.kind,
		search: location.search,
		sub: !document.querySelector("[data-tfig-sub]")?.hidden,
		title: document.querySelector("[data-tfig-title]")?.textContent ?? "",
		top: Array.from(document.querySelectorAll(".tfig__yaxis span")).at(-1)?.textContent,
	}));
	assert(gap.kind === "series" && gap.sub, JSON.stringify(gap));
	assert(gap.title.startsWith("GDP per capita relative to the G7"), gap.title);
	assert(gap.keys.includes("G7 = 100%") && gap.frontierLine === 1, JSON.stringify(gap));
	assert(gap.top === "100%" && gap.search.includes("measure=gap-g7"), JSON.stringify(gap));

	await page.click('[data-tfig-form="catchup"]');
	await sleep(400);
	const catchup = await page.evaluate(() => {
		const fit = document.querySelector("[data-tfig-fit]");
		const dot = document.querySelector(".tfig__swarm i:not(.is-missing)");
		return {
			dotFill: dot ? getComputedStyle(dot).backgroundColor : "",
			dots: document.querySelectorAll(".tfig__swarm i:not(.is-missing)").length,
			fitSlopesDown: Number(fit?.getAttribute("y2")) > Number(fit?.getAttribute("y1")),
			keys: document.querySelector("[data-tfig-keys]")?.textContent ?? "",
			kind: document.getElementById("figure-1")?.dataset.kind,
			max: document.querySelector("[data-tfig-year]")?.getAttribute("max"),
			title: document.querySelector("[data-tfig-title]")?.textContent ?? "",
			xTick: document.querySelector("[data-tfig-xaxis] span")?.textContent ?? "",
			yearLabel: document.querySelector("[data-tfig-year-label]")?.textContent,
		};
	});
	assert(catchup.kind === "convergence" && catchup.dots === 28, JSON.stringify(catchup));
	assert(catchup.title.startsWith("Catching up with the G7: income in 1995"), catchup.title);
	assert(catchup.yearLabel === "1995–2025" && catchup.max === "2015", JSON.stringify(catchup));
	assert(catchup.fitSlopesDown && catchup.xTick.endsWith("%"), JSON.stringify(catchup));
	assert(catchup.keys.includes("Median economy") && !catchup.keys.includes("−0.0"), catchup.keys);
	assert(!/rgba?\((\d+), \1, \1/.test(catchup.dotFill), `dot is grey: ${catchup.dotFill}`);

	await page.click('[data-tfig-benchmark="usa"]');
	await sleep(300);
	const usa = await page.evaluate(() => ({
		search: location.search,
		title: document.querySelector("[data-tfig-title]")?.textContent ?? "",
	}));
	assert(usa.title.startsWith("Catching up with the United States"), usa.title);
	assert(usa.search.includes("measure=catchup-usa"), usa.search);

	await page.click('[data-tfig-tab="gdppc"]');
	const hidden = await page.$eval("[data-tfig-sub]", (row) => row.hidden);
	assert(hidden, "convergence options still showing on the Income tab");
	await page.close();
});

await check("About: portrait develops and text lights with scroll", async () => {
	const page = await open("/", { motion: "no-preference" });
	const before = await page.evaluate(() => ({
		armed: document.querySelector("[data-portrait]")?.classList.contains("is-armed"),
		lit: document.querySelector("[data-lit]")?.style.getPropertyValue("--p"),
	}));
	assert(before.armed && before.lit === "0.000", JSON.stringify(before));
	await page.$eval("#about", (section) => section.scrollIntoView({ behavior: "instant" }));
	await sleep(1500);
	const after = await page.evaluate(() => ({
		developed: document.querySelector("[data-portrait]")?.classList.contains("is-developed"),
		lit: Number(document.querySelector("[data-lit]")?.style.getPropertyValue("--p")),
	}));
	assert(after.developed && after.lit > 0.95, JSON.stringify(after));
	await page.close();

	const still = await open("/");
	const armed = await still.$eval("[data-portrait]", (portrait) =>
		portrait.classList.contains("is-armed"),
	);
	assert(!armed, "portrait animates under reduced motion");
	await still.close();
});

await check("a shared URL restores the view", async () => {
	const page = await open("/?measure=democracy&year=1993&compare=UKR,RUS");
	const state = await page.evaluate(() => ({
		pinned: Array.from(document.querySelectorAll('.tfig__tile[aria-pressed="true"]')).map(
			(t) => t.dataset.iso,
		),
		source: document.querySelector("[data-tfig-source]")?.textContent ?? "",
		title: document.querySelector("[data-tfig-title]")?.textContent ?? "",
		year: document.querySelector("[data-tfig-year-label]")?.textContent,
	}));
	assert(
		state.title.startsWith("Liberal democracy index") && state.year === "1993",
		JSON.stringify(state),
	);
	assert(state.source.startsWith("V-Dem"), `source ${state.source}`);
	assert(state.pinned.join() === "RUS,UKR", `pinned ${state.pinned}`);
	await page.close();
});

await check("life expectancy and democracy tabs: own last year and source", async () => {
	const page = await open("/");
	const read = () =>
		page.evaluate(() => ({
			max: document.querySelector("[data-tfig-year]")?.getAttribute("max"),
			source: document.querySelector("[data-tfig-source]")?.textContent ?? "",
			title: document.querySelector("[data-tfig-title]")?.textContent ?? "",
			year: document.querySelector("[data-tfig-year-label]")?.textContent,
		}));
	const income = await read();
	await page.click('[data-tfig-tab="lifeexp"]');
	await sleep(300);
	const life = await read();
	// Life expectancy ends a year before GDP: the slider stops there and the latest year follows.
	assert(Number(life.max) === Number(income.max) - 1, JSON.stringify({ income, life }));
	assert(life.year === life.max && life.title.endsWith(`–${life.max}`), JSON.stringify(life));
	assert(life.source.startsWith("World Bank"), life.source);
	await page.click('[data-tfig-tab="democracy"]');
	await sleep(300);
	const democracy = await read();
	assert(
		democracy.year === democracy.max && democracy.max === income.max,
		JSON.stringify(democracy),
	);
	assert(democracy.source.startsWith("V-Dem"), democracy.source);
	const tiles = await page.$$eval(
		".tfig__tile[data-bin]",
		(els) => els.filter((el) => el.dataset.bin !== "na").length,
	);
	assert(tiles >= 29, `only ${tiles} tiles have democracy data`);
	await page.close();
});

console.log("\nSite chrome");

await check("theme toggle persists across reloads", async () => {
	const page = await open("/about/");
	await page.click("[data-theme-toggle]");
	assert(
		(await page.evaluate(() => document.documentElement.dataset.theme)) === "dark",
		"not dark",
	);
	await page.reload({ waitUntil: "networkidle0" });
	const after = await page.evaluate(() => ({
		background: getComputedStyle(document.body).backgroundColor,
		theme: document.documentElement.dataset.theme,
	}));
	assert(after.theme === "dark" && after.background === "rgb(7, 17, 31)", JSON.stringify(after));
	await page.evaluate(() => localStorage.removeItem("theme"));
	await page.close();
});

await check("command palette opens, filters and navigates", async () => {
	const page = await open("/");
	await page.keyboard.down("Meta");
	await page.keyboard.press("k");
	await page.keyboard.up("Meta");
	assert(await page.$eval("[data-palette]", (dialog) => dialog.open), "palette did not open");
	await page.keyboard.type("wbd");
	const first = await page.$eval(
		'[role="option"][aria-selected="true"]',
		(option) => option.textContent,
	);
	assert(first?.includes("WBData.jl"), `first option "${first}"`);
	await Promise.all([page.waitForNavigation(), page.keyboard.press("Enter")]);
	assert(page.url().endsWith("/projects/wbdata-jl/"), page.url());
	await page.close();
});

await check("keyboard shortcuts: ? shows help, g p goes to projects", async () => {
	const page = await open("/about/");
	await page.keyboard.type("?");
	const help = await page.$eval("[data-palette-shortcuts]", (element) => !element.hidden);
	assert(help, "shortcuts view not shown");
	await page.keyboard.press("Escape");
	await sleep(150);
	await Promise.all([page.waitForNavigation(), page.keyboard.type("gp")]);
	assert(page.url().endsWith("/projects/"), page.url());
	await page.close();
});

await check(
	"header: name folds to AG on scroll, unfolds on hover; nav indicator; glass",
	async () => {
		const page = await open("/projects/", { motion: "no-preference" });
		const foldWidth = () =>
			page.$$eval(".brand__fold", (folds) =>
				folds.reduce((sum, fold) => sum + fold.getBoundingClientRect().width, 0),
			);
		const state = await page.evaluate(() => {
			const indicator = document.querySelector("[data-nav-indicator]");
			const current = document.querySelector('.site-nav a[aria-current="page"]');
			const header = document.querySelector("[data-site-header]");
			return {
				folded: header?.classList.contains("is-folded"),
				indicatorX: indicator?.getBoundingClientRect().left ?? 0,
				label: document.querySelector("[data-brand]")?.getAttribute("aria-label"),
				linkX: current?.getBoundingClientRect().left ?? -100,
				opacity: indicator ? getComputedStyle(indicator).opacity : "0",
				scrolled: header?.classList.contains("is-scrolled"),
			};
		});
		assert(
			!state.folded && !state.scrolled && state.label === "Anton Grahed, home",
			JSON.stringify(state),
		);
		assert(
			state.opacity === "1" && Math.abs(state.indicatorX - state.linkX - 8) < 2,
			JSON.stringify(state),
		);
		const unfolded = await foldWidth();
		assert(unfolded > 40, `full name not shown (${unfolded}px)`);

		await page.evaluate(() => window.scrollTo(0, 400));
		await sleep(900);
		const folded = await page.$eval("[data-site-header]", (header) => ({
			folded: header.classList.contains("is-folded"),
			scrolled: header.classList.contains("is-scrolled"),
		}));
		assert(folded.folded && folded.scrolled, JSON.stringify(folded));
		assert((await foldWidth()) < 1, "name did not fold to its initials");

		await page.hover(".brand");
		await sleep(900);
		assert((await foldWidth()) > 40, "hover did not unfold the name");
		await page.close();

		const phone = await open("/", { width: 375 });
		assert(
			(await phone.$$eval(
				".brand__fold",
				(folds) => folds[0]?.getBoundingClientRect().width ?? 9,
			)) < 1,
			"phone should show initials",
		);
		await phone.close();
	},
);

await check("status bar shows London time and follows sections", async () => {
	const page = await open("/");
	const clock = await page.$eval("[data-status-clock]", (time) => time.textContent);
	assert(/^\d{2}:\d{2}$/.test(clock ?? ""), `clock "${clock}"`);
	await page.$eval("#projects", (section) => section.scrollIntoView());
	await sleep(400);
	const label = await page.$eval("[data-status-section]", (span) => span.textContent);
	assert(label === "Projects", `section "${label}"`);
	await page.close();
});

console.log("\nFilm");

await check("filters by year and place, and clears", async () => {
	const page = await open("/film/");
	const visible = () =>
		page.$$eval(".sheet__item", (items) => items.filter((item) => !item.hidden).length);
	const total = await visible();
	const press = (selector) => page.$eval(selector, (element) => element.click());
	await press('[data-film-year="2022"]');
	const year = await visible();
	await press('.fmap__row[data-film-place="london"]');
	const both = await visible();
	assert(page.url().includes("place=london") && page.url().includes("year=2022"), page.url());
	await press(".film-filters__status [data-film-clear]");
	assert(
		year > 0 && year < total && both === 0 && (await visible()) === total,
		`${total}/${year}/${both}`,
	);
	await page.close();
});

await check("viewer opens with scan data, steps, and returns focus", async () => {
	const page = await open("/film/");
	await page.click('[data-film-open="3"]');
	await sleep(300);
	const state = await page.evaluate(() => ({
		histogram: document.querySelector('[data-hist="l"]')?.getAttribute("d")?.length ?? 0,
		open: document.querySelector("[data-film-viewer]").open,
		swatches: document.querySelectorAll("[data-viewer-palette] li").length,
		title: document.querySelector("[data-viewer-title]")?.textContent,
	}));
	assert(
		state.open && state.histogram > 50 && state.swatches >= 3 && state.title,
		JSON.stringify(state),
	);
	await page.keyboard.press("ArrowRight");
	assert(page.url().endsWith("#frame-4"), page.url());
	await page.keyboard.press("Escape");
	await sleep(100);
	const focused = await page.evaluate(() => document.activeElement?.dataset.filmOpen);
	assert(focused === "4", `focus on ${focused}`);
	await page.close();
});

await check("deep links open a frame", async () => {
	const page = await open("/film/#frame-12");
	assert(await page.$eval("[data-film-viewer]", (dialog) => dialog.open), "viewer closed");
	assert(
		(await page.$eval("[data-viewer-position]", (p) => p.textContent))?.includes("Frame 12"),
		"wrong frame",
	);
	await page.close();
});

await browser.close();

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length > 0 ? 1 : 0);
