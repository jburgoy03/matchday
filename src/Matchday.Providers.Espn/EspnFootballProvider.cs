using System.Globalization;
using System.Net;
using System.Text.Json;
using Matchday.Core.Providers;

namespace Matchday.Providers.Espn;

public sealed class EspnFootballProvider(HttpClient http) : IFootballProvider
{
    public const string BaseUrl = "https://site.api.espn.com/";
    private const string League = "eng.1";

    // ESPN rejects date ranges intermittently, so always one day per request.
    public async Task<IReadOnlyList<MatchSummary>> GetMatchesAsync(DateOnly date, CancellationToken ct = default)
    {
        var day = date.ToString("yyyyMMdd", CultureInfo.InvariantCulture);
        using var doc = await GetJsonAsync($"apis/site/v2/sports/soccer/{League}/scoreboard?dates={day}", nullOnMissing: false, ct);
        return EspnMapper.MapScoreboard(doc!.RootElement);
    }

    public async Task<MatchDetail?> GetMatchDetailAsync(string matchId, CancellationToken ct = default)
    {
        using var doc = await GetJsonAsync($"apis/site/v2/sports/soccer/{League}/summary?event={Uri.EscapeDataString(matchId)}", nullOnMissing: true, ct);
        return doc is null ? null : EspnMapper.MapSummary(doc.RootElement, matchId);
    }

    public async Task<IReadOnlyList<StandingRow>> GetStandingsAsync(CancellationToken ct = default)
    {
        using var doc = await GetJsonAsync($"apis/v2/sports/soccer/{League}/standings", nullOnMissing: false, ct);
        return EspnMapper.MapStandings(doc!.RootElement);
    }

    public async Task<IReadOnlyList<SquadPlayer>> GetSquadAsync(string teamId, CancellationToken ct = default)
    {
        using var doc = await GetJsonAsync($"apis/site/v2/sports/soccer/{League}/teams/{Uri.EscapeDataString(teamId)}/roster", nullOnMissing: true, ct);
        return doc is null ? [] : EspnMapper.MapRoster(doc.RootElement);
    }

    private async Task<JsonDocument?> GetJsonAsync(string path, bool nullOnMissing, CancellationToken ct)
    {
        using var resp = await http.GetAsync(path, ct);
        if (nullOnMissing && resp.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.BadRequest) return null;
        resp.EnsureSuccessStatusCode();
        await using var stream = await resp.Content.ReadAsStreamAsync(ct);
        return await JsonDocument.ParseAsync(stream, cancellationToken: ct);
    }
}