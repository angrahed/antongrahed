/* One-off interactive verification of the redesign against a `pnpm preview` server. */
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE_URL ?? "http://localhost:4322";
const SHOTS = "/tmp/site-shots";
const results = [];
const check = (name, ok, detail = "") =>
	results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);

const browser = await puppeteer.launch({
	executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	headless: "new",
});

try {
	const page = await browser.newPage();
	await page.setViewport({ width: 1440, height: 1000 });

	/* ---- film lightbox ---- */
	await page.goto(`${BASE}/film/`, { waitUntil: "networkidle0" });
	await page.click("[data-film-trigger]");
	await page.waitForSelector("#film-lightbox[aria-hidden='false']", { timeout: 3000 });
	const lightboxCaption = await page.$eval(
		"[data-film-lightbox-caption]",
		(el) => el.textContent.trim(),
	);
	check("lightbox opens with caption", lightboxCaption.length > 0, lightboxCaption);
	await page.screenshot({ path: `${SHOTS}/film-lightbox.png` });
	await page.keyboard.press("Escape");
	await page.waitForSelector("#film-lightbox[aria-hidden='true']", { timeout: 3000 });
	const focusRestored = await page.evaluate(() =>
		document.activeElement?.hasAttribute("data-film-trigger"),
	);
	check("lightbox Esc closes + focus restored", focusRestored === true);

	/* ---- projects password dialog ---- */
	await page.goto(`${BASE}/projects/`, { waitUntil: "networkidle0" });
	await page.click("[data-project-id]");
	await page.waitForSelector("#project-password-dialog[open]", { timeout: 3000 });
	await page.type("#project-password-input", "wrong-password");
	await page.click("#project-password-dialog button[type='submit']");
	await new Promise((r) => setTimeout(r, 200));
	const errorVisible = await page.$eval(
		"[data-password-error]",
		(el) => !el.classList.contains("hidden"),
	);
	check("wrong password shows inline error, dialog stays open", errorVisible);
	await page.screenshot({ path: `${SHOTS}/projects-dialog-error.png` });
	await page.evaluate(() => {
		const input = document.querySelector("#project-password-input");
		input.value = "";
	});
	await page.type("#project-password-input", "scandi-preview");
	await Promise.all([
		page.waitForNavigation({ timeout: 5000 }),
		page.click("#project-password-dialog button[type='submit']"),
	]);
	check(
		"correct password navigates",
		page.url().includes("scandinavian-statistical-office-portal"),
		page.url(),
	);

	/* ---- search modal (production build only) ---- */
	await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
	await page.keyboard.down("Meta");
	await page.keyboard.press("k");
	await page.keyboard.up("Meta");
	await page.waitForSelector("site-search dialog[open]", { timeout: 3000 });
	await page.type("site-search input", "economics");
	await new Promise((r) => setTimeout(r, 800));
	await page.screenshot({ path: `${SHOTS}/search-modal.png` });
	const resultCount = await page.$$eval(".pagefind-ui__result", (els) => els.length);
	check("Cmd+K search opens, pagefind returns results", resultCount > 0, `${resultCount} results`);
	await page.keyboard.press("Escape");

	/* ---- theme toggle + dark screenshots ---- */
	await page.click("theme-toggle button");
	await new Promise((r) => setTimeout(r, 200));
	const theme = await page.$eval("html", (el) => el.dataset.theme);
	check("theme toggle switches to dark", theme === "dark");
	await page.reload({ waitUntil: "networkidle0" });
	const themeAfterReload = await page.$eval("html", (el) => el.dataset.theme);
	check("dark theme persists across reload", themeAfterReload === "dark");
	for (const [name, path] of [
		["index-dark", "/"],
		["about-dark", "/about/"],
		["film-dark", "/film/"],
		["stamps-dark", "/stamps/"],
	]) {
		await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
		await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
	}
	// back to light for remaining checks
	await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
	await page.click("theme-toggle button");

	/* ---- mobile menu ---- */
	const mobile = await browser.newPage();
	await mobile.setViewport({ width: 390, height: 844 });
	await mobile.goto(`${BASE}/`, { waitUntil: "networkidle0" });
	await mobile.screenshot({ path: `${SHOTS}/index-mobile.png`, fullPage: true });
	await mobile.click("#toggle-navigation-menu");
	await new Promise((r) => setTimeout(r, 200));
	const menuVisible = await mobile.$eval("#navigation-menu", (el) => {
		const style = window.getComputedStyle(el);
		return style.display !== "none";
	});
	check("mobile hamburger opens menu", menuVisible);
	await mobile.screenshot({ path: `${SHOTS}/index-mobile-menu.png` });
	await mobile.goto(`${BASE}/film/`, { waitUntil: "networkidle0" });
	await mobile.screenshot({ path: `${SHOTS}/film-mobile.png`, fullPage: true });

	/* ---- og image + favicon assets ---- */
	const og = await page.goto(`${BASE}/og-image/webmentions.png`);
	check("og-image route serves png", og.status() === 200 && og.headers()["content-type"] === "image/png");
	const fav = await page.goto(`${BASE}/favicon-32x32.png`);
	check("generated favicon served", fav.status() === 200);
} catch (err) {
	results.push(`ERROR ${err.message}`);
} finally {
	await browser.close();
}

console.log(results.join("\n"));
