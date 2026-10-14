# Tribes Builder launch checklist

These tasks move the app to **tribes.build** and finish the rename. Each one needs an account, a dashboard or a person, so the code can't do it. Work through them in order; tick each one off when it's done.

## 1. Domain and hosting

- [ ] **DNS for tribes.build.** Add the domain to the Vercel project, then create the records Vercel shows for it (usually an A record for the apex and a CNAME for `www`). Make `www.tribes.build` redirect to `tribes.build`.
- [ ] **Production domain.** Make `tribes.build` the project's production domain. Keep `builder-stellar-web.vercel.app` assigned to production deployments too. Testnet tribes created before the rename load their token art and images from it (see [DAO deployment](DAO_DEPLOYMENT.md#web-origin-tribesbuild-and-the-old-host)).
- [ ] **Environment variables** in Vercel production, then redeploy:
  - `NEXT_PUBLIC_SITE_URL=https://tribes.build` (absolute metadata, share images, new draft defaults)
  - `APP_URL=https://tribes.build` (wallet sign-in origin)
  - `STELLAR_HOME_DOMAIN=tribes.build` and `STELLAR_WEB_AUTH_DOMAIN=tribes.build` (SEP-10 domain binding)
  - `AUTH_APP_NAME=Tribes Builder` (the name in the wallet sign-in prompt; this is also the default)
- [ ] **WalletConnect.** Add `tribes.build` to the allowed domains of the WalletConnect Cloud project, or mobile wallets will refuse to connect.
- [ ] **Before anyone creates a tribe from the app**, check that tribes.build serves it. New drafts point their image and token art at `https://tribes.build`. Preview deployments that create test tribes should set `NEXT_PUBLIC_SITE_URL` to their own origin.

## 2. Confirm the redirects

The old production host's page routes redirect permanently to tribes.build. Its `/api`, `/images`, `/assets`, `/samples` and `/_next` paths keep serving, because on-chain token URIs point at them. `apps/web/next.config.mjs` does this, matching the exact host only, so preview `*.vercel.app` deployments are not redirected. A redirect set on the domain in Vercel's dashboard would also move `/api` and `/images` and break existing token art, so keep it in the app.

- [ ] `curl -sI https://builder-stellar-web.vercel.app/discover` returns `308` with `location: https://tribes.build/discover`.
- [ ] `curl -sI https://builder-stellar-web.vercel.app/images/dao-logo.png` returns `200`.
- [ ] A token URI from an existing testnet tribe (from its token page or `token_uri`) still returns JSON and its image still renders.
- [ ] Once every pre-rename testnet tribe is redeployed or has a new renderer and image by vote, the old host can stop serving.

## 3. Name and brand

- [ ] **Social handles.** Claim matching handles (X, Farcaster, Discord, GitHub) before the announcement.
- [ ] **SCF update.** Note the rename in the next Stellar Community Fund update. The award stays under "Nouns Builder: DAOs on Stellar".
- [ ] **Trademark search** for "Tribes Builder" before the public launch. Tribes Inc. (tribes.xyz), Tribe DAO and Tribe.run already exist. Always use the full name in titles and search metadata.
- [ ] **License file.** The README and the home page's "Under the hood" strip say the contracts are MIT, but the repository has no `LICENSE` file, so GitHub shows no license. Add one (with the right copyright holder) before the launch.
- [ ] **Legal pages.** Review terms, privacy and the disclaimer with whoever owns them. They still name Builder and communities, on purpose, until that review.

## 4. Share cards

- [ ] From the real domain, paste these links into WhatsApp, X and Discord and check that the right card shows: the home page, a tribe, a proposal that's open for voting, a live auction, a token, and a member.
- [ ] Paste a link to a tribe that doesn't exist and check that the brand card shows.
- [ ] WhatsApp skips large previews. The cards stay under about 300 KB; check one with `curl -s https://tribes.build/opengraph-image | wc -c`.
