# Matchday

A self-hosted Premier League site: live scores, fixtures and results, lineups drawn on a pitch, match timelines and stats, club pages, the league table, player profiles and headlines. It also follows Premier League clubs into the FA Cup, League Cup and European competitions, with the Champions League, Europa League and Conference League tables.

**Live:** [football.deanburgoyne.dev](https://football.deanburgoyne.dev)

<!-- Screenshots: add a few to docs/screenshots/ and show them here, e.g.
![Matches page](docs/screenshots/matches.png)
![Match page: lineups](docs/screenshots/lineups.png)
-->

## Stack

| Layer | Tech |
|---|---|
| Back end | .NET 10, ASP.NET Core minimal APIs, a `BackgroundService` worker |
| Data | PostgreSQL 17 via EF Core (Npgsql), migrations applied at startup |
| Front end | React 19 + TypeScript, Vite, React Router, plain CSS (light / dark themes) |
| Hosting | One Docker image on a home server, published through a Cloudflare Tunnel (no open ports) |
| Data source | ESPN's public (unofficial, undocumented) JSON feed |

## How it works

```
Browser ──HTTPS──> Cloudflare ──tunnel──> matchday container (.NET 10)
                                            ├─ Read API   /api/...
                                            ├─ React app  (static files)
                                            └─ SyncWorker ──> ESPN feed
                                                   │
                                            PostgreSQL 17
```

The browser never talks to ESPN. A background worker pulls from the feed into Postgres, and a small read-only API serves pages from the database. Pages stay fast, ESPN sees a predictable trickle of requests, and the site keeps working when the feed hiccups.

The worker wakes every 30 seconds and decides what is due, so its polling follows the matches:

- **Live matches** are refreshed every minute; **lineups** are checked in the 75 minutes before kickoff.
- **Fixtures** for the next three weeks every 3 hours, plus a resumable fill of the whole season in both directions.
- **Each club's schedule** in a rolling sweep, which is how cup and European matches come in.
- **Standings** every 6 hours and straight after any full-time whistle; **squads** daily; **news** every 30 minutes.

Progress markers are kept in the database, so restarts and deploys resume where they left off instead of re-scanning the season.

## Design decisions

- **The provider is swappable.** Everything outside `Matchday.Providers.Espn` codes against `IFootballProvider` and plain Core records. A new data source is one new project and one DI line.
- **The mappers are pure.** `EspnMapper` takes a `JsonElement` and returns records, with no I/O, so the tests run against saved ESPN responses in `samples/espn/` and never hit the network.
- **Detail syncs replace, not diff.** A match's lineups and events are rewritten wholesale in one transaction, which can't leave duplicates.
- **Team stats are stored as `jsonb`.** A stat ESPN adds later is stored without a migration; the front end picks what to show.
- **Formations need a lookup table, not sorting.** ESPN's `formationPlace` is a classic shirt-number slot (1 keeper, 2 right back … 9 striker), not line order, so `web/src/formation.ts` maps each formation's slots to pitch coordinates, with a position-code fallback for shapes it doesn't know.
- **Club colours are adjusted for contrast.** `web/src/teamColours.ts` picks a colour per side and per theme that reaches 3:1 against the background, and swaps the away side when the two clash.

## Repository layout

| Path | What it is |
|---|---|
| `src/Matchday.Core` | Provider-neutral models, the followed competitions, and the `IFootballProvider` interface. No dependencies. |
| `src/Matchday.Providers.Espn` | ESPN HTTP client and the pure JSON → model mappers. |
| `src/Matchday.Data` | EF Core entities, `DbContext` and migrations. |
| `src/Matchday.Sync` | `SyncWorker` (what to fetch, when) and `MatchSyncService` (writes to the database). |
| `src/Matchday.Api` | The host: DI, read endpoints, serves the React build, runs the worker. |
| `tests/Matchday.Tests` | xUnit tests for the mappers. |
| `samples/espn` | Saved ESPN responses used as test fixtures. |
| `web/` | The React front end. |
| `Dockerfile` | Three-stage build: Node builds the front end, the .NET SDK publishes the API, the ASP.NET runtime image runs both as a non-root user. |

## Running it locally

Needs the .NET 10 SDK, Node 24 and Docker.

```bash
# 1. A local Postgres on 127.0.0.1:5434
echo "MATCHDAY_DB_PASSWORD=choose-one" > .env
docker compose -f docker-compose.dev.yml up -d

# 2. Point the API at it (user-secrets, so nothing lands in the repo)
dotnet user-secrets --project src/Matchday.Api set "ConnectionStrings:Matchday" \
  "Host=localhost;Port=5434;Database=matchday;Username=matchday;Password=choose-one"

# 3. Run the API and worker (http://localhost:5296); migrations run on startup
dotnet run --project src/Matchday.Api

# 4. In another terminal, the front end (http://localhost:5173, proxies /api to the API)
cd web && npm ci && npm run dev
```

The database fills itself: the first few minutes pull the current fixture window and table, and the season backfill catches up over the following hour.

## Tests

```bash
dotnet test           # mapper tests against samples/espn
cd web && npm run build   # type-checks the front end
```

## API

All endpoints are read-only `GET`s under `/api`:

| Endpoint | Returns |
|---|---|
| `/matches?from=&to=` | Matches in a date range (Eastern calendar days, max 400) across every followed competition, with goals |
| `/matches/{id}` | Score, lineups, event timeline and team stats |
| `/standings?competition=` | A league table (Premier League by default, or a UEFA league phase) |
| `/leaderboards?competition=` | Season leaders: goals, assists, clean sheets |
| `/teams/{id}` | Everything a club page needs: table, matches, squad, season stats, news |
| `/players/{id}` and `/players/{id}/career` | The player popup: this season's numbers and club career |
| `/news?team=` | Recent headlines, league-wide or for one club |

## Deployment

Production is two containers (app and Postgres) on a private Docker network, with the app also joined to the Cloudflare Tunnel's network. Neither publishes a host port. Secrets live in an untracked `.env` on the server.

A push to the server's git remote triggers a `post-receive` hook that rebuilds and restarts the stack; migrations apply on startup, so a deploy is a single `git push`.

## Limitations

- ESPN's feed is unofficial and can change without notice; that's why it sits behind an interface.
- No xG, player ratings or matchweek numbers: the feed doesn't carry them, and the project only uses free sources.
- Only followed competitions are stored, so a European club's domestic league never appears.

## Disclaimer

A personal project, not affiliated with or endorsed by ESPN, the Premier League or UEFA. Club names and crests belong to their owners; crests are loaded from ESPN's CDN.
