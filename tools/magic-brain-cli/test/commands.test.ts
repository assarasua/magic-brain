import { afterEach, describe, expect, it, vi } from "vitest";
import { run } from "../src/index.js";

afterEach(() => vi.restoreAllMocks());

describe("CLI command routing", () => {
  it("routes graph neighbours with bounded query parameters", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/api/v1/opportunity-graph");
      expect(url.searchParams.get("q")).toBe("lotus");
      expect(url.searchParams.get("limit")).toBe("12");
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer test-key",
      );
      return new Response(JSON.stringify({ data: { nodes: [] } }));
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await expect(
      run(
        [
          "--base-url",
          "https://example.test/api/v1/",
          "graph",
          "neighbours",
          "--query",
          "lotus",
          "--limit",
          "12",
        ],
        { NODE_ENV: "test", MAGIC_BRAIN_API_KEY: "test-key" },
        fetchMock,
      ),
    ).resolves.toBe(0);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("refuses account mutations without explicit confirmation", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      run(
        [
          "--base-url",
          "https://example.test/api/v1/",
          "portfolio",
          "list-delete",
          "--id",
          "00000000-0000-4000-8000-000000000001",
          "--idempotency-key",
          "00000000-0000-4000-8000-000000000002",
        ],
        { NODE_ENV: "test", MAGIC_BRAIN_API_KEY: "test-key" },
        fetchMock,
      ),
    ).rejects.toThrow(/--confirm/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
