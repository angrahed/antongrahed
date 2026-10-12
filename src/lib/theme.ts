/** Client-side theme control. The inline script in Site.astro applies a stored theme before paint. */

export type Theme = "dark" | "light";

const STORAGE_KEY = "theme";
const THEME_COLORS: Record<Theme, string> = { dark: "#07111f", light: "#f4f7fb" };
const media = window.matchMedia("(prefers-color-scheme: dark)");
const root = document.documentElement;

export const pinnedTheme = (): Theme | null => {
	const value = root.dataset.theme;
	return value === "dark" || value === "light" ? value : null;
};

export const effectiveTheme = (): Theme => pinnedTheme() ?? (media.matches ? "dark" : "light");

const syncThemeUi = () => {
	const next = effectiveTheme() === "dark" ? "light" : "dark";
	for (const button of document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]")) {
		button.setAttribute("aria-label", `Switch to ${next} theme`);
	}
	const pinned = pinnedTheme();
	for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
		const scheme = meta.media.includes("dark") ? "dark" : "light";
		meta.content = THEME_COLORS[pinned ?? scheme];
	}
};

/** Pin a theme, or pass null to follow the operating system again. */
export const setTheme = (theme: Theme | null) => {
	if (theme) root.dataset.theme = theme;
	else delete root.dataset.theme;
	try {
		if (theme) localStorage.setItem(STORAGE_KEY, theme);
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		// The choice still applies to this page view.
	}
	syncThemeUi();
	window.dispatchEvent(new CustomEvent("themechange", { detail: effectiveTheme() }));
};

export const toggleTheme = () => setTheme(effectiveTheme() === "dark" ? "light" : "dark");

let initialised = false;

export const initTheme = () => {
	if (initialised) return;
	initialised = true;
	syncThemeUi();
	for (const button of document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]")) {
		button.addEventListener("click", toggleTheme);
	}
	media.addEventListener("change", () => {
		syncThemeUi();
		window.dispatchEvent(new CustomEvent("themechange", { detail: effectiveTheme() }));
	});
};
