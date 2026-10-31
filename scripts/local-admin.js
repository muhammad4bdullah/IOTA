import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const host = "127.0.0.1";
const port = Number(process.env.IOTA_ADMIN_PORT || 8765);
const apiOriginValue = process.env.IOTA_API_ORIGIN;

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("IOTA_ADMIN_PORT must be a valid TCP port.");
}
if (!apiOriginValue) {
  throw new Error("Set IOTA_API_ORIGIN to your deployed HTTPS Pages URL before starting the local dashboard.");
}

const apiOrigin = new URL(apiOriginValue);
if (apiOrigin.protocol !== "https:" || apiOrigin.username || apiOrigin.password ||
    apiOrigin.pathname !== "/" || apiOrigin.search || apiOrigin.hash) {
  throw new Error("IOTA_API_ORIGIN must be an HTTPS origin without a path, query, or credentials.");
}

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"]
]);
const privateDirectories = new Set([
  ".git",
  ".wrangler",
  "functions",
  "migrations",
  "node_modules",
  "scripts",
  "tests"
]);

function sendJson(response, status, message) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify({ error: message }));
}

async function serveStatic(request, response, pathname) {
  const requestedPath = pathname === "/dashboard" ? "/dashboard/" : pathname;
  const decodedPath = decodeURIComponent(requestedPath === "/" ? "/index.html" : requestedPath);
  const relativePath = decodedPath.replace(/^[/\\]+/, "");
  const segments = relativePath.split(/[\\/]+/).filter(Boolean);
  if (segments.some(segment => segment === "." || segment === ".." ||
      segment.startsWith(".") || privateDirectories.has(segment))) {
    sendJson(response, 404, "Not found.");
    return;
  }

  let filePath = path.resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    sendJson(response, 404, "Not found.");
    return;
  }
  if (decodedPath.endsWith("/")) filePath = path.join(filePath, "index.html");

  try {
    const resolvedPath = await realpath(filePath);
    if (resolvedPath !== root && !resolvedPath.startsWith(`${root}${path.sep}`)) {
      sendJson(response, 404, "Not found.");
      return;
    }
    const fileInfo = await stat(resolvedPath);
    const contentType = contentTypes.get(path.extname(resolvedPath).toLowerCase());
    if (!fileInfo.isFile() || !contentType ||
        (segments[0] === "dashboard" && segments.some(segment => segment !== "dashboard" &&
          !["index.html", "dashboard.css", "panel.css"].includes(segment)))) {
      sendJson(response, 404, "Not found.");
      return;
    }
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-length": fileInfo.size,
      "content-type": contentType,
      "x-content-type-options": "nosniff"
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(resolvedPath).pipe(response);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      sendJson(response, 404, "Not found.");
      return;
    }
    throw error;
  }
}

async function readRequestBody(request, maximumBytes) {
  const contentLength = Number(request.headers["content-length"] || 0);
  if (contentLength > maximumBytes) throw new Error("Request body is too large.");

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > maximumBytes) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function proxyApi(request, response, url) {
  const headers = {
    accept: request.headers.accept || "application/json",
    origin: apiOrigin.origin
  };
  if (request.headers.cookie) headers.cookie = request.headers.cookie;
  if (request.headers["content-type"]) headers["content-type"] = request.headers["content-type"];

  const options = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") {
    options.body = await readRequestBody(request, 32_000);
  }

  const upstream = await fetch(new URL(`${url.pathname}${url.search}`, apiOrigin), options);
  const responseHeaders = {
    "cache-control": upstream.headers.get("cache-control") || "no-store"
  };
  for (const headerName of ["content-type", "location", "referrer-policy"]) {
    const value = upstream.headers.get(headerName);
    if (value) responseHeaders[headerName] = value;
  }
  const setCookies = upstream.headers.getSetCookie();
  if (setCookies.length) responseHeaders["set-cookie"] = setCookies;

  response.writeHead(upstream.status, responseHeaders);
  if (request.method === "HEAD" || upstream.status === 204 || upstream.status === 304) {
    response.end();
  } else {
    response.end(Buffer.from(await upstream.arrayBuffer()));
  }
}

const server = createServer(async (request, response) => {
  if (request.headers.host !== `${host}:${port}`) {
    sendJson(response, 403, "Use the local dashboard address printed at startup.");
    return;
  }
  if (!["GET", "HEAD", "POST", "DELETE"].includes(request.method)) {
    sendJson(response, 405, "Method not allowed.");
    return;
  }

  let url;
  try {
    url = new URL(request.url, `http://${host}:${port}`);
    if (url.pathname.startsWith("/api/")) {
      await proxyApi(request, response, url);
    } else {
      await serveStatic(request, response, url.pathname);
    }
  } catch (error) {
    console.error("Local IOTA dashboard request failed:", error);
    if (!response.headersSent) sendJson(response, error.message === "Request body is too large." ? 413 : 502, error.message);
    else response.destroy(error);
  }
});

server.listen(port, host, () => {
  console.log(`Local-only dashboard: http://${host}:${port}/dashboard/`);
  console.log(`Catalog/API target: ${apiOrigin.origin}`);
});
