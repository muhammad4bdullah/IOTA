# IOTA — free game distribution

IOTA is a game storefront hosted on Cloudflare Pages, with a Pages Functions API, D1 catalog/analytics database, password-protected publisher dashboard, and Fileditch-hosted game downloads. GitHub stores the source code; Cloudflare serves the app; Fileditch stores the installer files. R2 is not used.

## What is and is not ready

- The storefront reads published game listings from D1.
- The publisher dashboard runs on your computer at `http://127.0.0.1:8765/dashboard/`, with admin login, live catalog editing, Fileditch-link management, and download-request counts. The dashboard files are excluded from the public site build.
- Upload authorized game builds to Fileditch yourself, then paste the stable Fileditch file-page URL into the dashboard. IOTA redirects players to that page; the Fileditch URL is not exposed in the public catalog API.
- Download totals count redirects to Fileditch. They cannot prove that a transfer completed.
- The site has no sample games. Add real information and authorized builds through the dashboard after deployment.
- Player accounts and a checkout/payment system are intentionally omitted. Downloads are free.
- Ad loading is disabled until you are approved by an ad provider and add your public publisher ID to `js/ads-config.js`.

## Costs and limits

Cloudflare Pages and D1 have free allowances and limits that can change. Fileditch's own plans, retention, ads, and download behavior also apply. Its FAQ currently says files with no access for 45 days may become eligible for deletion when storage needs reclaiming. Keep local backups and check Fileditch's current terms before relying on it as the only copy.

Fileditch says its regular file pages may show Fileditch ads, and direct hotlinking requires its paid Hotlink plan. With a regular Fileditch file-page URL, players follow the link to Fileditch and start the download there. IOTA's own advertising is separate, not enabled by default, and does not guarantee revenue.

## Prerequisites

- Node.js 20 or newer and npm.
- A Cloudflare account with Pages, Pages Functions, and D1 available.
- A GitHub account if you want Cloudflare Pages to deploy automatically from your repository.
- Game builds that you own or have explicit permission to distribute.

## Deploy the public site

1. Install the project tools:

   ```powershell
   npm install
   ```

2. Authenticate Wrangler and create the Pages project and D1 database:

   ```powershell
   npx wrangler login
   npx wrangler pages project create iota-games --production-branch main
   npm run db:create
   ```

   Copy the D1 database ID printed by Wrangler into `database_id` in `wrangler.jsonc`.

3. Apply the database schema:

   ```powershell
   npm run db:migrate:remote
   ```

4. Set the two production secrets. Wrangler prompts for each value:

   ```powershell
   npx wrangler pages secret put ADMIN_PASSWORD --project-name iota-games
   npx wrangler pages secret put SESSION_SECRET --project-name iota-games
   ```

   Use a unique random administrator password and a separate random session secret (at least 32 characters). In PowerShell, generate each value with:

   ```powershell
   node -p "require('node:crypto').randomBytes(32).toString('base64url')"
   ```

   Save the administrator password securely. Do not send secrets in chat or store them in `wrangler.jsonc`.

5. Connect the GitHub repository to the `iota-games` Cloudflare Pages project. Configure its production branch and set:

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
$env:IOTA_API_ORIGIN = "https://iota-games.pages.dev"
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

## Add a game and link a Fileditch release

1. Sign in at `/dashboard/` with `ADMIN_PASSWORD`.
2. Add the game's accurate metadata and a cover image you have rights to use.
3. Confirm ownership or explicit distribution permission and enter a note identifying that authorization.
4. Scan the installer/archive for malware and calculate its SHA-256 checksum if desired.
5. Upload the installer to Fileditch. Copy its stable share/file URL—not a temporary signed download URL—and paste it into the local IOTA dashboard. Without Fileditch Hotlink, make sure the URL takes players to the Fileditch page needed to start a download. Fileditch currently blocks some executable types (including `.exe` and `.apk`); check its rules before choosing your release archive.
6. Test the link in a private browser window before publishing. Choose whether to publish the listing.

Never upload third-party commercial games without the publisher's written permission. IOTA does not store or scan the installer; keep a backup and verify its checksum independently. Fileditch currently says files untouched for 45+ days can become eligible for deletion when it needs space.

## Ads setup

Ads are off by default. First publish original catalog pages, replace the privacy/terms starter outlines with accurate operator and data-use details, and get approval from an ad network. For AdSense, update `window.IOTA_AD_CLIENT` in `js/ads-config.js` to your approved `ca-pub-...` ID and enable the desired ad format in your provider account. Publish the exact `ads.txt` record supplied by the provider. Add a certified consent-management platform before serving ads to visitors in regions where it is required. Do not click your own ads, incentivize ad clicks, or promise earnings.

## Security notes

- Admin sessions use an HttpOnly, Secure, SameSite cookie and expire after 12 hours. Failed admin logins are limited per hashed client address.
- Admin writes require a same-origin request and a signed session.
- The Fileditch URL is only returned by the authenticated admin API; public downloads pass through an IOTA redirect endpoint.
- Admin and session secrets stay in Wrangler/Cloudflare secrets, never in the browser bundle.
- The initial admin is the single configured administrator. There is no public account registration or publisher self-signup.
- This starter does not include automated malware scanning, email, player accounts, user reviews, a certified consent-management platform, or a paid checkout.

## Legal / privacy launch checklist

Customize `privacy.html` and `terms.html`, publish a real support/privacy contact, review the rules for the countries and age groups you serve, and confirm publisher rights before launch. The included pages are outlines, not legal advice. Advertising-provider acceptance and revenue are not guaranteed.
