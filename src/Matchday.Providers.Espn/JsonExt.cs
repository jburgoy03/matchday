using System.Globalization;
using System.Text.Json;

namespace Matchday.Providers.Espn;

internal static class JsonExt
{
    public static JsonElement? Get(this JsonElement e, params string[] path)
    {
        var cur = e;
        foreach (var p in path)
        {
            if (cur.ValueKind != JsonValueKind.Object || !cur.TryGetProperty(p, out var next)) return null;
            cur = next;
        }
        return cur.ValueKind == JsonValueKind.Null ? null : cur;
    }

    public static string? Str(this JsonElement e, params string[] path)
    {
        var v = e.Get(path);
        if (v is null) return null;
        return v.Value.ValueKind switch
        {
            JsonValueKind.String => v.Value.GetString(),
            JsonValueKind.Number => v.Value.GetRawText(),
            _ => null
        };
    }

    public static int? Int(this JsonElement e, params string[] path)
    {
        var v = e.Get(path);
        if (v is null) return null;
        if (v.Value.ValueKind == JsonValueKind.Number)
            return v.Value.TryGetInt32(out var i) ? i : (int)Math.Round(v.Value.GetDouble());
        if (v.Value.ValueKind == JsonValueKind.String &&
            double.TryParse(v.Value.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var d))
            return (int)Math.Round(d);
        return null;
    }

    public static bool Bool(this JsonElement e, params string[] path)
        => e.Get(path) is { ValueKind: JsonValueKind.True };

    public static IEnumerable<JsonElement> Arr(this JsonElement e, params string[] path)
    {
        var v = e.Get(path);
        if (v is { ValueKind: JsonValueKind.Array })
            foreach (var x in v.Value.EnumerateArray()) yield return x;
    }
}
