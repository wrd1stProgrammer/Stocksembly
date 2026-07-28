import { randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import {
  connect,
  createServer,
  isIP,
  type Server,
  type Socket,
} from "node:net";
import { CodexRunnerError } from "./codexErrors";

const PROVIDER_HOSTS = new Set(["chatgpt.com", "api.openai.com"]);
const MAX_HEADER_BYTES = 8 * 1_024;
const MAX_TUNNELS = 2;

type ProxyDependencies = {
  readonly resolveAddresses?: (hostname: string) => Promise<readonly string[]>;
  readonly connectUpstream?: (input: {
    readonly hostname: string;
    readonly address: string;
    readonly port: 443;
  }) => Socket;
};

export type CodexEgressProxy = {
  readonly port: number;
  readonly url: string;
  readonly close: () => Promise<void>;
};

function privateIpv4(address: string): boolean {
  const octets = address.split(".").map((octet) => Number(octet));
  const first = octets[0] ?? -1;
  const second = octets[1] ?? -1;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  );
}

function publicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return !privateIpv4(address);
  if (version !== 6) return false;
  const normalized = address.toLowerCase();
  return !(
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("::ffff:")
  );
}

function status(socket: Socket, code: 403 | 407 | 429 | 502): void {
  const label = {
    403: "Forbidden",
    407: "Proxy Authentication Required",
    429: "Too Many Requests",
    502: "Bad Gateway",
  }[code];
  socket.end(
    `HTTP/1.1 ${code} ${label}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  );
}

function parseConnect(
  header: string,
  expectedAuthorization: string,
):
  | { readonly kind: "accepted"; readonly hostname: string }
  | { readonly kind: "rejected"; readonly status: 403 | 407 } {
  const lines = header.split("\r\n");
  const request = lines[0]?.match(/^CONNECT ([^ ]+) HTTP\/1\.[01]$/);
  const authorization = lines.find((line) =>
    line.toLowerCase().startsWith("proxy-authorization:"),
  );
  const authorizationValue = authorization
    ?.slice(authorization.indexOf(":") + 1)
    .trim();
  if (authorizationValue !== `Basic ${expectedAuthorization}`)
    return { kind: "rejected", status: 407 };
  const authority = request?.[1];
  if (
    authority === undefined ||
    authority.includes("@") ||
    !authority.endsWith(":443")
  )
    return { kind: "rejected", status: 403 };
  const hostname = authority.slice(0, -4).toLowerCase().replace(/\.$/, "");
  return PROVIDER_HOSTS.has(hostname)
    ? { kind: "accepted", hostname }
    : { kind: "rejected", status: 403 };
}

async function defaultResolve(hostname: string): Promise<readonly string[]> {
  return (await lookup(hostname, { all: true, verbatim: true })).map(
    (entry) => entry.address,
  );
}

function defaultConnect(input: {
  readonly address: string;
  readonly port: 443;
}): Socket {
  return connect({ host: input.address, port: input.port });
}

export async function startCodexEgressProxy(
  dependencies: ProxyDependencies = {},
): Promise<CodexEgressProxy> {
  const username = randomBytes(18).toString("base64url");
  const password = randomBytes(24).toString("base64url");
  const expectedAuthorization = Buffer.from(`${username}:${password}`).toString(
    "base64",
  );
  const resolveAddresses = dependencies.resolveAddresses ?? defaultResolve;
  const connectUpstream = dependencies.connectUpstream ?? defaultConnect;
  const sockets = new Set<Socket>();
  let activeTunnels = 0;

  const server: Server = createServer((client) => {
    sockets.add(client);
    client.once("close", () => sockets.delete(client));
    client.once("error", () => {
      sockets.delete(client);
      client.destroy();
    });
    let buffered = Buffer.alloc(0);
    client.on("data", (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk]);
      if (buffered.byteLength > MAX_HEADER_BYTES) {
        status(client, 403);
        return;
      }
      const headerEnd = buffered.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      client.removeAllListeners("data");
      const connectHeader = buffered.subarray(0, headerEnd).toString("utf8");
      const parsed = parseConnect(connectHeader, expectedAuthorization);
      if (parsed.kind === "rejected") {
        status(client, parsed.status);
        return;
      }
      if (activeTunnels >= MAX_TUNNELS) {
        status(client, 429);
        return;
      }
      void (async () => {
        try {
          const addresses = await resolveAddresses(parsed.hostname);
          if (
            addresses.length === 0 ||
            addresses.some((ip) => !publicAddress(ip))
          ) {
            status(client, 403);
            return;
          }
          const upstream = connectUpstream({
            hostname: parsed.hostname,
            address: addresses[0] ?? "",
            port: 443,
          });
          sockets.add(upstream);
          activeTunnels += 1;
          let released = false;
          const release = () => {
            if (released) return;
            released = true;
            activeTunnels -= 1;
            sockets.delete(upstream);
          };
          upstream.once("close", release);
          upstream.once("error", () => {
            release();
            status(client, 502);
          });
          upstream.once("connect", () => {
            client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
            const remainder = buffered.subarray(headerEnd + 4);
            if (remainder.byteLength > 0) upstream.write(remainder);
            client.pipe(upstream);
            upstream.pipe(client);
          });
        } catch (error) {
          if (error instanceof Error) {
            status(client, 502);
            return;
          }
          throw error;
        }
      })();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new CodexRunnerError("process_failed");
  }
  return Object.freeze({
    port: address.port,
    url: `http://${username}:${password}@127.0.0.1:${address.port}`,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) resolve();
          else reject(error);
        });
      });
    },
  });
}
