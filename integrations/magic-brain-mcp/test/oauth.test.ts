import { describe, expect, it, vi } from "vitest";
import type { MagicBrainMcpConfig } from "../src/config.js";
import { MagicBrainTokenVerifier, createDelegation } from "../src/oauth.js";

const config: MagicBrainMcpConfig = {
  apiBaseUrl: new URL("https://api.example.test/api/v1/"),
  apiTimeoutMs: 1_000,
  maxResponseBytes: 4_096,
  maxToolChars: 8_192,
  port: 8788,
  bindHost: "127.0.0.1",
  allowedHosts: [],
  allowedOrigins: [],
  oauthIssuerUrl: new URL("https://auth.example.test"),
  oauthResourceUrl: new URL("https://mcp.example.test/mcp"),
  oauthIntrospectionUrl: new URL("https://auth.example.test/oauth/introspect"),
  oauthIntrospectionClientId: "mcp",
  oauthIntrospectionSecret: "introspection-secret",
  delegationSecret: "d".repeat(32),
  allowPersonalApiKey: false,
};

describe("MCP OAuth resource server", () => {
  it("validates audience and returns bounded auth context", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      expect(String(init?.body)).toContain("access-secret");
      expect(new Headers(init?.headers).get("authorization")).toMatch(/^Basic /);
      return new Response(
        JSON.stringify({
          active: true,
          client_id: "client-1",
          sub: "user-1",
          scope: "portfolio:read profile:read",
          exp: Math.floor(Date.now() / 1000) + 600,
          aud: config.oauthResourceUrl.toString(),
        }),
      );
    });
    const auth = await new MagicBrainTokenVerifier(
      config,
      fetchMock,
    ).verifyAccessToken("access-secret");
    expect(auth.extra?.subject).toBe("user-1");
    expect(auth.scopes).toEqual(["portfolio:read", "profile:read"]);
    expect(JSON.stringify(auth.extra)).not.toContain("access-secret");
  });

  it("rejects tokens issued for another resource", async () => {
    const verifier = new MagicBrainTokenVerifier(
      config,
      vi.fn<typeof fetch>(
        async () =>
          new Response(
            JSON.stringify({
              active: true,
              client_id: "client-1",
              sub: "user-1",
              scope: "profile:read",
              exp: Math.floor(Date.now() / 1000) + 600,
              aud: "https://other.example/mcp",
            }),
          ),
      ),
    );
    await expect(verifier.verifyAccessToken("access-secret")).rejects.toThrow(
      /invalid or expired/,
    );
  });

  it("creates short-lived API delegation without token passthrough", () => {
    const delegated = createDelegation(
      {
        token: "access-secret",
        clientId: "client-1",
        scopes: ["profile:read"],
        expiresAt: Math.floor(Date.now() / 1000) + 600,
        resource: config.oauthResourceUrl,
        extra: { subject: "user-1" },
      },
      config.delegationSecret,
    );
    expect(delegated).toMatch(/^[^.]+\.[^.]+$/);
    expect(delegated).not.toContain("access-secret");
  });
});
