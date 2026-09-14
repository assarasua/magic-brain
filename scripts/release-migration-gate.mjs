const DEFAULT_CHECK_NAME = "production-migrations";

export function repositorySlugFromPackage(packageJson) {
  const repository =
    typeof packageJson?.repository === "string"
      ? packageJson.repository
      : packageJson?.repository?.url;
  if (typeof repository !== "string") {
    throw new Error("package.json repository URL is required for the release gate");
  }
  const match = repository.match(
    /github\.com[/:]([^/]+)\/([^/#]+?)(?:\.git)?$/,
  );
  if (!match) {
    throw new Error("package.json repository must be a GitHub repository");
  }
  return `${match[1]}/${match[2]}`;
}

export async function waitForProductionMigrations({
  commitSha,
  repository,
  fetchFn = fetch,
  sleep = (delayMs) =>
    new Promise((resolve) => setTimeout(resolve, delayMs)),
  maxAttempts = 40,
  pollIntervalMs = 15_000,
  checkName = DEFAULT_CHECK_NAME,
  log = console.log,
}) {
  if (!/^[0-9a-f]{40}$/i.test(commitSha ?? "")) {
    throw new Error("WORKERS_CI_COMMIT_SHA must be a full Git commit SHA");
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "")) {
    throw new Error("A valid package repository slug is required");
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError("maxAttempts must be a positive integer");
  }

  const endpoint =
    `https://api.github.com/repos/${repository}/commits/${commitSha}/check-runs` +
    `?check_name=${encodeURIComponent(checkName)}&filter=latest&per_page=10`;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetchFn(endpoint, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "magic-brain-release-gate",
      },
    });
    if (!response.ok) {
      throw new Error(
        `Unable to verify production migrations: GitHub returned ${response.status}`,
      );
    }
    const payload = await response.json();
    const check = payload.check_runs?.find(
      (candidate) =>
        candidate.name === checkName &&
        candidate.head_sha === commitSha &&
        candidate.app?.slug === "github-actions",
    );

    if (check?.status === "completed") {
      if (check.conclusion === "success") {
        log(`Production migrations passed for ${commitSha}.`);
        return;
      }
      throw new Error(
        `Production migrations did not pass for ${commitSha}: ` +
          `${check.conclusion ?? "unknown conclusion"}`,
      );
    }
    if (attempt === maxAttempts) {
      throw new Error(
        `Timed out waiting for ${checkName} on ${commitSha}; deployment aborted`,
      );
    }
    log(
      `Waiting for ${checkName} on ${commitSha} ` +
        `(attempt ${attempt}/${maxAttempts}).`,
    );
    await sleep(pollIntervalMs);
  }
}
