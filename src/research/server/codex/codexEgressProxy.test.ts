import { connect, createServer, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  type CodexEgressProxy,
  startCodexEgressProxy,
} from "./codexEgressProxy";

const proxies: CodexEgressProxy[] = [];

afterEach(async () => {
  await Promise.all(
    proxies.splice(0).map(async (proxy) => await proxy.close()),
  );
});

async function connectStatus(
  proxy: CodexEgressProxy,
  authority: string,
  includeAuthorization = true,
): Promise<number> {
  const proxyUrl = new URL(proxy.url);
  const socket = await new Promise<Socket>((resolve, reject) => {
    const candidate = connect(proxy.port, "127.0.0.1");
    candidate.once("connect", () => resolve(candidate));
    candidate.once("error", reject);
  });
  const authorization = includeAuthorization
    ? `Proxy-Authorization: Basic ${Buffer.from(
        `${decodeURIComponent(proxyUrl.username)}:${decodeURIComponent(proxyUrl.password)}`,
      ).toString("base64")}\r\n`
    : "";
  socket.end(
    `CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n${authorization}\r\n`,
  );
  const response = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    socket.once("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    socket.once("error", reject);
  });
  return Number(response.match(/^HTTP\/1\.1 (\d{3})/)?.[1]);
}

describe("Codex provider egress proxy", () => {
  it("contains an accepted client reset instead of crashing the host process", async () => {
    // Given
    const upstream = createServer((socket) => socket.resume());
    await new Promise<void>((resolve, reject) => {
      upstream.once("error", reject);
      upstream.listen(0, "127.0.0.1", resolve);
    });
    const upstreamAddress = upstream.address();
    if (upstreamAddress === null || typeof upstreamAddress === "string")
      throw new TypeError("upstream fixture did not bind a TCP port");
    const proxy = await startCodexEgressProxy({
      resolveAddresses: () => Promise.resolve(["93.184.216.34"]),
      connectUpstream: () => connect(upstreamAddress.port, "127.0.0.1"),
    });
    proxies.push(proxy);
    const socket = await new Promise<Socket>((resolve, reject) => {
      const candidate = connect(proxy.port, "127.0.0.1");
      candidate.once("connect", () => resolve(candidate));
      candidate.once("error", reject);
    });
    socket.on("error", () => undefined);
    const proxyUrl = new URL(proxy.url);
    const authorization = Buffer.from(
      `${decodeURIComponent(proxyUrl.username)}:${decodeURIComponent(proxyUrl.password)}`,
    ).toString("base64");
    socket.write(
      `CONNECT chatgpt.com:443 HTTP/1.1\r\nHost: chatgpt.com:443\r\nproxy-authorization: Basic ${authorization}\r\n\r\n`,
    );
    await new Promise<void>((resolve, reject) => {
      socket.once("data", (chunk) => {
        if (chunk.toString("utf8").startsWith("HTTP/1.1 200")) resolve();
        else reject(new TypeError("proxy tunnel was not accepted"));
      });
    });

    // When
    socket.resetAndDestroy();
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Then
    await expect(proxy.close()).resolves.toBeUndefined();
    proxies.splice(proxies.indexOf(proxy), 1);
    await new Promise<void>((resolve, reject) =>
      upstream.close((error) =>
        error === undefined ? resolve() : reject(error),
      ),
    );
  });

  it("rejects unauthenticated, private, and non-provider CONNECT requests before resolution", async () => {
    // Given
    let resolutionCount = 0;
    const proxy = await startCodexEgressProxy({
      resolveAddresses: () => {
        resolutionCount += 1;
        return Promise.resolve(["93.184.216.34"]);
      },
    });
    proxies.push(proxy);

    // When
    const statuses = await Promise.all([
      connectStatus(proxy, "chatgpt.com:443", false),
      connectStatus(proxy, "127.0.0.1:443"),
      connectStatus(proxy, "example.com:443"),
    ]);

    // Then
    expect(statuses).toEqual([407, 403, 403]);
    expect(resolutionCount).toBe(0);
  });

  it("rejects a provider hostname when DNS resolves to a private address", async () => {
    // Given
    let connectionCount = 0;
    const proxy = await startCodexEgressProxy({
      resolveAddresses: () => Promise.resolve(["169.254.169.254"]),
      connectUpstream: () => {
        connectionCount += 1;
        throw new TypeError("must not connect");
      },
    });
    proxies.push(proxy);

    // When
    const status = await connectStatus(proxy, "chatgpt.com:443");

    // Then
    expect(status).toBe(403);
    expect(connectionCount).toBe(0);
  });
});
