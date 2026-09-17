import type { AddressInfo } from "node:net";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vitest";
import type { MagicBrainMcpConfig } from "../src/config.js";
import { createMagicBrainHttpServer } from "../src/index.js";

const config: MagicBrainMcpConfig = {
  apiBaseUrl: new URL("https://example.test/api/v1/"),
  apiTimeoutMs: 1_000,
  maxResponseBytes: 4_096,
  maxToolChars: 8_192,
  port: 8788,
  bindHost: "127.0.0.1",
  allowedHosts: ["127.0.0.1", "localhost"],
  allowedOrigins: [],
};

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe("HTTP surface", () => {
  it("serves a credential-free health endpoint", async () => {
    const { httpServer, closeMcpHandler } = createMagicBrainHttpServer(config);
    await new Promise<void>((resolve) =>
      httpServer.listen(0, "127.0.0.1", resolve),
    );
    cleanups.push(
      async () =>
        new Promise<void>((resolve, reject) => {
          httpServer.close((error) => (error ? reject(error) : resolve()));
          void closeMcpHandler();
        }),
    );

    const { port } = httpServer.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/healthz`);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      status: "ok",
      server: "magic-brain",
      version: "0.1.0",
      transport: "streamable-http",
      upstream: "https://example.test/api/v1/",
    });
  });

  it("rejects unapproved browser origins on the MCP endpoint", async () => {
    const { httpServer, closeMcpHandler } = createMagicBrainHttpServer(config);
    await new Promise<void>((resolve) =>
      httpServer.listen(0, "127.0.0.1", resolve),
    );
    cleanups.push(
      async () =>
        new Promise<void>((resolve, reject) => {
          httpServer.close((error) => (error ? reject(error) : resolve()));
          void closeMcpHandler();
        }),
    );

    const { port } = httpServer.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://attacker.example",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });

    expect(response.status).toBe(403);
  });

  it("negotiates Streamable HTTP and lists tools", async () => {
    const { httpServer, closeMcpHandler } = createMagicBrainHttpServer(config);
    await new Promise<void>((resolve) =>
      httpServer.listen(0, "127.0.0.1", resolve),
    );
    cleanups.push(
      async () =>
        new Promise<void>((resolve, reject) => {
          httpServer.close((error) => (error ? reject(error) : resolve()));
          void closeMcpHandler();
        }),
    );

    const { port } = httpServer.address() as AddressInfo;
    const client = new Client({ name: "http-test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${port}/mcp`),
    );
    await client.connect(transport);

    const { tools } = await client.listTools();
    expect(tools).toHaveLength(17);

    await client.close();
  });
});
