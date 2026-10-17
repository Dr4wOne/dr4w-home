# dr4w directives for dr4w-home

Which dr4w monorepo rules `dr4w-home` (public MIT smart-home hub kit: plugin SDK, adapters, LAN
hub server, React PWA, static demo Worker at `home.dr4w.io`) follows, adapts or drops.
Source: `Dr4wOne/dr4w` `main`, last checked 2026-10-16. Base URL below: `dr4w/` =
https://github.com/Dr4wOne/dr4w/blob/main/.

## 1. Rules that apply unchanged
- The repo is public: never commit secrets, tokens, `.env.local`, `.dev.vars`; secret scanning and push protection on. [security.md](https://github.com/Dr4wOne/dr4w/blob/main/docs/security.md)
- No deploy (`wrangler deploy`), merge to `main`, DNS or Cloudflare/GitHub settings change without an explicit "go". [CLAUDE.md](https://github.com/Dr4wOne/dr4w/blob/main/CLAUDE.md)
- Never touch the `dr4w.io` apex or `www`; only the `home` subdomain. [ADR 0016](https://github.com/Dr4wOne/dr4w/blob/main/docs/decisions/0016-subdomains-only.md)
- Never push to `main`; branches `feat/` `fix/` `docs/` `cleanup/`; squash-merge PRs; protected `main` with a required `check`. [conventions.md](https://github.com/Dr4wOne/dr4w/blob/main/docs/conventions.md)
- Commit subject imperative, at most 72 chars, optional scope; body explains why; Claude commits end with `Co-Authored-By`. [conventions.md](https://github.com/Dr4wOne/dr4w/blob/main/docs/conventions.md)
- TypeScript ESM everywhere, `.ts` extensions in imports, internal packages export source. [conventions.md](https://github.com/Dr4wOne/dr4w/blob/main/docs/conventions.md)
- Biome for lint and format: 2 spaces, 100 columns, single quotes, no semicolons, organize imports. [biome.json](https://github.com/Dr4wOne/dr4w/blob/main/biome.json), [ADR 0004](https://github.com/Dr4wOne/dr4w/blob/main/docs/decisions/0004-biome.md)
- Versions only in the pnpm `catalog:`; packages use `"catalog:"`. [conventions.md](https://github.com/Dr4wOne/dr4w/blob/main/docs/conventions.md)
- Env vars only through one `env.ts` parsed with zod. [conventions.md](https://github.com/Dr4wOne/dr4w/blob/main/docs/conventions.md)
- Validate all input with shared zod schemas (one schema for server, typed client and tests). [dos-and-donts.md](https://github.com/Dr4wOne/dr4w/blob/main/docs/dos-and-donts.md)
- Routes as Hono route files mounted explicitly in `app.ts`. [ADR 0006](https://github.com/Dr4wOne/dr4w/blob/main/docs/decisions/0006-explicit-route-mounting.md)
- Error bodies: 400 validation, 403 `forbidden`, 404 `not_found`, 500 `internal` (details only in logs). [conventions.md](https://github.com/Dr4wOne/dr4w/blob/main/docs/conventions.md)
- Logs: one JSON object per line `{level,msg,...}`; `LOG_LEVEL` default `info`, tests `warn`. [conventions.md](https://github.com/Dr4wOne/dr4w/blob/main/docs/conventions.md)
- Every route with logic has a Vitest test via `app.request`; components use `// @vitest-environment jsdom`. [conventions.md](https://github.com/Dr4wOne/dr4w/blob/main/docs/conventions.md)
- A Playwright smoke test runs against the live URL after each deploy. [conventions.md](https://github.com/Dr4wOne/dr4w/blob/main/docs/conventions.md)
- Third-party GitHub Actions pinned to commit SHAs; `permissions: contents: read` by default; Dependabot with a 3-day cooldown. [ci.yml](https://github.com/Dr4wOne/dr4w/blob/main/.github/workflows/ci.yml), [dependabot.yml](https://github.com/Dr4wOne/dr4w/blob/main/.github/dependabot.yml)
- CI installs with `pnpm install --frozen-lockfile`; Node from `.nvmrc`; `TURBO_TELEMETRY_DISABLED=1`, `WRANGLER_SEND_METRICS=false`. [setup action](https://github.com/Dr4wOne/dr4w/blob/main/.github/actions/setup/action.yml)
- Install scripts blocked except an explicit `allowBuilds` list (`esbuild`, `workerd`). [pnpm-workspace.yaml](https://github.com/Dr4wOne/dr4w/blob/main/pnpm-workspace.yaml)
- `wrangler deploy` only from CI, with the Cloudflare token as a GitHub `production` environment secret that deploys only from `main`. [security.md](https://github.com/Dr4wOne/dr4w/blob/main/docs/security.md), [ADR 0002](https://github.com/Dr4wOne/dr4w/blob/main/docs/decisions/0002-public-repo-production-environment.md)
- Secrets never in `wrangler.jsonc` `vars` or committed `.env*`. [secrets.md](https://github.com/Dr4wOne/dr4w/blob/main/docs/guides/secrets.md)
- Never cut (caveman/ponytail): input validation at trust boundaries, auth checks, least privilege, tests for logic, accessibility. [CLAUDE.md](https://github.com/Dr4wOne/dr4w/blob/main/CLAUDE.md)

## 2. Rules adapted for a standalone public kit
| Rule | Adaptation | Reason |
|---|---|---|
| pnpm + Turborepo monorepo, `apps/<p>/{api,web,infra}` | Own repo; workspace `packages/*` (sdk, adapters, contracts), `apps/hub`, `apps/pwa`, `apps/demo` | Not a dr4w project; no `infra/`, no `project.json` |
| One Hono Lambda per project | One Hono app on `@hono/node-server` on the LAN hub | Runs at home, not on AWS |
| Web calls only `/api/*` through its Worker; origin secret | PWA calls the hub on the LAN; hub needs its own auth (pairing token) and must reject unauthenticated control routes; demo Worker serves static assets only, no API proxy | No cloud API to protect; the origin-secret model does not exist here, so the hub's own auth replaces it (never cut) |
| Secrets in SSM or Worker secrets | Hub secrets and device credentials in a local file (mode 0600) or env, git-ignored; never in the demo build | No SSM; same "never in git, logs or client bundle" intent (as `tv` bridge) |
| CI `check` + `plan` must pass | CI `check` only (lint, typecheck, test, build) | No OpenTofu, so no `plan` |
| Squash-merge = deploy of changed projects | Merge to `main` deploys only the demo Worker (`wrangler deploy` + smoke); hub is released as packages/tags, not deployed | Hub runs on users' machines |
| Tests against dynamodb-local | Plugin/adapter tests with recorded device fixtures; no Docker | No DynamoDB |
| `pnpm new`, `pnpm changed`, `check:projects`, `infra:check` scripts | Keep `check`, `lint`, `format`, `typecheck`, `test`, `build`, `docs:check`, `dev` only | Those scripts serve the multi-project AWS platform |
| Docs size limits (`README` ≤ 150, `CLAUDE.md` ≤ 80 lines) | Keep, plus a user-facing quick start and plugin-author guide | Public kit has outside users |
| Workspace `ideas/` + `/idea → /spec → /plan → /poc → /launch` | Keep `/spec` and `/plan` style docs in `docs/`; drop `/endpoint`, `/resource`, `/launch` (they assume dr4w infra) | Commands are dr4w-platform-specific |
| License | MIT `LICENSE` file; dr4w itself states none | Required for an open-source kit |

## 3. Rules that do not apply
- AWS: `AWS_PROFILE=dr4w`, SSO, OIDC roles, `dr4w-boundary`, IAM least-privilege lists, naming `dr4w-<p>-<env>-*`, tags, SSM paths. Reason: no AWS account in use.
- OpenTofu: modules only, no raw `resource`, state keys, `tofu plan/apply`, `.opentofu-version`, providers. Reason: no infra as code beyond `wrangler.jsonc`.
- Lambda/API Gateway/DynamoDB/EventBridge/Aurora: one Lambda per project, reserved concurrency, `tables.json`, idempotent bus handlers, `project-ref`/`exposes`. Reason: no cloud backend; LAN hub instead. (Idempotency still matters for device events: apply it in the hub.)
- Cost guardrails (no NAT/VPC/dashboards, `$0 idle`, budgets). Reason: only a free-plan Worker with static assets.
- `@aws-sdk/*`, `@types/aws-lambda`, `esbuild` Lambda bundling, `dynamodb-local`, Postgres images. Reason: unused.

## 4. Versions to reuse (dr4w catalog, `docs/stack.md`, checked 2026-10-15)
Node 24 (`.nvmrc` `24`, `engines: ">=24 <25"`) · pnpm 12.11.2 (`packageManager`) · turbo 2.11.8 ·
typescript 7.0.2 · tsx 4.23.15 · @biomejs/biome 2.5.15 · vitest 5.0.4 · @playwright/test 1.64.1 ·
hono 4.13.13 · @hono/node-server 2.1.5 · @hono/zod-validator 0.9.1 · zod 4.6.7 ·
react / react-dom 19.3.0 · @types/react / @types/react-dom 19.3.0 · vite 8.3.4 ·
@vitejs/plugin-react 6.1.2 · @cloudflare/vite-plugin 1.64.0 · wrangler 4.151.0 ·
@cloudflare/workers-types 5.20261014.1 · @testing-library/react 16.3.3 · @testing-library/dom 10.4.2 ·
jsdom 30.1.2 · @types/node 24.19.2.
Actions (pin by SHA as in dr4w): actions/checkout v7.0.1 · actions/setup-node v7.1.0 · pnpm/action-setup v6.1.0.

Supply-chain policy:
- pnpm minimum release age (about 1 day, pnpm 12 default; dr4w sets no explicit value) rejects very new versions. Rule: never add `minimumReleaseAgeExclude`; pin an older version in the catalog instead. [CLAUDE.md](https://github.com/Dr4wOne/dr4w/blob/main/CLAUDE.md), [troubleshooting.md](https://github.com/Dr4wOne/dr4w/blob/main/docs/troubleshooting.md)
- Caution: dr4w `main`'s `pnpm-workspace.yaml` itself still lists excludes for wrangler 4.151.0, @cloudflare/vite-plugin 1.64.0, workers-types 5.20261014.1, miniflare 5.20261012.0-beta and Playwright 1.64.1. Those versions are now older than the window; `dr4w-home` must start without any exclude list.
- `allowBuilds` allow-list only (`esbuild`, `workerd`); Dependabot npm + github-actions weekly, cooldown 3 days, minor/patch grouped, `@types/node` majors ignored.
- Update `docs/stack.md` (with "last checked" date) whenever the catalog or a lock file changes.

## 5. Docs and agent-session rules to adopt
- The repo is the memory: decisions and state go into `docs/STATUS.md`, ADRs or the right doc, never only chat. [CLAUDE.md](https://github.com/Dr4wOne/dr4w/blob/main/CLAUDE.md)
- `docs/STATUS.md`: Last updated (date + short SHA), In progress, Next up, Known issues, Recent decisions (keep 10).
- ADRs in `docs/decisions/NNNN-<slug>.md`: Context · Decision · Consequences · Status, indexed in `docs/decisions/README.md`. First ADRs: standalone repo, no AWS, hub auth model, MIT. [decisions/README.md](https://github.com/Dr4wOne/dr4w/blob/main/docs/decisions/README.md)
- Docs style: direct, short, one home per fact, real examples with paths, dated where it rots, plain complete English; a user-visible change updates its doc and STATUS in the same PR. [conventions.md](https://github.com/Dr4wOne/dr4w/blob/main/docs/conventions.md) → Docs
- Commands to copy and trim: `/start` (5-line briefing), `/where`, `/doc-check` (map changed paths to docs), `/handoff` (update STATUS, ADRs, troubleshooting; commit `docs: session handoff`), plus `pnpm docs:check`. [.claude/commands](https://github.com/Dr4wOne/dr4w/tree/main/.claude/commands)
- Caveman + ponytail via committed `.claude/settings.json`, marketplaces pinned to tags caveman `v4.0.1`, ponytail `v5.2.0`, `PONYTAIL_DEFAULT_MODE=full`; caveman CLI never used (telemetry). [agent-tools.md](https://github.com/Dr4wOne/dr4w/blob/main/docs/agent-tools.md), [ADR 0017](https://github.com/Dr4wOne/dr4w/blob/main/docs/decisions/0017-caveman-and-ponytail-by-default.md)
- Caveman for chat only; docs, ADRs, PR descriptions and commit bodies in plain English; full sentences for security warnings, irreversible actions and deploy confirmations.
- Ponytail: `shortcut: <limit>, <when to upgrade>` comments allowed; `/ponytail-debt` before each release into STATUS Known issues; `/ponytail-review` before merging; `/ponytail-audit` monthly.

## Adaptation added during the build
| Rule | Adaptation | Reason |
|---|---|---|
| Caveman and ponytail enabled in the committed `.claude/settings.json` | Not committed here; the owner enables them in his git-ignored `.claude/settings.local.json` | They set the chat style of everyone who opens the repo in Claude Code; a public project should not impose one person's style on contributors |
| `gitleaks` through its GitHub Action | The `gitleaks` binary, pinned by version and SHA-256, in CI | The action needs a paid licence for organisation accounts |
