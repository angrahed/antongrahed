import { execSync } from "node:child_process";

const readGitSha = () => {
	try {
		return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
			.toString()
			.trim();
	} catch {
		return null;
	}
};

const fullSha = process.env.VERCEL_GIT_COMMIT_SHA || readGitSha();

/** Facts about this build, shown in the footer and status bar. */
export const buildInfo = {
	builtAt: new Date(),
	fullSha,
	repoUrl: "https://github.com/angrahed/antongrahed",
	sha: fullSha ? fullSha.slice(0, 7) : null,
} as const;

export const formatDay = (date: Date | string) =>
	new Date(date).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		timeZone: "UTC",
		year: "numeric",
	});
