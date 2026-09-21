using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Matchday.Core.Providers;

namespace Matchday.Providers.Espn;

/// <summary>Pure translation from ESPN JSON to provider-neutral records. No I/O, so it's testable against saved files.</summary>
public static partial class EspnMapper
{
    public static IReadOnlyList<MatchSummary> MapScoreboard(JsonElement root) =>
        root.Arr("events")
            .Select(ev => (ev, comp: ev.Arr("competitions").Cast<JsonElement?>().FirstOrDefault()))
            .Where(x => x.comp is not null)
            .Select(x => MapCompetition(x.ev.Str("id") ?? "", x.comp!.Value, x.comp.Value.Str("venue", "fullName")))
            .ToList();

    public static MatchDetail? MapSummary(JsonElement root, string matchId)
    {
        var comp = root.Arr("header", "competitions").Cast<JsonElement?>().FirstOrDefault();
        if (comp is null) return null;

        var summary = MapCompetition(root.Str("header", "id") ?? matchId, comp.Value, root.Str("gameInfo", "venue", "fullName"));
        var lineups = root.Arr("rosters").Select(MapLineup).ToList();
        var events = root.Arr("keyEvents").Select(MapEvent).OfType<MatchEvent>().ToList();
        return new MatchDetail(summary, lineups, events);
    }

    public static IReadOnlyList<StandingRow> MapStandings(JsonElement root) =>
        root.Arr("children")
            .SelectMany(c => c.Arr("standings", "entries"))
            .Select(en =>
            {
                var stats = en.Arr("stats")
                    .Where(s => s.Str("name") is not null)
                    .GroupBy(s => s.Str("name")!)
                    .ToDictionary(g => g.Key, g => g.First().Int("value") ?? 0);
                int S(string k) => stats.GetValueOrDefault(k);
                return new StandingRow(S("rank"), MapTeam(en.Get("team")!.Value),
                    S("gamesPlayed"), S("wins"), S("ties"), S("losses"),
                    S("pointsFor"), S("pointsAgainst"), S("points"));
            })
            .OrderBy(r => r.Position)
            .ToList();

    private static MatchSummary MapCompetition(string id, JsonElement comp, string? venue)
    {
        var competitors = comp.Arr("competitors").ToList();
        var home = competitors.First(c => c.Str("homeAway") == "home");
        var away = competitors.First(c => c.Str("homeAway") == "away");
        var status = MapStatus(comp.Str("status", "type", "name"), comp.Str("status", "type", "state"));
        var hasScore = status is MatchStatus.Live or MatchStatus.HalfTime or MatchStatus.FullTime;

        return new MatchSummary(
            id,
            ParseDate(comp.Str("date")),
            status,
            comp.Str("status", "displayClock"),
            MapTeam(home.Get("team")!.Value),
            MapTeam(away.Get("team")!.Value),
            hasScore ? Score(home) : null,
            hasScore ? Score(away) : null,
            venue);
    }

    private static int? Score(JsonElement competitor) => competitor.Int("score") ?? competitor.Int("score", "value");

    internal static MatchStatus MapStatus(string? name, string? state) => (name, state) switch
    {
        ("STATUS_POSTPONED", _) => MatchStatus.Postponed,
        ("STATUS_CANCELED" or "STATUS_CANCELLED" or "STATUS_ABANDONED", _) => MatchStatus.Cancelled,
        ("STATUS_HALFTIME", _) => MatchStatus.HalfTime,
        (_, "pre") => MatchStatus.Scheduled,
        (_, "in") => MatchStatus.Live,
        (_, "post") => MatchStatus.FullTime,
        _ => MatchStatus.Unknown
    };

    private static TeamRef MapTeam(JsonElement t) => new(
        t.Str("id") ?? "",
        t.Str("displayName") ?? t.Str("name") ?? "",
        t.Str("shortDisplayName") ?? t.Str("displayName") ?? "",
        t.Str("abbreviation") ?? "",
        t.Str("logo") ?? t.Arr("logos").Select(l => l.Str("href")).FirstOrDefault());

    private static TeamLineup MapLineup(JsonElement r) => new(
        r.Str("team", "id") ?? "",
        r.Str("formation"),
        r.Arr("roster").Select(p => new LineupPlayer(
            new PlayerRef(
                p.Str("athlete", "id") ?? "",
                p.Str("athlete", "displayName") ?? "",
                p.Str("jersey"),
                p.Str("position", "abbreviation")),
            p.Bool("starter"),
            p.Int("formationPlace") is > 0 and var fp ? fp : null)).ToList());

    private static MatchEvent? MapEvent(JsonElement e)
    {
        var type = MapEventType(e.Str("type", "type")) ?? (e.Bool("scoringPlay") ? MatchEventType.Goal : null);
        if (type is null) return null;

        var people = e.Arr("participants")
            .Select(p => new PlayerRef(p.Str("athlete", "id") ?? "", p.Str("athlete", "displayName") ?? "", null, null))
            .ToList();
        var clock = e.Str("clock", "displayValue") ?? "";

        return new MatchEvent(type.Value, ParseMinute(clock, e.Int("clock", "value")), clock,
            e.Str("team", "id"), people.ElementAtOrDefault(0), people.ElementAtOrDefault(1), e.Str("text"));
    }

    internal static MatchEventType? MapEventType(string? slug) => slug switch
    {
        null => null,
        _ when slug.StartsWith("own-goal") => MatchEventType.OwnGoal,
        _ when slug.StartsWith("goal") && slug.Contains("penalty") => MatchEventType.PenaltyGoal,
        _ when slug.StartsWith("penalty") && slug.Contains("scored") => MatchEventType.PenaltyGoal,
        _ when slug.StartsWith("goal") => MatchEventType.Goal,
        "yellow-card" => MatchEventType.YellowCard,
        "red-card" or "second-yellow-card" or "yellow-red-card" => MatchEventType.RedCard,
        "substitution" => MatchEventType.Substitution,
        _ => null
    };

    [GeneratedRegex(@"^\s*(\d+)")]
    private static partial Regex LeadingNumber();

    private static int? ParseMinute(string display, int? seconds)
    {
        var m = LeadingNumber().Match(display);
        if (m.Success) return int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture);
        return seconds is { } s ? (int)Math.Ceiling(s / 60.0) : null;
    }

    private static DateTimeOffset ParseDate(string? s) =>
        DateTimeOffset.Parse(s ?? throw new FormatException("Missing match date"),
            CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal);
}
