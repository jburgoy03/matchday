using Matchday.Core;
using Matchday.Core.Providers;
using Matchday.Data;
using Matchday.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace Matchday.Api;

public sealed record TeamDto(int Id, string Name, string ShortName, string Abbreviation, string? LogoUrl);

public sealed record MatchListItemDto(
    int Id, DateTimeOffset KickoffUtc, string Status, string? Clock,
    TeamDto Home, TeamDto Away, int? HomeScore, int? AwayScore, string? Venue);

public sealed record LineupPlayerDto(int PlayerId, string Name, string? Jersey, string? Position, bool Starter, int? FormationPlace);

public sealed record TeamLineupDto(int TeamId, string? Formation, IReadOnlyList<LineupPlayerDto> Starters, IReadOnlyList<LineupPlayerDto> Bench);

public sealed record IncidentDto(string Type, int? Minute, string Clock, int? TeamId, string? Player, string? SecondaryPlayer);

public sealed record MatchDetailDto(
    MatchListItemDto Match, TeamLineupDto? HomeLineup, TeamLineupDto? AwayLineup,
    IReadOnlyList<IncidentDto> Incidents, DateTimeOffset? DetailSyncedAt,
    IReadOnlyDictionary<string, double>? HomeStats, IReadOnlyDictionary<string, double>? AwayStats);

public sealed record StandingDto(
    int Position, TeamDto Team, int Played, int Won, int Drawn, int Lost,
    int GoalsFor, int GoalsAgainst, int GoalDifference, int Points);

public sealed record SquadPlayerDto(
    int PlayerId, string Name, string? Jersey, string? Position, int? Age, string? Nationality, string? FlagUrl,
    int Apps, int Goals, int Assists, int YellowCards, int RedCards);

/// <summary>Per-match averages of the stored ESPN team stats: this team's, and every side in the league's.</summary>
public sealed record SeasonStatsDto(int Matches, IReadOnlyDictionary<string, double> Team, IReadOnlyDictionary<string, double> League);

public sealed record TeamPageDto(
    TeamDto Team, string? Venue, IReadOnlyList<StandingDto> Table, IReadOnlyList<MatchListItemDto> Matches,
    IReadOnlyList<SquadPlayerDto> Squad, SeasonStatsDto? Stats);

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
    }

    private static async Task<IResult> GetMatches(
        MatchdayDbContext db, TimeProvider clock, DateOnly? from, DateOnly? to, CancellationToken ct)
    {
        var todayEt = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(clock.GetUtcNow(), Eastern).DateTime);
        var start = from ?? todayEt.AddDays(-7);
        var end = to ?? todayEt.AddDays(21);
        if (end < start || end.DayNumber - start.DayNumber > 62)
            return Results.BadRequest("Date range must be between 0 and 62 days.");

        var fromUtc = StartOfEasternDayUtc(start);
        var toUtc = StartOfEasternDayUtc(end.AddDays(1));

        var matches = await db.Matches.AsNoTracking()
            .Include(m => m.HomeTeam)
            .Include(m => m.AwayTeam)
            .Where(m => m.KickoffUtc >= fromUtc && m.KickoffUtc < toUtc)
            .OrderBy(m => m.KickoffUtc)
            .ToListAsync(ct);

        return Results.Ok(matches.Select(ToListItem));
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
                i.PrimaryPlayer?.Name, i.SecondaryPlayer?.Name))
            .ToList();

        return Results.Ok(new MatchDetailDto(
            ToListItem(m),
            Lineup(m.HomeTeamId, m.HomeFormation),
            Lineup(m.AwayTeamId, m.AwayFormation),
            incidents,
            m.DetailSyncedAt,
            m.HomeStats,
            m.AwayStats));
    }

    private static async Task<IResult> GetStandings(MatchdayDbContext db, CancellationToken ct)
    {
        var rows = await db.Standings.AsNoTracking()
            .Include(s => s.Team)
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

        var table = await db.Standings.AsNoTracking()
            .Include(s => s.Team)
            .OrderBy(s => s.Position)
            .ToListAsync(ct);

        // Home ground = the venue of most of this team's home matches.
        var venue = matches.Where(m => m.HomeTeamId == id && m.Venue != null)
            .GroupBy(m => m.Venue!)
            .OrderByDescending(g => g.Count())
            .Select(g => g.Key)
            .FirstOrDefault();

        var finishedIds = matches.Where(m => m.Status == MatchStatus.FullTime).Select(m => m.Id).ToList();

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

        var stats = await SeasonStatsAsync(db, id, seasonStartUtc, ct);

        return Results.Ok(new TeamPageDto(
            ToTeam(team), venue, table.Select(ToStanding).ToList(), matches.Select(ToListItem).ToList(), squad, stats));
    }

    /// <summary>Averages each stored stat over this team's finished matches, and over every side of every finished match.</summary>
    private static async Task<SeasonStatsDto?> SeasonStatsAsync(MatchdayDbContext db, int teamId, DateTimeOffset fromUtc, CancellationToken ct)
    {
        var rows = await db.Matches.AsNoTracking()
            .Where(m => m.Status == MatchStatus.FullTime && m.KickoffUtc >= fromUtc && m.HomeStats != null && m.AwayStats != null)
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

    private static MatchListItemDto ToListItem(Match m) => new(
        m.Id, m.KickoffUtc, m.Status.ToString(), m.ClockDisplay,
        ToTeam(m.HomeTeam), ToTeam(m.AwayTeam), m.HomeScore, m.AwayScore, m.Venue);

    private static TeamDto ToTeam(Team t) => new(t.Id, t.Name, t.ShortName, t.Abbreviation, t.LogoUrl);

    private static DateTimeOffset StartOfEasternDayUtc(DateOnly day)
    {
        var local = day.ToDateTime(TimeOnly.MinValue);
        return new DateTimeOffset(local, Eastern.GetUtcOffset(local)).ToUniversalTime();
    }
}