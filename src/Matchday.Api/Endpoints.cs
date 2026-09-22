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

public static class Endpoints
{
    private static readonly TimeZoneInfo Eastern = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");

    public static void MapMatchdayApi(this WebApplication app)
    {
        var api = app.MapGroup("/api");
        api.MapGet("/matches", GetMatches);
        api.MapGet("/matches/{id:int}", GetMatch);
        api.MapGet("/standings", GetStandings);
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

        return Results.Ok(rows.Select(s => new StandingDto(
            s.Position, ToTeam(s.Team), s.Played, s.Won, s.Drawn, s.Lost,
            s.GoalsFor, s.GoalsAgainst, s.GoalsFor - s.GoalsAgainst, s.Points)));
    }

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