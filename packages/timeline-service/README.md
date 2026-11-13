# Timeline HTTP API

The public site reuses the Vencord calendar, styles, and layout. SQLite stores events in a Docker volume. The Chrome extension writes independently of its Discord UI. Grok setup is in [GROK-AUTOMATION.md](../../GROK-AUTOMATION.md).

## Deploy

Create a private `.env` from `.env.example` with two independently generated random secrets (at least 32 characters each). Run `docker compose up -d --build --wait`. The service listens on 8080 in Docker's existing `npm` network. Forward the HTTPS host to `server-events-timeline:8080` and keep access logging disabled on the exact write endpoint. If a WAF handles the host, suppress audit logging for the write endpoint to keep authorization headers out of logs. Back up the named volume using SQLite's backup command or a coordinated volume snapshot.

## HTTP

| GET | Result |
| --- | --- |
| `/` | Shared timeline |
| `/e/<id>` | Timeline focused on an event |
| `/api/e/<id>` | One event as JSON |
| `/timeline/feed` | All events as JSON |
| `/timeline/latest?limit=25` | Recently modified events, up to 100 |
| `/healthz` | Server and database health |
| `/timeline?action=upsert&id=…` | Authenticated write with JSON result |

Send the key in `Authorization: Bearer …` on GET writes. The server rejects `token` in the query string. Store credentials in the private HTTP client settings. The Discord key may only upsert or cancel Discord IDs.

| Action | Fields |
| --- | --- |
| `add` | `id`, `title`, `start`; existing ID gives 409 |
| `upsert` (default) | `id`; new entries require `title`, `start` |
| `update` | Existing `id` plus fields to change |
| `cancel` | Existing `id`; Discord series can use the base ID and `series=1` |
| `delete` | Existing `id` |
| `touch` | Existing `id`; update timestamp |

Optional fields are `end`, `location`, `url`, `tags`, `desc`, `source`, `group`, `priority`, and `status`. Omit fields to preserve them. A blank `end=` clears the end. Use ISO 8601 with an explicit time zone or Unix seconds/milliseconds. The feed includes UTC, original, and MSK values. Tags are comma-separated and normalized. Titles and descriptions are limited to 200 and 1000 Unicode characters. Priority is `low`, `normal`, `high`, or `rare`. Status is `scheduled`, `active`, or `cancelled`.

SQLite enforces one row per ID and one row per normalized source link plus UTC start. An identical upsert returns `unchanged`. A compatible upsert with the same link and start can return an existing ID. For a reschedule, use the ID returned by the API. Add `dry_run=1` to validate and preview the outcome without writing. Successful writes return `ok`, `action`, `status`, `id`, and the public `url` when applicable. Errors have `ok: false` and an `error` code.
