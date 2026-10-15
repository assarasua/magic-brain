import { describe, expect, it } from "vitest";
import worker from "../src/paused-worker.js";

describe("paused hosted MCP", () => {
  it.each(["/mcp", "/healthz", "/.well-known/oauth-authorization-server", "/oauth/token", "/"])("blocks %s before tools, OAuth or database access", async (path) => {
    for (const method of ["GET", "POST", "OPTIONS", "DELETE"]) {
      const response = await worker.fetch(new Request(`https://mcp.example${path}`, { method }));
      expect(response.status).toBe(503);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect((await response.json()).error.code).toBe("service_paused");
    }
  });
});
