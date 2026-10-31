import {
  addressHash,
  clearSessionCookie,
  createSession,
  fail,
  isAdmin,
  json,
  mapGame,
  normalizeGame,
  readJson,
  safeId
} from "../_lib/api.js";

function gameIdFrom(path) {
  const match = path.match(/^\/api\/admin\/games\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}

async function requireAdmin(request, env) {
  return isAdmin(request, env);
}

function assertSameOrigin(request) {
  if (request.method === "GET" || request.method === "HEAD") return;
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin) throw new Error("Cross-origin requests are not allowed.");
}

async function adminGameList(env) {
  const result = await env.DB.prepare(`
    SELECT games.*,
      (SELECT COUNT(*) FROM download_events WHERE game_id = games.id) AS download_count
    FROM games ORDER BY updated_at DESC
  `).all();
  return (result.results || []).map(row => mapGame(row, true));
}

async function saveGame(env, game) {
  await env.DB.prepare(`
    INSERT INTO games (
      id, slug, title, developer, description, genres, platforms, version,
      release_date, cover_image, file_url, price, published, rights_text, rights_confirmed, sha256, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      developer = excluded.developer,
      description = excluded.description,
      genres = excluded.genres,
      platforms = excluded.platforms,
      version = excluded.version,
      release_date = excluded.release_date,
      cover_image = excluded.cover_image,
      file_url = excluded.file_url,
      published = excluded.published,
      rights_text = excluded.rights_text,
      rights_confirmed = excluded.rights_confirmed,
      sha256 = excluded.sha256,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    game.id, game.id, game.title, game.developer, game.description,
    JSON.stringify(game.genre), JSON.stringify(game.platforms), game.version,
    game.releaseDate, game.coverImage, game.fileUrl, Number(game.published), game.license,
    Number(game.rightsConfirmed), game.sha256
  ).run();
}

async function handleDownload(env, gameId) {
  if (!safeId(gameId)) return fail("Game not found.", 404);
  const game = await env.DB.prepare(`
    SELECT id, file_url, rights_confirmed
    FROM games WHERE id = ? AND published = 1
  `).bind(gameId).first();
  if (!game?.file_url || !game.rights_confirmed) return fail("This game has no download available.", 404);

  await env.DB.prepare("INSERT INTO download_events (game_id) VALUES (?)").bind(gameId).run();
  return new Response(null, {
    status: 302,
    headers: {
      location: game.file_url,
      "cache-control": "no-store",
      "referrer-policy": "no-referrer"
    }
  });
}

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (method === "GET" && path === "/api/games") {
    const result = await env.DB.prepare(`
      SELECT games.*,
        (SELECT COUNT(*) FROM download_events WHERE game_id = games.id) AS download_count
      FROM games WHERE published = 1 ORDER BY updated_at DESC
    `).all();
    return json({ games: (result.results || []).map(mapGame) });
  }

  const downloadMatch = path.match(/^\/api\/games\/([^/]+)\/download$/);
  if (method === "GET" && downloadMatch) return handleDownload(env, decodeURIComponent(downloadMatch[1]));

  if (path === "/api/admin/login" && method === "POST") {
    assertSameOrigin(request);
    if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
      return fail("Admin secrets are not configured. Follow the deployment guide.", 503);
    }
    const address = await addressHash(request, env.SESSION_SECRET);
    const attempts = await env.DB.prepare(`
      SELECT COUNT(*) AS count FROM admin_login_attempts
      WHERE address_hash = ? AND attempted_at > datetime('now', '-15 minutes')
    `).bind(address).first();
    if (Number(attempts?.count || 0) >= 10) return fail("Too many login attempts. Try again in 15 minutes.", 429);

    const body = await readJson(request, 4_000);
    const password = typeof body.password === "string" ? body.password : "";
    const given = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
    const expected = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.ADMIN_PASSWORD));
    let difference = 0;
    const givenBytes = new Uint8Array(given);
    const expectedBytes = new Uint8Array(expected);
    for (let index = 0; index < expectedBytes.length; index += 1) difference |= givenBytes[index] ^ expectedBytes[index];
    if (difference !== 0) {
      await env.DB.prepare("INSERT INTO admin_login_attempts (address_hash) VALUES (?)").bind(address).run();
      await env.DB.prepare("DELETE FROM admin_login_attempts WHERE attempted_at < datetime('now', '-1 day')").run();
      return fail("Password is incorrect.", 401);
    }

    await env.DB.prepare("DELETE FROM admin_login_attempts WHERE address_hash = ?").bind(address).run();
    return json({ authenticated: true }, 200, { "set-cookie": await createSession(env) });
  }

  if (path === "/api/admin/logout" && method === "POST") {
    assertSameOrigin(request);
    return json({ authenticated: false }, 200, { "set-cookie": clearSessionCookie() });
  }

  if (path === "/api/admin/session" && method === "GET") {
    return json({ authenticated: await isAdmin(request, env) });
  }

  if (path.startsWith("/api/admin/")) {
    if (!(await requireAdmin(request, env))) return fail("Sign in as the site administrator to continue.", 401);
    assertSameOrigin(request);

    if (path === "/api/admin/games" && method === "GET") {
      const games = await adminGameList(env);
      return json({
        games,
        totalDownloads: games.reduce((sum, game) => sum + game.downloadCount, 0)
      });
    }

    if (path === "/api/admin/games" && method === "POST") {
      const game = normalizeGame(await readJson(request));
      await saveGame(env, game);
      return json({ game: mapGame(await env.DB.prepare(`
        SELECT games.*, 0 AS download_count FROM games WHERE id = ?
      `).bind(game.id).first(), true) }, 201);
    }

    const id = gameIdFrom(path);
    if (id && method === "DELETE") {
      if (!safeId(id)) return fail("Game not found.", 404);
      const game = await env.DB.prepare("SELECT id FROM games WHERE id = ?").bind(id).first();
      if (!game) return fail("Game not found.", 404);
      await env.DB.prepare("DELETE FROM games WHERE id = ?").bind(id).run();
      return json({ success: true });
    }
  }

  return fail("Not found.", 404);
}

export async function onRequest({ request, env }) {
  try {
    return await route(request, env);
  } catch (error) {
    console.error("IOTA API request failed:", error);
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    if (message.includes("Request body") || message.includes("Game ") ||
        message.includes("Title,") || message.includes("Add at least") ||
        message.includes("Version or") || message.includes("Publication") ||
        message.includes("Internal notes") || message.includes("Cover image") ||
        message.includes("SHA-256") || message.includes("free games") ||
        message.includes("Download URL") || message.includes("configured download host") ||
        message.includes("Cross-origin")) {
      return fail(message, 400);
    }
    return fail("The server could not complete the request. Check the deployment logs.", 500);
  }
}
