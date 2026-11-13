# Opportunity OS — Noetfield Connect

A premium, production-ready **relationship-to-execution** workspace that uses the existing Noetfield Platform **canonical PostgreSQL intake** and Company OS intake routing, not a parallel CRM.

## Architecture

- Public: premium opportunity intake through this app, persisted by `https://platform.noetfield.com/api/intake` as `nfConnectWizard` source records. The existing canonical URL is `https://www.noetfield.com/connect/`.
- Founder: authenticated workspace backed by Platform `/api/opportunities/desk/page`, source-backed relationship graphs, revisioned stages, notes, reciprocal match suggestions, opt-in invitation creation and response on the existing canonical Noetfield participant page.
- Runtime: Node.js 22 built-in HTTP server, no client-side secrets or third-party UI tracking, no additional database, no AI-agent authority duplication. Existing Company OS continues consuming Platform intake via its configured sync path.

## Local run

```sh
npm test
npm start
```

Open `http://localhost:8080`. `PLATFORM_API_BASE` (default `https://platform.noetfield.com`) is the canonical upstream. `COMPANY_OS_BASE` defaults to the existing Business OS Core for read-only health checks. Operator unlock uses the existing Platform administrator credential **entered by the operator per browser session**; it is held only in memory, forwarded over HTTPS to the canonical Platform and never written to storage. The app itself does **not** store an administrator secret.

## Source boundaries

An opportunity submission is not acceptance. Proposed match is not consent or employment. Prepared invitation is not sent. A token-holder response is not mailbox identity verification. No relationship prediction is a confirmed introduction; no proposal is signed; no pipeline amount is collected revenue without an independent payment receipt. TrustField, BuildRelay and other independent ventures never receive silent exports or automatic assignment.

## Routes

- `/` workspace, `/apply` public intake, `/health` deterministic process health
- `/api/system` read-only connectivity checks
- `/api/intake` public, validated proxy to canonical intake
- `/api/operator/cases`, `/api/operator/cases/:id/relationship`
- `PATCH /api/operator/cases/:id`
- `POST /api/operator/cases/:id/activity`, `POST /api/operator/cases/:id/invitations`
- `/api/operator/matches` deterministic evidence-backed candidate suggestions, never a cross-venture transfer

## Deployment

GitHub source: `Noetfield-Systems/Opportunity-OS`. Railway should deploy the existing source via Dockerfile on port `$PORT`. `npm test` runs an isolated fake upstream and makes no changes to actual contacts, bookings or payouts.

## Existing Business OS specialist task dispatch

Within a canonical case drawer, an authenticated Founder may choose a real Business OS specialist, enter the existing Company OS Founder token for that one request, and submit a strictly scoped internal mission. This is not a simulated LLM handoff: the Opportunity OS gateway calls the live Company OS `POST /api/control/tasks` endpoint, links the original intake ID and idempotency marker, and reads the task back from `GET /api/control/tasks`. On a readback-verified creation, the UI records a `workpacket_proposed` event in the original Platform opportunity timeline. A queued task is not completed work, customer contact, booking, acceptance, or collected money.

Only `noetfield`, `buildworkflow` and `signalforge` task scopes may dispatch through this Noetfield Company OS bridge. BuildRelay and TrustField cannot be silently routed into this execution service. No personal email or private original message body is copied into Company OS task objectives. The Company OS Founder token is not embedded in the app, Railway environment, repository, or browser storage: it is entered for each request, forwarded over HTTPS, and immediately cleared from the input.

The Company OS tasks readback endpoint lists recent tasks. Duplicate detection uses a bounded list with an in-flight guard, not a transactional outbox. On ambiguous post-create networking failures, inspect the Company OS queue before retrying. Never infer a completed work result from a task creation receipt.
