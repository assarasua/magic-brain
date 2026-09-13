import { describe, expect, it, vi } from "vitest";
import { ApiClient, CliError, normalizeBaseUrl } from "../src/client.js";

describe("CLI API client", () => {
  it("sends credentials without including them in results or errors", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer mb_test_private",
      );
      return new Response(JSON.stringify({ data: { ok: true } }));
    });
    const client = new ApiClient({
      baseUrl: new URL("https://example.test/api/v1/"),
      apiKey: "mb_test_private",
      locale: "en",
      timeoutMs: 1_000,
      retries: 0,
      fetchImpl: fetchMock,
    });
    const result = await client.request("cards");
    expect(result).toEqual({ data: { ok: true } });
    expect(JSON.stringify(result)).not.toContain("mb_test_private");
  });

  it("maps authorization failures to exit code 3", async () => {
    const client = new ApiClient({
      baseUrl: new URL("https://example.test/api/v1/"),
      locale: "en",
      timeoutMs: 1_000,
      retries: 0,
      fetchImpl: vi.fn<typeof fetch>(
        async () =>
          new Response(
            JSON.stringify({ error: { message: "account:read required" } }),
            { status: 403 },
          ),
      ),
    });
    await expect(client.request("portfolio")).rejects.toMatchObject({
      exitCode: 3,
    } satisfies Partial<CliError>);
  });

  it("normalizes API roots and rejects non-HTTP schemes", () => {
    expect(normalizeBaseUrl("http://127.0.0.1:3000/api/v1").toString()).toBe(
      "http://127.0.0.1:3000/api/v1/",
    );
    expect(() => normalizeBaseUrl("file:///tmp/api")).toThrow(/HTTP or HTTPS/);
  });
});
