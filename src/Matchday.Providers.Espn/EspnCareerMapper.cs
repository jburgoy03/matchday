using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Matchday.Core.Providers;

namespace Matchday.Providers.Espn;

/// <summary>
/// athletes/{id}/stats → a player's club career. One response covers one team (the current one
/// unless ?team= says otherwise) in that team's domestic league, season by season.
/// </summary>
public static partial class EspnMapper
{
    // League slugs for national-team and continental competitions. A side whose seasons are all
    // in these is a national team, and the career strip is clubs only.
    private static readonly string[] InternationalPrefixes = ["fifa.", "uefa.", "conmebol.", "concacaf.", "caf.", "afc.", "ofc."];

    [GeneratedRegex(@"\bU-?\d{2}\b", RegexOptions.IgnoreCase)]
    private static partial Regex YouthSide();

    /// <summary>The team filter: every side the player has appeared for, and which one this response is about.</summary>
    public static (string? CurrentTeamId, IReadOnlyList<(string Id, string Name)> Teams) MapCareerTeams(JsonElement root)
    {
        var filter = root.Arr("filters").FirstOrDefault(f => f.Str("name") == "team");
        if (filter.ValueKind != JsonValueKind.Object) return (null, []);
        var teams = filter.Arr("options")
            .Select(o => (Id: o.Str("value") ?? "", Name: o.Str("displayValue") ?? ""))
            .Where(t => t.Id != "")
            .ToList();
        return (filter.Str("value"), teams);
    }

    /// <summary>
    /// One club's league seasons from a response filtered to that club. Null for a national side
    /// (flagged by ESPN, or a youth side by name, or only international competitions).
    /// A club ESPN has no numbers for comes back with no seasons, so it can still appear in the strip.
    /// </summary>
    public static CareerClub? MapCareerClub(JsonElement? response, string teamId, string teamName, bool current)
    {
        JsonElement? team = null;
        if (response?.Get("teams") is { ValueKind: JsonValueKind.Object } teams)
            foreach (var t in teams.EnumerateObject())
                if (t.Value.Str("id") == teamId) { team = t.Value; break; }

        if (team is { } found ? found.Bool("isNational") : YouthSide().IsMatch(teamName)) return null;

        var seasons = new List<CareerSeason>();
        var international = 0;
        if (response is { } root && root.Arr("categories").FirstOrDefault() is { ValueKind: JsonValueKind.Object } cat)
        {
            var names = cat.Arr("names").Select(n => n.GetString() ?? "").ToList();
            int starts = names.IndexOf("STRT"), goals = names.IndexOf("G"), assists = names.IndexOf("A");

            foreach (var s in cat.Arr("statistics"))
            {
                if (s.Str("teamId") is { } sid && sid != teamId) continue;
                var slug = s.Str("leagueSlug") ?? "";
                if (InternationalPrefixes.Any(p => slug.StartsWith(p, StringComparison.OrdinalIgnoreCase)))
                {
                    international++;
                    continue;
                }
                var league = root.Get("leagues", slug);
                if (league is { } l && l.Bool("isTournament")) continue; // cups: the table is league only

                var values = s.Arr("stats").Select(v => v.ValueKind == JsonValueKind.String ? v.GetString() : v.GetRawText()).ToList();
                int V(int i) => i >= 0 && i < values.Count && int.TryParse(values[i], NumberStyles.Integer, CultureInfo.InvariantCulture, out var n) ? n : 0;

                var year = s.Int("season", "year") ?? 0;
                seasons.Add(new CareerSeason(
                    year,
                    s.Str("season", "abbreviation") ?? year.ToString(CultureInfo.InvariantCulture),
                    league?.Str("displayName") ?? league?.Str("name") ?? slug,
                    V(starts), V(goals), V(assists)));
            }
        }
        if (seasons.Count == 0 && international > 0) return null;

        return new CareerClub(
            teamId,
            team?.Str("displayName") ?? teamName,
            Hex(team?.Str("color")),
            current,
            seasons.OrderByDescending(s => s.Year).ToList());
    }

    /// <summary>
    /// Oldest club first. ESPN gives no transfer dates, so clubs are ordered by their first season;
    /// clubs with no seasons (usually early ones in smaller leagues) go at the start.
    /// </summary>
    public static IReadOnlyList<CareerClub> OrderCareer(IEnumerable<CareerClub> clubs) =>
        clubs.OrderBy(c => c.Seasons.Count == 0 ? int.MinValue : c.Seasons.Min(s => s.Year))
            .ThenBy(c => c.Current)
            .ToList();
}
