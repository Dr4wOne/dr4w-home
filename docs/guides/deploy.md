# Deploying the showcase

The showcase (`apps/showcase`) is the kit in demo mode: static files on a Cloudflare Worker with
static assets, no Worker script, no backend and no secrets in the page. It never talks to a hub.

**Owner's repository:** every push to `main` runs `.github/workflows/deploy-showcase.yml`, which builds
the showcase and runs `wrangler deploy` to `home.dr4w.io`. It uses the `production` environment with
two secrets: `CLOUDFLARE_API_TOKEN` (scoped to Workers Scripts edit and the `dr4w.io` zone's Workers
Routes) and `CLOUDFLARE_ACCOUNT_ID`.

**Your fork:** the job is skipped. To host your own showcase, change `name` and `routes` in
`apps/showcase/wrangler.jsonc` to your own Worker name and domain, then either run
`pnpm --filter @dr4w-home/showcase build && pnpm --filter @dr4w-home/showcase exec wrangler deploy`
or change the repository check in the workflow and add the two secrets.

**Rollback:** `pnpm --filter @dr4w-home/showcase exec wrangler rollback` returns the previous version.

Your hub is never deployed anywhere: it runs on your own machine (see [remote-access.md](../remote-access.md)).
