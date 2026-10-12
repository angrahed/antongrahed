import { defineEcConfig } from "astro-expressive-code";

const mono =
	'"IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace';

/** Code blocks follow the site theme: OS preference, or <html data-theme> when pinned. */
export default defineEcConfig({
	defaultProps: { frame: "code" },
	styleOverrides: {
		borderColor: ({ theme }) => (theme.type === "dark" ? "#1b2a3f" : "#dbe2eb"),
		borderRadius: "2px",
		codeBackground: ({ theme }) => (theme.type === "dark" ? "#0c1828" : "#ffffff"),
		codeFontFamily: mono,
		codeFontSize: "0.8125rem",
		codeLineHeight: "1.7",
		codePaddingBlock: "0.9rem",
		codePaddingInline: "1.1rem",
		frames: {
			frameBoxShadowCssValue: "none",
			inlineButtonBackground: ({ theme }) => (theme.type === "dark" ? "#11213a" : "#eaf0f7"),
		},
		uiFontFamily: '"IBM Plex Sans Variable", "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
	},
	themeCssSelector: (theme) => `[data-theme='${theme.type}']`,
	themes: ["github-light", "github-dark"],
	useThemedScrollbars: false,
});
