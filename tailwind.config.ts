import type { Config } from "tailwindcss";

export default {
	plugins: [require("@tailwindcss/typography")],
	theme: {
		extend: {
			typography: () => ({
				DEFAULT: {
					css: {
						/* IBM Plex Serif body — "Sans is the interface, Serif is the writing" */
						fontSize: "1.0625rem",
						lineHeight: "1.8",
						"h1, h2, h3, h4, h5, h6": {
							fontFamily: "var(--font-sans)",
						},
						h2: {
							fontWeight: "300",
						},
						"h3, h4": {
							fontWeight: "600",
						},
						a: {
							fontWeight: "400",
							textUnderlineOffset: "4px",
							textDecorationThickness: "1px",
							"&:hover": {
								"@media (hover: hover)": {
									color: "var(--color-link)",
									textDecorationColor: "var(--color-link)",
								},
							},
						},
						blockquote: {
							borderLeftWidth: "4px",
							fontStyle: "italic",
							fontWeight: "400",
							quotes: "none",
						},
						code: {
							backgroundColor: "var(--color-surface)",
							border: "1px solid var(--color-border)",
							borderRadius: "0",
							fontWeight: "400",
							paddingInline: "0.375rem",
							paddingBlock: "0.125rem",
						},
						"code::before": {
							content: "none",
						},
						"code::after": {
							content: "none",
						},
						kbd: {
							borderRadius: "0",
							"&:where([data-theme='dark'], [data-theme='dark'] *)": {
								background: "var(--color-global-text)",
							},
						},
						strong: {
							fontWeight: "600",
						},
						sup: {
							marginInlineStart: "calc(var(--spacing) * 0.5)",
							a: {
								"&:after": {
									content: "']'",
								},
								"&:before": {
									content: "'['",
								},
								"&:hover": {
									"@media (hover: hover)": {
										color: "var(--color-link)",
									},
								},
							},
						},
						/* Table — solid Carbon hairlines */
						"tbody tr": {
							borderBottom: "1px solid var(--color-border)",
						},
						tfoot: {
							borderTop: "1px solid var(--color-border)",
						},
						thead: {
							borderBottomWidth: "none",
						},
						"thead th": {
							borderBottom: "1px solid var(--color-border-strong)",
							fontFamily: "var(--font-sans)",
							fontWeight: "600",
						},
						'th[align="center"], td[align="center"]': {
							"text-align": "center",
						},
						'th[align="right"], td[align="right"]': {
							"text-align": "right",
						},
						'th[align="left"], td[align="left"]': {
							"text-align": "left",
						},
						".expressive-code, .admonition, .github-card": {
							marginTop: "calc(var(--spacing)*4)",
							marginBottom: "calc(var(--spacing)*4)",
						},
					},
				},
				sm: {
					css: {
						code: {
							fontSize: "var(--text-sm)",
							fontWeight: "400",
						},
					},
				},
			}),
		},
	},
} satisfies Config;
