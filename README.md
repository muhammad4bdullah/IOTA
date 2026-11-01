# IOTA — free game distribution

IOTA is a game storefront hosted on Cloudflare Pages, with a Pages Functions API, D1 catalog/analytics database, password-protected publisher dashboard, and externally hosted game downloads. GitHub stores the source code; Cloudflare serves the app; an external file host stores the installer files. R2 is not used.

## Project status

IOTA is an independent project built by a small group of 2–3 people; it is not operated by a company and is not yet ready for public launch. Advertising is enabled through the Monetag network (see "Ads setup"). The catalog, legal pages, and ad consent are still being finalized.

## What is and is not ready

- The storefront reads published game listings from D1.
- The publisher dashboard runs on your computer at `http://127.0.0.1:8765/dashboard/`, with admin login, live catalog editing, external download-link management, and download-request counts. The dashboard files are excluded from the public site build.
- Upload game builds to your file host, then paste a stable HTTPS download URL into the dashboard. IOTA redirects players to that URL; it is not exposed in the public catalog API.
- Download totals count redirect requests. They cannot prove that a transfer completed.
- The site has no sample games. Add real game information and files through the dashboard after deployment.
- Player accounts and a checkout/payment system are intentionally omitted. Downloads are free.
- Ad loading is disabled until you are approved by an ad provider and add your public publisher ID to `js/ads-config.js`.

## Costs and limits

Cloudflare Pages and D1 have free allowances and limits that can change. Your file host's storage, retention, ads, and download terms also apply. Keep local backups and check its current terms before relying on it as the only copy.

An external file host may show its own ads or require a paid plan for direct download links. IOTA's own advertising is separate, not enabled by default, and does not guarantee revenue.

## Prerequisites

- Node.js 20 or newer and npm.
- A Cloudflare account with Pages, Pages Functions, and D1 available.
- A GitHub account if you want Cloudflare Pages to deploy automatically from your repository.
- Game builds that you have the legal right to publish.

## Deploy the public site

1. Install the project tools:

   ```powershell
   npm install
   ```

2. Authenticate Wrangler and create the Pages project and D1 database:

   ```powershell
   npx wrangler login
   npx wrangler pages project create iota-xyz --production-branch main
   npm run db:create
   ```

   Copy the D1 database ID printed by Wrangler into `database_id` in `wrangler.jsonc`.

3. Apply the database schema:

   ```powershell
   npm run db:migrate:remote
   ```

4. Set the two production secrets. Wrangler prompts for each value:

   ```powershell
   npx wrangler pages secret put ADMIN_PASSWORD --project-name iota-xyz
   npx wrangler pages secret put SESSION_SECRET --project-name iota-xyz
   ```

   Use a unique random administrator password and a separate random session secret (at least 32 characters). In PowerShell, generate each value with:

   ```powershell
   node -p "require('node:crypto').randomBytes(32).toString('base64url')"
   ```

   Save the administrator password securely. Do not send secrets in chat or store them in `wrangler.jsonc`.

5. Connect the GitHub repository to the `iota-xyz` Cloudflare Pages project. Configure its production branch and set:

   - Build command: `npm run build`
   - Build output directory: `dist`

   The build deliberately excludes `dashboard/`, scripts, tests, and server configuration from public assets. Keep the `functions/` directory at the repository root so Pages can deploy the API.

   If Cloudflare shows a separate **Deploy command** field, set it to `npm run deploy:pages`. Do not use the default `npx wrangler deploy`: that deploys a Worker, while this project is Cloudflare Pages. If the project was created as a Worker instead of a Pages project, create/connect it under **Workers & Pages → Create application → Pages → Connect to Git**.

   You can also deploy manually from PowerShell:

   ```powershell
   npm run deploy
   ```

6. To use your own domain, open the Pages project in Cloudflare and add it under **Custom domains**. Follow its DNS instructions. The domain registration/renewal is separate; if registered elsewhere, Cloudflare will show the required DNS or nameserver changes.

## Run the publisher dashboard locally

The dashboard UI is intentionally excluded from the deployed site. To make changes to the live catalog, start its loopback-only local server and point it at your deployed Pages URL:

```powershell
$env:IOTA_API_ORIGIN = "https://iota-xyz.pages.dev"
npm run admin:local
```

Open `http://127.0.0.1:8765/dashboard/`. Replace the example Pages address with your actual production URL or custom domain. The local dashboard securely proxies its API requests to that HTTPS origin; listing changes and download counts therefore affect the **live** D1 database immediately. The local server binds only to `127.0.0.1`, not your network. Stop it with `Ctrl+C` when finished.

Do not use the local Wrangler development server for production edits: it uses local test data. For local storefront/API development instead, use the separate local-development steps below.

## Local development

1. Copy `.dev.vars.example` to `.dev.vars`, then set local test secrets in `.dev.vars`. Do not commit `.dev.vars`.
2. Set `database_id` in `wrangler.jsonc` to your D1 database ID.
3. Initialize the local database and start the local Pages/Functions runtime:

   ```powershell
   npm run db:migrate:local
   npm run dev
   ```

4. Open the local URL Wrangler prints. The storefront and API use local development data; the deployed dashboard is not part of this server.

Run the unit checks with `npm test`.

## Add a game and link a hosted release

1. Sign in at `/dashboard/` with `ADMIN_PASSWORD`.
2. Add the game's accurate metadata and a cover image you have rights to use.
3. Confirm you have the rights needed to publish the game. Internal notes are optional.
4. Scan the installer/archive for malware and calculate its SHA-256 checksum if desired.
5. Upload the installer to your file host. Paste a stable HTTPS download URL into the local IOTA dashboard, then test it in a private browser window before publishing. Check the host's supported file types and terms.
6. Test the link in a private browser window before publishing. Choose whether to publish the listing.

IOTA does not store or scan the installer; keep a backup and verify its checksum independently.

## Ads setup

IOTA displays advertising through the Monetag network. Public pages load Monetag scripts (`nap5k.com`, `quge5.com`) and register a Monetag service worker via `sw.js`. Before going live, add a certified consent-management platform where required by law, complete the privacy/terms pages with accurate ad-provider details, and publish the provider's `ads.txt` record. Do not click your own ads, incentivize ad clicks, or promise earnings. If you switch providers later, update the scripts and the `sw.js` service worker accordingly.

## Security notes

- Admin sessions use an HttpOnly, Secure, SameSite cookie and expire after 12 hours. Failed admin logins are limited per hashed client address.
- Admin writes require a same-origin request and a signed session.
- The external download URL is only returned by the authenticated admin API; public downloads pass through an IOTA redirect endpoint.
- Admin and session secrets stay in Wrangler/Cloudflare secrets, never in the browser bundle.
- The initial admin is the single configured administrator. There is no public account registration or publisher self-signup.
- This starter does not include automated malware scanning, email, player accounts, user reviews, a certified consent-management platform, or a paid checkout.

## Legal / privacy launch checklist

Customize `privacy.html` and `terms.html`, publish a real support/privacy contact, review the rules for the countries and age groups you serve, and confirm publisher rights before launch. The included pages are outlines, not legal advice. Advertising-provider acceptance and revenue are not guaranteed.
