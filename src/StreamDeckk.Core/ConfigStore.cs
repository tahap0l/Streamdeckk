using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace StreamDeckk.Core;

public static partial class ConfigStore
{
    public static string DataDir { get; } = ResolveDataDir();
    public static string SoundsDir => Path.Combine(DataDir, "sesler");
    public static string ConfigFile => Path.Combine(DataDir, "config.json");

    static readonly string[] ActionKinds = { "none", "hotkey", "text", "sound", "stopSounds", "volumeUp", "volumeDown", "page" };

    [GeneratedRegex(@"\.(mp3|wav|wma|m4a|aac)$", RegexOptions.IgnoreCase)]
    private static partial Regex SoundExt();

    [GeneratedRegex(@"^[a-z0-9]{4,20}$", RegexOptions.IgnoreCase)]
    private static partial Regex IdPattern();

    static string ResolveDataDir()
    {
        var env = Environment.GetEnvironmentVariable("STREAMDECKK_DATA");
        if (!string.IsNullOrEmpty(env)) return Path.GetFullPath(env);
        return OperatingSystem.IsWindows()
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "StreamDeckk")
            : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".streamdeckk");
    }

    public static string NewId() => Convert.ToHexString(RandomNumberGenerator.GetBytes(5)).ToLowerInvariant();
    public static string NewToken() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(18)).Replace('+', '-').Replace('/', '_').TrimEnd('=');

    // ---------- Yükle / kaydet ----------
    public static DeckConfig Load()
    {
        Directory.CreateDirectory(SoundsDir);
        DeckConfig? cfg = null;
        if (File.Exists(ConfigFile))
        {
            try
            {
                var loaded = JsonSerializer.Deserialize<DeckConfig>(File.ReadAllText(ConfigFile), Json.File);
                if (loaded != null)
                {
                    loaded.Grid ??= new GridSize();
                    loaded.Pages ??= new List<Page>();
                    cfg = Sanitize(loaded, loaded);
                    cfg.Token = string.IsNullOrWhiteSpace(loaded.Token) ? NewToken() : loaded.Token;
                }
            }
            catch (Exception e)
            {
                // Bozuk dosyayı kaybetme: yedeğini al, varsayılanla devam et
                var backup = ConfigFile + ".bozuk-" + DateTime.Now.ToString("yyyyMMdd-HHmmss");
                try { File.Copy(ConfigFile, backup, true); } catch { }
                Log.Info($"config.json okunamadı ({e.Message}); yedeği: {backup}");
            }
        }
        if (cfg == null)
        {
            cfg = DefaultConfig();
            Samples.WriteAll(SoundsDir);
        }
        Save(cfg);
        return cfg;
    }

    public static void Save(DeckConfig cfg)
    {
        Directory.CreateDirectory(DataDir);
        var tmp = ConfigFile + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(cfg, Json.File));
        File.Move(tmp, ConfigFile, true);
    }

    // ---------- Varsayılan ----------
    static DeckButton Btn(string emoji, string label, DeckAction action) =>
        new() { Id = NewId(), Emoji = emoji, Label = label, Action = action };

    static DeckButton Toggle(string emoji, string label, string keys, string onEmoji, string onLabel) =>
        new() { Id = NewId(), Emoji = emoji, Label = label, Type = "toggle", Action = Hotkey(keys), OnEmoji = onEmoji, OnLabel = onLabel };

    static DeckAction Hotkey(string k) => new() { Kind = "hotkey", Keys = k };
    static DeckAction Sound(string s, int v) => new() { Kind = "sound", Sound = s, Volume = v };
    static DeckAction Kind(string k) => new() { Kind = k };
    static DeckAction GoTo(string id) => new() { Kind = "page", PageId = id };
    static DeckAction Text(string t) => new() { Kind = "text", Text = t, Enter = true };

    public static DeckConfig DefaultConfig()
    {
        const int n = 15;
        List<DeckButton?> Pad(params DeckButton?[] b) => b.Concat(Enumerable.Repeat<DeckButton?>(null, n)).Take(n).ToList();
        var yayin = new Page { Id = NewId(), Name = "Yayın" };
        var sesler = new Page { Id = NewId(), Name = "Sesler" };
        var mesajlar = new Page { Id = NewId(), Name = "Mesajlar" };
        yayin.Buttons = Pad(
            Toggle("🎙️", "Mikrofon", "f13", "🔇", "Mikrofon Kapalı"),
            Toggle("📷", "Kamera", "f14", "🚫", "Kamera Kapalı"),
            Toggle("⏸️", "Mola", "f15", "▶️", "Mola Bitti"),
            Btn("🎬", "Sahne 1", Hotkey("f16")),
            Btn("🎮", "Sahne 2", Hotkey("f17")),
            Btn("💬", "Sahne 3", Hotkey("f18")),
            Btn("🔔", "Ding", Sound("ding.wav", 100)),
            Btn("🎉", "Tada", Sound("tada.wav", 100)),
            Btn("📯", "Korna", Sound("korna.wav", 80)),
            Btn("🤐", "Sansür", Sound("sansur-bip.wav", 70)),
            Btn("⏹️", "Sesleri Durdur", Kind("stopSounds")),
            null,
            Btn("🔉", "Ses −", Kind("volumeDown")),
            Btn("🔊", "Ses +", Kind("volumeUp")),
            Btn("🎵", "Sesler", GoTo(sesler.Id)));
        sesler.Buttons = Pad(
            Btn("🔔", "Ding", Sound("ding.wav", 100)),
            Btn("🎉", "Tada", Sound("tada.wav", 100)),
            Btn("📯", "Korna", Sound("korna.wav", 80)),
            Btn("🤐", "Sansür", Sound("sansur-bip.wav", 70)),
            null, null, null, null, null, null, null, null,
            Btn("⏹️", "Durdur", Kind("stopSounds")),
            Btn("💬", "Mesajlar", GoTo(mesajlar.Id)),
            Btn("🏠", "Yayın", GoTo(yayin.Id)));
        mesajlar.Buttons = Pad(
            Btn("💜", "Takip", Text("Takip etmeyi unutmayın! 💜")),
            Btn("👋", "Hoş geldin", Text("Yayına hoş geldiniz! 👋")),
            Btn("🎁", "Teşekkür", Text("Hediyeler için çok teşekkürler! 🎁")),
            null, null, null, null, null, null, null, null, null, null, null,
            Btn("🏠", "Yayın", GoTo(yayin.Id)));
        return new DeckConfig { Token = NewToken(), Pages = { yayin, sesler, mesajlar } };
    }

    // ---------- Doğrulama ----------
    static int Clamp(int? v, int min, int max, int def) => v is int i ? Math.Clamp(i, min, max) : def;

    /// <summary>Uzun metni emoji/vekil çiftlerini bölmeden kısaltır.</summary>
    static string Clip(string? s, int max)
    {
        if (string.IsNullOrEmpty(s)) return "";
        if (s.Length <= max) return s;
        var cut = char.IsHighSurrogate(s[max - 1]) ? max - 1 : max;
        return s[..cut];
    }

    static string SafeId(string? id) => id != null && IdPattern().IsMatch(id) ? id : NewId();

    static DeckAction SanitizeAction(DeckAction? a)
    {
        if (a == null || !ActionKinds.Contains(a.Kind)) return new DeckAction();
        return a.Kind switch
        {
            "hotkey" => new DeckAction { Kind = "hotkey", Keys = Clip(a.Keys, 100) },
            "text" => new DeckAction { Kind = "text", Text = Clip(a.Text, 2000), Enter = a.Enter == true },
            "sound" => new DeckAction { Kind = "sound", Sound = SafeBaseName(a.Sound), Volume = Clamp(a.Volume, 0, 100, 100) },
            "page" => new DeckAction { Kind = "page", PageId = Clip(a.PageId, 40) },
            _ => new DeckAction { Kind = a.Kind },
        };
    }

    static DeckButton? SanitizeButton(DeckButton? b)
    {
        if (b == null) return null;
        var o = new DeckButton
        {
            Id = SafeId(b.Id),
            Emoji = Clip(b.Emoji, 16),
            Label = Clip(b.Label, 40),
            Type = b.Type == "toggle" ? "toggle" : "normal",
            Action = SanitizeAction(b.Action),
        };
        if (o.Type == "toggle")
        {
            o.OnEmoji = Clip(b.OnEmoji, 16);
            o.OnLabel = Clip(b.OnLabel, 40);
            if (b.OffAction != null) o.OffAction = SanitizeAction(b.OffAction);
        }
        return o;
    }

    /// <summary>Panelden gelen yapılandırmayı doğrular. Token her zaman mevcut değerden korunur.</summary>
    public static DeckConfig Sanitize(DeckConfig input, DeckConfig current)
    {
        var cols = Clamp(input.Grid?.Cols, 2, 8, current.Grid.Cols);
        var rows = Clamp(input.Grid?.Rows, 2, 10, current.Grid.Rows);
        var n = cols * rows;
        var pages = (input.Pages ?? current.Pages).Take(50).Select(p =>
        {
            var buttons = (p?.Buttons ?? new()).Take(n).Select(SanitizeButton).ToList();
            while (buttons.Count < n) buttons.Add(null);
            return new Page { Id = SafeId(p?.Id), Name = Clip(p?.Name, 40) is { Length: > 0 } nm ? nm : "Sayfa", Buttons = buttons };
        }).ToList();
        if (pages.Count == 0) pages.Add(new Page { Id = NewId(), Name = "Sayfa 1", Buttons = Enumerable.Repeat<DeckButton?>(null, n).ToList() });
        return new DeckConfig
        {
            Version = 2,
            Token = current.Token,
            Port = Clamp(input.Port, 1024, 65535, current.Port),
            Grid = new GridSize { Cols = cols, Rows = rows },
            Volume = Clamp(input.Volume, 0, 100, current.Volume),
            Pages = pages,
        };
    }

    // ---------- Sesler ----------
    static string SafeBaseName(string? name)
    {
        if (string.IsNullOrEmpty(name)) return "";
        var i = name.LastIndexOfAny(new[] { '/', '\\' });
        return Clip(i >= 0 ? name[(i + 1)..] : name, 200);
    }

    /// <summary>Yüklenen dosya adını güvenli hale getirir; desteklenmeyen biçimde null döner.</summary>
    public static string? SafeSoundName(string? name)
    {
        var b = SafeBaseName(name);
        b = new string(b.Select(c => char.IsLetterOrDigit(c) || c is '.' or '_' or ' ' or '-' ? c : '_').ToArray());
        if (b.Length > 100) b = b[^100..];
        if (b.StartsWith('.') || !SoundExt().IsMatch(b)) return null;
        return b;
    }

    public static List<SoundInfo> ListSounds()
    {
        Directory.CreateDirectory(SoundsDir);
        return Directory.EnumerateFiles(SoundsDir)
            .Where(f => SoundExt().IsMatch(f))
            .Select(f => new SoundInfo(Path.GetFileName(f), new FileInfo(f).Length))
            .OrderBy(s => s.Name, StringComparer.Create(new System.Globalization.CultureInfo("tr-TR"), true))
            .ToList();
    }
}

public sealed record SoundInfo(string Name, long Size);
