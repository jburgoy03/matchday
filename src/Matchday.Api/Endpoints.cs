using System.Text.Json;
using Matchday.Core;
using Matchday.Core.Providers;
using Matchday.Data;
using Matchday.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Matchday.Api;

/// <summary>Color / AlternateColor as "#rrggbb", or null until the sync has seen the club on a scoreboard.</summary>
public sealed record TeamDto(int Id, string Name, string ShortName, string Abbreviation, string? LogoUrl, string? Color, string? AlternateColor);

/// <summary>A goal in the match list: enough to print "Haaland 12'" under the right team.</summary>
public sealed record GoalDto(string Type, int? Minute, string Clock, int? TeamId, string? Player);

/// <summary>Competition is the provider's league slug (eng.1, uefa.champions, eng.fa…).</summary>
public sealed record MatchListItemDto(
    int Id, DateTimeOffset KickoffUtc, string Status, string? Clock,
    TeamDto Home, TeamDto Away, int? HomeScore, int? AwayScore, string? Venue,
    IReadOnlyList<GoalDto> Goals, string Competition);

public sealed record LineupPlayerDto(int PlayerId, string Name, string? Jersey, string? Position, bool Starter, int? FormationPlace);

public sealed record TeamLineupDto(int TeamId, string? Formation, IReadOnlyList<LineupPlayerDto> Starters, IReadOnlyList<LineupPlayerDto> Bench);

/// <summary>Player for a goal/card is the scorer or booked player; for a substitution it's the player coming on, Secondary the one going off.</summary>
public sealed record IncidentDto(
    string Type, int? Minute, string Clock, int? TeamId,
    string? Player, string? SecondaryPlayer, int? PlayerId, int? SecondaryPlayerId);

public sealed record MatchDetailDto(
    MatchListItemDto Match, TeamLineupDto? HomeLineup, TeamLineupDto? AwayLineup,
    IReadOnlyList<IncidentDto> Incidents, DateTimeOffset? DetailSyncedAt,
    IReadOnlyDictionary<string, double>? HomeStats, IReadOnlyDictionary<string, double>? AwayStats);

public sealed record LeaderDto(int PlayerId, string Name, TeamDto? Team, int Goals, int Assists);

/// <summary>A goalkeeper's clean sheets: starts in finished matches where his side conceded nothing and he wasn't taken off.</summary>
public sealed record CleanSheetDto(int PlayerId, string Name, TeamDto? Team, int CleanSheets, int Starts);

/// <summary>A player's league numbers this season, from our own match data. CleanSheets only for keepers.</summary>
public sealed record PlayerSeasonDto(string Label, int Apps, int Starts, int Goals, int Assists, int YellowCards, int RedCards, int? CleanSheets);

/// <summary>
/// The player profile popup. Position is G, D, M or F. Career comes separately from /players/{id}/career.
/// Season is null for a player outside the Premier League (not in a league squad, no league appearance this season).
/// </summary>
public sealed record PlayerDto(
    int Id, string Name, TeamDto? Team, string? Jersey, string? Position, int? Age, string? Nationality, string? FlagUrl,
    PlayerSeasonDto? Season);

/// <summary>The season's leaderboards in one response, for the matches page sidebar.</summary>
public sealed record LeaderboardsDto(IReadOnlyList<LeaderDto> Scorers, IReadOnlyList<LeaderDto> Assists, IReadOnlyList<CleanSheetDto> CleanSheets);

public sealed record StandingDto(
    int Position, TeamDto Team, int Played, int Won, int Drawn, int Lost,
    int GoalsFor, int GoalsAgainst, int GoalDifference, int Points);

public sealed record SquadPlayerDto(
    int PlayerId, string Name, string? Jersey, string? Position, int? Age, string? Nationality, string? FlagUrl,
    int Apps, int Goals, int Assists, int YellowCards, int RedCards);

/// <summary>Per-match averages of the stored ESPN team stats: this team's, and every side in the league's.</summary>
public sealed record SeasonStatsDto(int Matches, IReadOnlyDictionary<string, double> Team, IReadOnlyDictionary<string, double> League);

/// <summary>A headline and a link out. We never serve article bodies, and paywalled items never reach here.</summary>
public sealed record NewsDto(
    int Id, string Headline, string? Description, string? Byline, DateTimeOffset PublishedUtc,
    string? ImageUrl, string? ImageCredit, string? WebUrl, IReadOnlyList<int> TeamIds);

/// <summary>TableCompetition says which table Table is: the Premier League, or a UEFA league phase for a club not in it.</summary>
public sealed record TeamPageDto(
    TeamDto Team, string? Venue, IReadOnlyList<StandingDto> Table, IReadOnlyList<MatchListItemDto> Matches,
    IReadOnlyList<SquadPlayerDto> Squad, SeasonStatsDto? Stats, IReadOnlyList<NewsDto> News, string TableCompetition);

public static class Endpoints
{
    private static readonly TimeZoneInfo Eastern = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");

    public static void MapMatchdayApi(this WebApplication app)
    {
        var api = app.MapGroup("/api");
        api.MapGet("/matches", GetMatches);
        api.MapGet("/matches/{id:int}", GetMatch);
        api.MapGet("/standings", GetStandings);
        api.MapGet("/teams/{id:int}", GetTeam);
        api.MapGet("/leaders", GetLeaders);
        api.MapGet("/leaderboards", GetLeaderboards);
        api.MapGet("/players/{id:int}", GetPlayer);
        api.MapGet("/players/{id:int}/career", GetPlayerCareer);
        api.MapGet("/news", GetNews);
    }

    private static async Task<IResult> GetMatches(
        MatchdayDbContext db, TimeProvider clock, DateOnly? from, DateOnly? to, CancellationToken ct)
    {
        var todayEt = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(clock.GetUtcNow(), Eastern).DateTime);
        var start = from ?? todayEt.AddDays(-7);
        var end = to ?? todayEt.AddDays(21);
        // A full season is ~334 days; 400 leaves room without allowing an unbounded scan.
        if (end < start || end.DayNumber - start.DayNumber > 400)
            return Results.BadRequest("Date range must be between 0 and 400 days.");

        var fromUtc = StartOfEasternDayUtc(start);
        var toUtc = StartOfEasternDayUtc(end.AddDays(1));

        var matches = await db.Matches.AsNoTracking()
            .Include(m => m.HomeTeam)
            .Include(m => m.AwayTeam)
            .Where(m => m.KickoffUtc >= fromUtc && m.KickoffUtc < toUtc)
            .OrderBy(m => m.KickoffUtc)
            .ToListAsync(ct);

        var goals = await GoalsByMatchAsync(db, matches.Select(m => m.Id).ToList(), ct);
        return Results.Ok(matches.Select(m => ToListItem(m, goals.GetValueOrDefault(m.Id, []))));
    }

    private static async Task<IResult> GetMatch(int id, MatchdayDbContext db, CancellationToken ct)
    {
        var m = await db.Matches.AsNoTracking()
            .Include(x => x.HomeTeam)
            .Include(x => x.AwayTeam)
            .Include(x => x.Lineup).ThenInclude(l => l.Player)
            .Include(x => x.Incidents).ThenInclude(i => i.PrimaryPlayer)
            .Include(x => x.Incidents).ThenInclude(i => i.SecondaryPlayer)
            .AsSplitQuery()
            .FirstOrDefaultAsync(x => x.Id == id, ct);
        if (m is null) return Results.NotFound();

        TeamLineupDto? Lineup(int teamId, string? formation)
        {
            var entries = m.Lineup.Where(l => l.TeamId == teamId).ToList();
            if (entries.Count == 0) return null;

            static LineupPlayerDto Dto(LineupEntry l) =>
                new(l.PlayerId, l.Player.Name, l.Jersey, l.Position, l.Starter, l.FormationPlace);
            static int JerseyNumber(LineupEntry l) => int.TryParse(l.Jersey, out var n) ? n : 999;

            return new TeamLineupDto(
                teamId,
                formation,
                entries.Where(l => l.Starter).OrderBy(l => l.FormationPlace ?? 99).Select(Dto).ToList(),
                entries.Where(l => !l.Starter).OrderBy(JerseyNumber).Select(Dto).ToList());
        }

        var incidents = m.Incidents
            .OrderBy(i => i.Sequence)
            .Select(i => new IncidentDto(i.Type.ToString(), i.Minute, i.ClockDisplay, i.TeamId,
                i.PrimaryPlayer?.Name, i.SecondaryPlayer?.Name, i.PrimaryPlayerId, i.SecondaryPlayerId))
            .ToList();

        return Results.Ok(new MatchDetailDto(
            ToListItem(m, GoalsOf(m.Incidents)),
            Lineup(m.HomeTeamId, m.HomeFormation),
            Lineup(m.AwayTeamId, m.AwayFormation),
            incidents,
            m.DetailSyncedAt,
            m.HomeStats,
            m.AwayStats));
    }

    /// <summary>One competition's table: the Premier League by default, or a UEFA league phase (?competition=uefa.champions).</summary>
    private static async Task<IResult> GetStandings(MatchdayDbContext db, string? competition, CancellationToken ct)
    {
        var comp = string.IsNullOrWhiteSpace(competition) ? Competitions.PremierLeague : competition;
        var rows = await db.Standings.AsNoTracking()
            .Include(s => s.Team)
            .Where(s => s.Competition == comp)
            .OrderBy(s => s.Position)
            .ToListAsync(ct);

        return Results.Ok(rows.Select(ToStanding));
    }

    private static readonly string[] PositionOrder = ["G", "D", "M", "F"];

    /// <summary>Everything the team page shows. Match-derived numbers (form, record, splits) are computed client-side from Matches.</summary>
    private static async Task<IResult> GetTeam(int id, MatchdayDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var team = await db.Teams.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id, ct);
        if (team is null) return Results.NotFound();

        var todayEt = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(clock.GetUtcNow(), Eastern).DateTime);
        var seasonStartUtc = StartOfEasternDayUtc(Season.StartFor(todayEt));

        var matches = await db.Matches.AsNoTracking()
            .Include(m => m.HomeTeam)
            .Include(m => m.AwayTeam)
            .Where(m => (m.HomeTeamId == id || m.AwayTeamId == id) && m.KickoffUtc >= seasonStartUtc)
            .OrderBy(m => m.KickoffUtc)
            .ToListAsync(ct);

        // The table this club is in: the Premier League if it's there, otherwise its European league phase
        // (a PSG or a Bayern only reaches us through the Champions League).
        var inTables = await db.Standings.AsNoTracking().Where(s => s.TeamId == id).Select(s => s.Competition).ToListAsync(ct);
        var tableCompetition = Competitions.WithTables.FirstOrDefault(inTables.Contains) ?? Competitions.PremierLeague;
        var table = await db.Standings.AsNoTracking()
            .Include(s => s.Team)
            .Where(s => s.Competition == tableCompetition)
            .OrderBy(s => s.Position)
            .ToListAsync(ct);

        // Home ground = the venue of most of this team's home matches.
        var venue = matches.Where(m => m.HomeTeamId == id && m.Venue != null)
            .GroupBy(m => m.Venue!)
            .OrderByDescending(g => g.Count())
            .Select(g => g.Key)
            .FirstOrDefault();

        // Squad numbers are league only, like the leaders and the player popup; cup and European games don't count.
        var finishedIds = matches.Where(m => m.Status == MatchStatus.FullTime && m.Competition == Competitions.PremierLeague).Select(m => m.Id).ToList();

        var members = await db.SquadMembers.AsNoTracking()
            .Include(s => s.Player)
            .Where(s => s.TeamId == id)
            .ToListAsync(ct);
        var playerIds = members.Select(s => (int?)s.PlayerId).ToList();

        var starts = await db.LineupEntries.AsNoTracking()
            .Where(l => finishedIds.Contains(l.MatchId) && l.Starter && playerIds.Contains(l.PlayerId))
            .Select(l => new { l.PlayerId, l.MatchId })
            .ToListAsync(ct);
        var incidents = await db.Incidents.AsNoTracking()
            .Where(i => finishedIds.Contains(i.MatchId)
                        && (playerIds.Contains(i.PrimaryPlayerId) || playerIds.Contains(i.SecondaryPlayerId)))
            .Select(i => new { i.MatchId, i.Type, i.PrimaryPlayerId, i.SecondaryPlayerId })
            .ToListAsync(ct);

        // Appearances = started, or came on (a substitution's primary player is the one coming on).
        var apps = starts.Select(s => (s.PlayerId, s.MatchId))
            .Concat(incidents.Where(i => i.Type == MatchEventType.Substitution && i.PrimaryPlayerId is not null)
                .Select(i => (PlayerId: i.PrimaryPlayerId!.Value, i.MatchId)))
            .Distinct()
            .GroupBy(x => x.PlayerId)
            .ToDictionary(g => g.Key, g => g.Count());
        int CountOf(int playerId, Func<MatchEventType, bool> type, bool secondary = false) =>
            incidents.Count(i => type(i.Type) && (secondary ? i.SecondaryPlayerId : i.PrimaryPlayerId) == playerId);

        static int JerseyNumber(string? j) => int.TryParse(j, out var n) ? n : 999;
        static int PositionRank(string? p) => Array.IndexOf(PositionOrder, p) is var i and >= 0 ? i : PositionOrder.Length;

        var squad = members
            .OrderBy(s => PositionRank(s.Position))
            .ThenBy(s => JerseyNumber(s.Jersey))
            .Select(s => new SquadPlayerDto(
                s.PlayerId, s.Player.Name, s.Jersey, s.Position, s.Age, s.Nationality, s.FlagUrl,
                apps.GetValueOrDefault(s.PlayerId),
                CountOf(s.PlayerId, t => t is MatchEventType.Goal or MatchEventType.PenaltyGoal),
                CountOf(s.PlayerId, t => t is MatchEventType.Goal, secondary: true),
                CountOf(s.PlayerId, t => t is MatchEventType.YellowCard),
                CountOf(s.PlayerId, t => t is MatchEventType.RedCard)))
            .ToList();

        var teamGoals = await GoalsByMatchAsync(db, matches.Select(m => m.Id).ToList(), ct);
        var stats = await SeasonStatsAsync(db, id, seasonStartUtc, ct);
        var news = await NewsAsync(db, id, 20, ct);

        return Results.Ok(new TeamPageDto(
            ToTeam(team), venue, table.Select(ToStanding).ToList(),
            matches.Select(m => ToListItem(m, teamGoals.GetValueOrDefault(m.Id, []))).ToList(), squad, stats, news, tableCompetition));
    }

    /// <summary>
    /// A story tagged with this many clubs or fewer counts as being about them. Above it, it's a
    /// league round-up (transfer rumours naming half the division), which is noise on a team page.
    /// </summary>
    private const int MaxTeamTagsForTeamNews = 4;

    /// <summary>
    /// Recent news, newest first. With a team id, only stories filed under that club and not
    /// spread across the league. Paywalled articles are never served — they dead-end at a signup wall.
    /// </summary>
    private static async Task<IResult> GetNews(MatchdayDbContext db, int? team, int? top, CancellationToken ct) =>
        Results.Ok(await NewsAsync(db, team, Math.Clamp(top ?? 10, 1, 50), ct));

    private static async Task<List<NewsDto>> NewsAsync(MatchdayDbContext db, int? teamId, int limit, CancellationToken ct)
    {
        var q = db.NewsArticles.AsNoTracking().Include(a => a.Teams).Where(a => !a.Premium);
        if (teamId is { } id)
            q = q.Where(a => a.Teams.Any(t => t.TeamId == id) && a.Teams.Count <= MaxTeamTagsForTeamNews);

        var rows = await q.OrderByDescending(a => a.PublishedUtc).Take(limit).ToListAsync(ct);
        return rows.Select(a => new NewsDto(
            a.Id, a.Headline, a.Description, a.Byline, a.PublishedUtc,
            a.ImageUrl, a.ImageCredit, a.WebUrl,
            a.Teams.Select(t => t.TeamId).ToList())).ToList();
    }

    /// <summary>Averages each stored stat over this team's finished matches, and over every side of every finished match.</summary>
    private static async Task<SeasonStatsDto?> SeasonStatsAsync(MatchdayDbContext db, int teamId, DateTimeOffset fromUtc, CancellationToken ct)
    {
        var rows = await db.Matches.AsNoTracking()
            .Where(m => m.Status == MatchStatus.FullTime && m.Competition == Competitions.PremierLeague && m.KickoffUtc >= fromUtc && m.HomeStats != null && m.AwayStats != null)
            .Select(m => new { m.HomeTeamId, m.AwayTeamId, m.HomeStats, m.AwayStats })
            .ToListAsync(ct);

        var teamSides = rows.Where(r => r.HomeTeamId == teamId).Select(r => r.HomeStats!)
            .Concat(rows.Where(r => r.AwayTeamId == teamId).Select(r => r.AwayStats!))
            .ToList();
        if (teamSides.Count == 0) return null;

        var allSides = rows.SelectMany(r => new[] { r.HomeStats!, r.AwayStats! }).ToList();
        return new SeasonStatsDto(teamSides.Count, Average(teamSides), Average(allSides));
    }

    private static Dictionary<string, double> Average(IReadOnlyList<Dictionary<string, double>> sides) =>
        sides.SelectMany(s => s)
            .GroupBy(kv => kv.Key)
            .ToDictionary(g => g.Key, g => Math.Round(g.Average(kv => kv.Value), 2));

    private static StandingDto ToStanding(StandingEntry s) => new(
        s.Position, ToTeam(s.Team), s.Played, s.Won, s.Drawn, s.Lost,
        s.GoalsFor, s.GoalsAgainst, s.GoalsFor - s.GoalsAgainst, s.Points);

    private static readonly MatchEventType[] GoalTypes =
        [MatchEventType.Goal, MatchEventType.PenaltyGoal, MatchEventType.OwnGoal];

    /// <summary>Goals for a set of matches, so a list of matches costs one extra query instead of one per match.</summary>
    private static async Task<Dictionary<int, List<GoalDto>>> GoalsByMatchAsync(
        MatchdayDbContext db, List<int> matchIds, CancellationToken ct)
    {
        if (matchIds.Count == 0) return [];

        var rows = await db.Incidents.AsNoTracking()
            .Where(i => matchIds.Contains(i.MatchId) && GoalTypes.Contains(i.Type))
            .OrderBy(i => i.MatchId).ThenBy(i => i.Sequence)
            .Select(i => new { i.MatchId, Goal = new GoalDto(i.Type.ToString(), i.Minute, i.ClockDisplay, i.TeamId, i.PrimaryPlayer!.Name) })
            .ToListAsync(ct);

        return rows.GroupBy(r => r.MatchId).ToDictionary(g => g.Key, g => g.Select(r => r.Goal).ToList());
    }

    private static List<GoalDto> GoalsOf(IEnumerable<MatchIncident> incidents) =>
        incidents.Where(i => GoalTypes.Contains(i.Type))
            .OrderBy(i => i.Sequence)
            .Select(i => new GoalDto(i.Type.ToString(), i.Minute, i.ClockDisplay, i.TeamId, i.PrimaryPlayer?.Name))
            .ToList();

    /// <summary>Top scorers this season, from our own incidents. Ties break on assists, then name.</summary>
    private static async Task<IResult> GetLeaders(MatchdayDbContext db, TimeProvider clock, int? top, CancellationToken ct)
    {
        var todayEt = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(clock.GetUtcNow(), Eastern).DateTime);
        var seasonStartUtc = StartOfEasternDayUtc(Season.StartFor(todayEt));
        var limit = Math.Clamp(top ?? 10, 1, 50);

        var rows = await db.Incidents.AsNoTracking()
            .Where(i => i.PrimaryPlayerId != null
                        && db.Matches.Any(m => m.Id == i.MatchId && m.KickoffUtc >= seasonStartUtc && m.Competition == Competitions.PremierLeague))
            .Select(i => new { i.Type, i.PrimaryPlayerId, i.SecondaryPlayerId, i.TeamId })
            .ToListAsync(ct);

        var goals = rows.Where(r => r.Type is MatchEventType.Goal or MatchEventType.PenaltyGoal).ToList();
        if (goals.Count == 0) return Results.Ok(Array.Empty<LeaderDto>());

        var assists = rows.Where(r => r.Type == MatchEventType.Goal && r.SecondaryPlayerId != null)
            .GroupBy(r => r.SecondaryPlayerId!.Value)
            .ToDictionary(g => g.Key, g => g.Count());

        var tally = goals.GroupBy(r => r.PrimaryPlayerId!.Value)
            .Select(g => new { PlayerId = g.Key, Goals = g.Count(), TeamId = g.Select(r => r.TeamId).FirstOrDefault(t => t != null) })
            .OrderByDescending(x => x.Goals)
            .ThenByDescending(x => assists.GetValueOrDefault(x.PlayerId))
            .Take(limit)
            .ToList();

        var playerIds = tally.Select(t => t.PlayerId).ToList();
        var names = await db.Players.AsNoTracking().Where(p => playerIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => p.Name, ct);
        var teamIds = tally.Select(t => t.TeamId).OfType<int>().Distinct().ToList();
        var teams = await db.Teams.AsNoTracking().Where(t => teamIds.Contains(t.Id)).ToDictionaryAsync(t => t.Id, ToTeam, ct);

        return Results.Ok(tally
            .Select(t => new LeaderDto(t.PlayerId, names.GetValueOrDefault(t.PlayerId, ""),
                t.TeamId is { } id && teams.TryGetValue(id, out var team) ? team : null,
                t.Goals, assists.GetValueOrDefault(t.PlayerId)))
            .OrderByDescending(l => l.Goals).ThenByDescending(l => l.Assists).ThenBy(l => l.Name)
            .ToList());
    }

    /// <summary>
    /// Top scorers, top assists and most clean sheets this season in one competition:
    /// the Premier League by default, or any followed competition (?competition=uefa.champions).
    /// </summary>
    private static async Task<IResult> GetLeaderboards(MatchdayDbContext db, TimeProvider clock, int? top, string? competition, CancellationToken ct)
    {
        var comp = string.IsNullOrWhiteSpace(competition) ? Competitions.PremierLeague : competition;
        if (!Competitions.IsFollowed(comp)) return Results.BadRequest($"Unknown competition '{comp}'.");

        var todayEt = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(clock.GetUtcNow(), Eastern).DateTime);
        var seasonStartUtc = StartOfEasternDayUtc(Season.StartFor(todayEt));
        var limit = Math.Clamp(top ?? 5, 1, 50);

        var events = await db.Incidents.AsNoTracking()
            .Where(i => db.Matches.Any(m => m.Id == i.MatchId && m.KickoffUtc >= seasonStartUtc && m.Competition == comp))
            .Select(i => new { i.MatchId, i.Type, i.PrimaryPlayerId, i.SecondaryPlayerId, i.TeamId })
            .ToListAsync(ct);

        // Goals and assists, same rules as /leaders: penalties count as goals, own goals don't,
        // and only an open-play goal credits its second participant with the assist.
        var goals = events.Where(e => e.PrimaryPlayerId != null && e.Type is MatchEventType.Goal or MatchEventType.PenaltyGoal)
            .GroupBy(e => e.PrimaryPlayerId!.Value)
            .ToDictionary(g => g.Key, g => (Count: g.Count(), TeamId: g.Select(e => e.TeamId).FirstOrDefault(t => t != null)));
        var assists = events.Where(e => e.SecondaryPlayerId != null && e.Type == MatchEventType.Goal)
            .GroupBy(e => e.SecondaryPlayerId!.Value)
            .ToDictionary(g => g.Key, g => (Count: g.Count(), TeamId: g.Select(e => e.TeamId).FirstOrDefault(t => t != null)));
        int Goals(int id) => goals.TryGetValue(id, out var g) ? g.Count : 0;
        int Assists(int id) => assists.TryGetValue(id, out var a) ? a.Count : 0;

        var scorerIds = goals.Keys.OrderByDescending(Goals).ThenByDescending(Assists).Take(limit).ToList();
        var assistIds = assists.Keys.OrderByDescending(Assists).ThenByDescending(Goals).Take(limit).ToList();

        // Clean sheets: the starting keeper in a finished match, opponents on zero, not substituted.
        var finished = await db.Matches.AsNoTracking()
            .Where(m => m.KickoffUtc >= seasonStartUtc && m.Status == MatchStatus.FullTime && m.Competition == comp)
            .Select(m => new { m.Id, m.HomeTeamId, m.HomeScore, m.AwayScore })
            .ToDictionaryAsync(m => m.Id, ct);
        var finishedIds = finished.Keys.ToList();
        var keepers = await db.LineupEntries.AsNoTracking()
            .Where(l => l.Starter && l.Position == "G" && finishedIds.Contains(l.MatchId))
            .Select(l => new { l.MatchId, l.TeamId, l.PlayerId })
            .ToListAsync(ct);
        var subbedOff = events.Where(e => e.Type == MatchEventType.Substitution && e.SecondaryPlayerId != null)
            .Select(e => (e.MatchId, e.SecondaryPlayerId!.Value))
            .ToHashSet();
        var sheets = keepers
            .GroupBy(k => k.PlayerId)
            .Select(g => new
            {
                PlayerId = g.Key,
                TeamId = g.Last().TeamId,
                Starts = g.Count(),
                CleanSheets = g.Count(k =>
                {
                    var m = finished[k.MatchId];
                    var conceded = k.TeamId == m.HomeTeamId ? m.AwayScore : m.HomeScore;
                    return conceded == 0 && !subbedOff.Contains((k.MatchId, k.PlayerId));
                }),
            })
            .Where(x => x.CleanSheets > 0)
            .OrderByDescending(x => x.CleanSheets).ThenBy(x => x.Starts)
            .Take(limit)
            .ToList();

        var playerIds = scorerIds.Concat(assistIds).Concat(sheets.Select(s => s.PlayerId)).Distinct().ToList();
        var names = await db.Players.AsNoTracking().Where(p => playerIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => p.Name, ct);
        var teamIds = goals.Values.Select(g => g.TeamId).Concat(assists.Values.Select(a => a.TeamId)).OfType<int>()
            .Concat(sheets.Select(s => s.TeamId)).Distinct().ToList();
        var teams = await db.Teams.AsNoTracking().Where(t => teamIds.Contains(t.Id)).ToDictionaryAsync(t => t.Id, ToTeam, ct);
        TeamDto? TeamOf(int? id) => id is { } t && teams.TryGetValue(t, out var dto) ? dto : null;
        LeaderDto Leader(int id, int? teamId) => new(id, names.GetValueOrDefault(id, ""), TeamOf(teamId), Goals(id), Assists(id));

        return Results.Ok(new LeaderboardsDto(
            scorerIds.Select(id => Leader(id, goals[id].TeamId)).ToList(),
            assistIds.Select(id => Leader(id, assists[id].TeamId)).ToList(),
            sheets.Select(s => new CleanSheetDto(s.PlayerId, names.GetValueOrDefault(s.PlayerId, ""), TeamOf(s.TeamId), s.CleanSheets, s.Starts)).ToList()));
    }

    /// <summary>Profile header and this season's numbers, all from our own data, so it's instant.</summary>
    private static async Task<IResult> GetPlayer(int id, MatchdayDbContext db, TimeProvider clock, CancellationToken ct)
    {
        var player = await db.Players.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id, ct);
        if (player is null) return Results.NotFound();

        var todayEt = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(clock.GetUtcNow(), Eastern).DateTime);
        var seasonStart = Season.StartFor(todayEt);
        var seasonStartUtc = StartOfEasternDayUtc(seasonStart);

        var member = await db.SquadMembers.AsNoTracking()
            .Where(s => s.PlayerId == id)
            .OrderByDescending(s => s.UpdatedAt)
            .FirstOrDefaultAsync(ct);

        // Same rules as the squad tab: finished matches only; an appearance is a start or coming on.
        var finished = await db.Matches.AsNoTracking()
            .Where(m => m.KickoffUtc >= seasonStartUtc && m.Status == MatchStatus.FullTime && m.Competition == Competitions.PremierLeague)
            .Select(m => new { m.Id, m.KickoffUtc, m.HomeTeamId, m.HomeScore, m.AwayScore })
            .ToDictionaryAsync(m => m.Id, ct);
        var finishedIds = finished.Keys.ToList();
        var lineups = await db.LineupEntries.AsNoTracking()
            .Where(l => l.PlayerId == id && finishedIds.Contains(l.MatchId))
            .Select(l => new { l.MatchId, l.TeamId, l.Starter, l.Position, l.Jersey })
            .ToListAsync(ct);
        var incidents = await db.Incidents.AsNoTracking()
            .Where(i => finishedIds.Contains(i.MatchId) && (i.PrimaryPlayerId == id || i.SecondaryPlayerId == id))
            .Select(i => new { i.MatchId, i.Type, i.PrimaryPlayerId, i.SecondaryPlayerId })
            .ToListAsync(ct);

        var started = lineups.Where(l => l.Starter).Select(l => l.MatchId).ToHashSet();
        var cameOn = incidents.Where(i => i.Type == MatchEventType.Substitution && i.PrimaryPlayerId == id).Select(i => i.MatchId);
        var subbedOff = incidents.Where(i => i.Type == MatchEventType.Substitution && i.SecondaryPlayerId == id).Select(i => i.MatchId).ToHashSet();
        int Count(Func<MatchEventType, bool> type, bool secondary = false) =>
            incidents.Count(i => type(i.Type) && (secondary ? i.SecondaryPlayerId : i.PrimaryPlayerId) == id);

        var keeper = member?.Position == "G" || lineups.Any(l => l.Position == "G");
        int? cleanSheets = keeper
            ? lineups.Count(l =>
            {
                if (!l.Starter || l.Position != "G" || subbedOff.Contains(l.MatchId)) return false;
                var m = finished[l.MatchId];
                return (l.TeamId == m.HomeTeamId ? m.AwayScore : m.HomeScore) == 0;
            })
            : null;

        // A Premier League player is in a league squad or has played in the league this season.
        // Anyone else (a Champions League opponent, say) gets no league season block.
        var inLeague = member is not null || lineups.Count > 0;

        // Club and shirt: the current squad if he's in one, otherwise his latest league match, otherwise
        // his latest match in any competition (how a European club's player gets a club and shirt number).
        var latestLeague = lineups.OrderByDescending(l => finished[l.MatchId].KickoffUtc).FirstOrDefault();
        var latest = latestLeague is not null
            ? new { latestLeague.TeamId, latestLeague.Jersey, latestLeague.Position }
            : member is null
                ? await (from l in db.LineupEntries.AsNoTracking()
                         join m in db.Matches.AsNoTracking() on l.MatchId equals m.Id
                         where l.PlayerId == id
                         orderby m.KickoffUtc descending
                         select new { l.TeamId, l.Jersey, l.Position })
                    .FirstOrDefaultAsync(ct)
                : null;
        var teamId = member?.TeamId ?? latest?.TeamId;
        var team = teamId is null ? null : await db.Teams.AsNoTracking().FirstOrDefaultAsync(t => t.Id == teamId, ct);

        var y = seasonStart.Year;
        return Results.Ok(new PlayerDto(
            player.Id, player.Name, team is null ? null : ToTeam(team),
            member?.Jersey ?? latest?.Jersey,
            member?.Position ?? PositionGroup(latest?.Position),
            member?.Age, member?.Nationality, member?.FlagUrl,
            !inLeague ? null : new PlayerSeasonDto(
                $"{y}-{(y + 1) % 100:D2}",
                started.Concat(cameOn).Distinct().Count(),
                started.Count,
                Count(t => t is MatchEventType.Goal or MatchEventType.PenaltyGoal),
                Count(t => t is MatchEventType.Goal, secondary: true),
                Count(t => t is MatchEventType.YellowCard),
                Count(t => t is MatchEventType.RedCard),
                cleanSheets)));
    }

    /// <summary>A lineup position code (CD-R, AM-L, F…) → G, D, M or F, the squad's groups.</summary>
    private static string? PositionGroup(string? code) => code switch
    {
        null or "" or "SUB" => null,
        "G" => "G",
        _ when code.StartsWith("AM") || code.StartsWith("DM") || code.StartsWith("CM") || code is "M" or "LM" or "RM" => "M",
        _ when code.StartsWith("CD") || code.StartsWith("CB") || code.EndsWith("B") || code is "SW" => "D",
        _ => "F",
    };

    private static readonly TimeSpan CareerMaxAge = TimeSpan.FromDays(7);
    private static readonly JsonSerializerOptions CareerJsonOptions = new(JsonSerializerDefaults.Web);

    /// <summary>
    /// Club career from the provider. Fetched the first time anyone opens the profile (several provider
    /// calls, a second or two), then kept for a week — past seasons don't change.
    /// </summary>
    private static async Task<IResult> GetPlayerCareer(
        int id, MatchdayDbContext db, IFootballProvider provider, TimeProvider clock, ILoggerFactory logs, CancellationToken ct)
    {
        var player = await db.Players.FirstOrDefaultAsync(p => p.Id == id, ct);
        if (player is null) return Results.NotFound();

        var now = clock.GetUtcNow();
        if (player.CareerJson is null || player.CareerSyncedAt is null || now - player.CareerSyncedAt > CareerMaxAge)
        {
            try
            {
                var fresh = await provider.GetPlayerCareerAsync(player.ProviderId, ct);
                if (fresh is not null)
                {
                    player.CareerJson = JsonSerializer.Serialize(fresh, CareerJsonOptions);
                    player.CareerSyncedAt = now;
                    await db.SaveChangesAsync(ct);
                }
            }
            catch (Exception ex) when ((ex is HttpRequestException || ex is TaskCanceledException) && !ct.IsCancellationRequested)
            {
                // Keep whatever we had; an older career beats none.
                logs.CreateLogger("Matchday.Api.Players").LogWarning(ex, "Career fetch failed for player {PlayerId}", id);
            }
        }

        var career = player.CareerJson is null ? null : JsonSerializer.Deserialize<PlayerCareer>(player.CareerJson, CareerJsonOptions);
        return Results.Ok(career ?? new PlayerCareer([]));
    }

    private static MatchListItemDto ToListItem(Match m, IReadOnlyList<GoalDto> goals) => new(
        m.Id, m.KickoffUtc, m.Status.ToString(), m.ClockDisplay,
        ToTeam(m.HomeTeam), ToTeam(m.AwayTeam), m.HomeScore, m.AwayScore, m.Venue, goals, m.Competition);

    private static TeamDto ToTeam(Team t) => new(t.Id, t.Name, t.ShortName, t.Abbreviation, t.LogoUrl,
        t.Color is null ? null : $"#{t.Color}", t.AlternateColor is null ? null : $"#{t.AlternateColor}");

    private static DateTimeOffset StartOfEasternDayUtc(DateOnly day)
    {
        var local = day.ToDateTime(TimeOnly.MinValue);
        return new DateTimeOffset(local, Eastern.GetUtcOffset(local)).ToUniversalTime();
    }
}