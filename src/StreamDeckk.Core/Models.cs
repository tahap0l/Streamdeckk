using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace StreamDeckk.Core;

public sealed class DeckConfig
{
    public int Version { get; set; } = 2;
    public string Token { get; set; } = "";
    public int Port { get; set; } = 7373;
    public GridSize Grid { get; set; } = new();
    public int Volume { get; set; } = 80;
    public List<Page> Pages { get; set; } = new();
}

public sealed class GridSize
{
    public int Cols { get; set; } = 3;
    public int Rows { get; set; } = 5;
}

public sealed class Page
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public List<DeckButton?> Buttons { get; set; } = new();
}

public sealed class DeckButton
{
    public string Id { get; set; } = "";
    public string Emoji { get; set; } = "";
    public string Label { get; set; } = "";
    public string Type { get; set; } = "normal";
    public DeckAction Action { get; set; } = new();
    public string? OnEmoji { get; set; }
    public string? OnLabel { get; set; }
    public DeckAction? OffAction { get; set; }
}

public sealed class DeckAction
{
    public string Kind { get; set; } = "none";
    public string? Keys { get; set; }
    public string? Text { get; set; }
    public bool? Enter { get; set; }
    public string? Sound { get; set; }
    public int? Volume { get; set; }
    public string? PageId { get; set; }
}

public static class Json
{
    /// <summary>Tarayıcıyla konuşurken: camelCase, boş alanlar yazılmaz, emojiler kaçışsız.</summary>
    public static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    public static readonly JsonSerializerOptions File = new(Web) { WriteIndented = true };
}
