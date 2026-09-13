import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { CliError } from "./client.js";

const execFileAsync = promisify(execFile);
const KEYCHAIN_SERVICE = "magic-brain-cli";
const KEYCHAIN_ACCOUNT = "oauth";

export type StoredAuth = {
  issuer: string;
  resource: string;
  clientId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
};

export async function login(input: {
  baseUrl: URL;
  scopes: string[];
  timeoutMs: number;
  fetchImpl: typeof fetch;
}) {
  const issuer = input.baseUrl.origin;
  const callback = await callbackListener();
  const registration = await postJson(
    input.fetchImpl,
    `${issuer}/oauth/register`,
    {
      client_name: "Magic Brain CLI",
      redirect_uris: [callback.redirectUri],
      token_endpoint_auth_method: "none",
    },
    input.timeoutMs,
  ) as { client_id?: string };
  if (!registration.client_id) throw new CliError("OAuth registration failed", 4);

  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(24).toString("base64url");
  const authorize = new URL("/oauth/authorize", issuer);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: registration.client_id,
    redirect_uri: callback.redirectUri,
    scope: input.scopes.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: input.baseUrl.toString().replace(/\/$/, ""),
  }).toString();
  await openBrowser(authorize.toString());
  console.error("Complete Magic Brain authorization in your browser.");
  const returned = await callback.wait(120_000);
  if (returned.state !== state) throw new CliError("OAuth state mismatch", 3);
  if (returned.error) throw new CliError(`Authorization denied: ${returned.error}`, 3);
  if (!returned.code) throw new CliError("Authorization code was not returned", 3);

  const tokenResponse = await input.fetchImpl(`${issuer}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: registration.client_id,
      code: returned.code,
      redirect_uri: callback.redirectUri,
      code_verifier: verifier,
      resource: input.baseUrl.toString().replace(/\/$/, ""),
    }),
    signal: AbortSignal.timeout(input.timeoutMs),
  });
  const tokens = await parseTokens(tokenResponse);
  const stored: StoredAuth = {
    issuer,
    resource: input.baseUrl.toString().replace(/\/$/, ""),
    clientId: registration.client_id,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
    scopes: tokens.scope.split(/\s+/).filter(Boolean),
  };
  await storeCredentials(stored);
  return { authenticated: true, scopes: stored.scopes, expiresAt: stored.expiresAt };
}

export async function authStatus() {
  const stored = await loadCredentials();
  return stored
    ? {
        authenticated: true,
        issuer: stored.issuer,
        resource: stored.resource,
        scopes: stored.scopes,
        expiresAt: stored.expiresAt,
        expired: stored.expiresAt <= Math.floor(Date.now() / 1000),
      }
    : { authenticated: false };
}

export async function logout(fetchImpl: typeof fetch, timeoutMs: number) {
  const stored = await loadCredentials();
  if (stored) {
    await fetchImpl(`${stored.issuer}/oauth/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: stored.refreshToken,
        client_id: stored.clientId,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    }).catch(() => undefined);
  }
  await deleteCredentials();
  return { authenticated: false, revoked: Boolean(stored) };
}

export async function accessToken(
  baseUrl: URL,
  fetchImpl: typeof fetch,
  timeoutMs: number,
) {
  const stored = await loadCredentials();
  if (!stored || stored.resource !== baseUrl.toString().replace(/\/$/, "")) {
    return undefined;
  }
  if (stored.expiresAt > Math.floor(Date.now() / 1000) + 30) {
    return stored.accessToken;
  }
  const response = await fetchImpl(`${stored.issuer}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: stored.clientId,
      refresh_token: stored.refreshToken,
      resource: stored.resource,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const tokens = await parseTokens(response);
  const rotated = {
    ...stored,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
    scopes: tokens.scope.split(/\s+/).filter(Boolean),
  };
  await storeCredentials(rotated);
  return rotated.accessToken;
}

async function callbackListener() {
  let resolveResult: (value: {
    code?: string;
    state?: string;
    error?: string;
  }) => void;
  const result = new Promise<{
    code?: string;
    state?: string;
    error?: string;
  }>((resolve) => {
    resolveResult = resolve;
  });
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const value = {
      code: url.searchParams.get("code") ?? undefined,
      state: url.searchParams.get("state") ?? undefined,
      error: url.searchParams.get("error") ?? undefined,
    };
    response.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end("Magic Brain authorization complete. You can close this window.");
    resolveResult!(value);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new CliError("Could not open OAuth callback listener", 4);
  }
  return {
    redirectUri: `http://127.0.0.1:${address.port}/callback`,
    wait: async (timeoutMs: number) => {
      const timeout = new Promise<never>((_resolve, reject) =>
        setTimeout(
          () => reject(new CliError("OAuth login timed out", 3)),
          timeoutMs,
        ),
      );
      try {
        return await Promise.race([result, timeout]);
      } finally {
        server.close();
      }
    },
  };
}

async function postJson(
  fetchImpl: typeof fetch,
  url: string,
  body: unknown,
  timeoutMs: number,
) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new CliError(`OAuth endpoint returned ${response.status}`, 4);
  return response.json();
}

async function parseTokens(response: Response) {
  const value = (await response.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error_description?: string;
  } | null;
  if (
    !response.ok ||
    !value?.access_token ||
    !value.refresh_token ||
    typeof value.expires_in !== "number" ||
    typeof value.scope !== "string"
  ) {
    throw new CliError(value?.error_description ?? "OAuth token request failed", 3);
  }
  return value as Required<Pick<
    NonNullable<typeof value>,
    "access_token" | "refresh_token" | "expires_in" | "scope"
  >>;
}

async function openBrowser(url: string) {
  const command: [string, string[]] =
    platform() === "darwin"
      ? ["open", [url]]
      : platform() === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  await execFileAsync(command[0], command[1]);
}

async function storeCredentials(value: StoredAuth) {
  const serialized = JSON.stringify(value);
  if (platform() === "darwin") {
    try {
      await execFileAsync("security", [
        "add-generic-password",
        "-U",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        KEYCHAIN_ACCOUNT,
        "-w",
        serialized,
      ]);
      return;
    } catch {
      // Fall through to an explicitly permission-restricted file.
    }
  }
  const path = credentialPath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, serialized, { mode: 0o600 });
  await chmod(path, 0o600);
  console.error(
    `Warning: secure keychain unavailable; OAuth tokens were stored in a mode-0600 file at ${path}.`,
  );
}

async function loadCredentials(): Promise<StoredAuth | undefined> {
  if (platform() === "darwin") {
    try {
      const { stdout } = await execFileAsync("security", [
        "find-generic-password",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        KEYCHAIN_ACCOUNT,
        "-w",
      ]);
      return JSON.parse(stdout.trim()) as StoredAuth;
    } catch {
      // Try the documented file fallback.
    }
  }
  try {
    return JSON.parse(await readFile(credentialPath(), "utf8")) as StoredAuth;
  } catch {
    return undefined;
  }
}

async function deleteCredentials() {
  if (platform() === "darwin") {
    await execFileAsync("security", [
      "delete-generic-password",
      "-s",
      KEYCHAIN_SERVICE,
      "-a",
      KEYCHAIN_ACCOUNT,
    ]).catch(() => undefined);
  }
  await rm(credentialPath(), { force: true });
}

function credentialPath() {
  return join(
    process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
    "magic-brain",
    "credentials.json",
  );
}
