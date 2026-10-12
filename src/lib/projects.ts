import github from "@/data/generated/github.json";
import { type Project, projects } from "@/data/projects";

export interface RepoStats {
	createdAt: string;
	defaultBranch: string;
	description: string | null;
	forks: number;
	fullName: string;
	homepage: string | null;
	languages: { bytes: number; name: string; share: number }[];
	lastCommit: { date: string; message: string; sha: string; url: string } | null;
	latestRelease: { name: string | null; publishedAt: string; tag: string; url: string } | null;
	latestTag: string | null;
	license: string | null;
	openIssues: number;
	pushedAt: string;
	readmeHtml: string;
	stars: number;
	totalCommits: number;
	url: string;
}

const repos = github.repos as unknown as Record<string, RepoStats>;

export const githubRetrieved = github.retrieved;

export const repoFor = (project: Project): RepoStats | null => repos[project.repo] ?? null;

/**
 * Languages keep one colour everywhere (colour follows the entity). Segments are
 * drawn in slot order so adjacent colours are the validated neighbours.
 */
const LANGUAGE_SLOTS = ["Julia", "Python", "R", "Stata"] as const;

export const languageSlot = (name: string) => {
	const index = LANGUAGE_SLOTS.indexOf(name as (typeof LANGUAGE_SLOTS)[number]);
	return index === -1 ? 0 : index + 1;
};

/** Languages above 1% of the code, in slot order, with the remainder folded into "Other". */
export const languageBar = (repo: RepoStats | null) => {
	if (!repo) return [];
	const major = repo.languages.filter((language) => language.share >= 0.01);
	const other = repo.languages
		.filter((language) => language.share < 0.01)
		.reduce((sum, language) => sum + language.share, 0);
	const ordered = [...major].sort(
		(a, b) => (languageSlot(a.name) || 99) - (languageSlot(b.name) || 99),
	);
	return [
		...ordered.map((language) => ({
			name: language.name,
			share: language.share,
			slot: languageSlot(language.name),
		})),
		...(other >= 0.001 ? [{ name: "Other", share: other, slot: 0 }] : []),
	];
};

export const percentLabel = (share: number) =>
	share >= 0.995 ? "100%" : share < 0.01 ? "<1%" : `${Math.round(share * 100)}%`;

export { projects, type Project };
