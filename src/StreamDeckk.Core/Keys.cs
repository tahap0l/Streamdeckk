namespace StreamDeckk.Core;

/// <summary>"ctrl+shift+m", "f13", "numpad1" gibi kısayolları Windows sanal tuş kodlarına çevirir.</summary>
public static class Keys
{
    static readonly Dictionary<string, ushort> Vk = Build();

    static readonly Dictionary<string, string> Aliases = new()
    {
        ["control"] = "ctrl", ["cmd"] = "win", ["meta"] = "win", ["super"] = "win", ["escape"] = "esc",
        ["return"] = "enter", ["del"] = "delete", ["ins"] = "insert", ["pgup"] = "pageup", ["pgdn"] = "pagedown",
        ["arrowup"] = "up", ["arrowdown"] = "down", ["arrowleft"] = "left", ["arrowright"] = "right",
    };

    static readonly HashSet<string> Modifiers = new() { "ctrl", "shift", "alt", "win", "rctrl", "rshift", "ralt" };

    // Windows'ta KEYEVENTF_EXTENDEDKEY bayrağı gerektiren tuşlar
    static readonly HashSet<ushort> Extended = new()
    {
        0xa3, 0xa5, 0x5b, 0x5c, 0x5d, 0x2d, 0x2e, 0x24, 0x23, 0x21, 0x22,
        0x26, 0x28, 0x25, 0x27, 0x90, 0x6f, 0x2c,
        0xad, 0xae, 0xaf, 0xb0, 0xb1, 0xb2, 0xb3,
    };

    static Dictionary<string, ushort> Build()
    {
        var d = new Dictionary<string, ushort>
        {
            ["ctrl"] = 0xa2, ["shift"] = 0xa0, ["alt"] = 0xa4, ["win"] = 0x5b,
            ["rctrl"] = 0xa3, ["rshift"] = 0xa1, ["ralt"] = 0xa5,
            ["space"] = 0x20, ["enter"] = 0x0d, ["tab"] = 0x09, ["esc"] = 0x1b, ["backspace"] = 0x08,
            ["delete"] = 0x2e, ["insert"] = 0x2d, ["home"] = 0x24, ["end"] = 0x23, ["pageup"] = 0x21, ["pagedown"] = 0x22,
            ["up"] = 0x26, ["down"] = 0x28, ["left"] = 0x25, ["right"] = 0x27,
            ["printscreen"] = 0x2c, ["pause"] = 0x13, ["capslock"] = 0x14, ["numlock"] = 0x90, ["scrolllock"] = 0x91, ["menu"] = 0x5d,
            ["semicolon"] = 0xba, ["equal"] = 0xbb, ["comma"] = 0xbc, ["minus"] = 0xbd, ["period"] = 0xbe, ["slash"] = 0xbf,
            ["backquote"] = 0xc0, ["bracketleft"] = 0xdb, ["backslash"] = 0xdc, ["bracketright"] = 0xdd, ["quote"] = 0xde,
            ["intlbackslash"] = 0xe2,
            ["numpadmultiply"] = 0x6a, ["numpadadd"] = 0x6b, ["numpadsubtract"] = 0x6d, ["numpaddecimal"] = 0x6e, ["numpaddivide"] = 0x6f,
            ["volumemute"] = 0xad, ["volumedown"] = 0xae, ["volumeup"] = 0xaf,
            ["medianext"] = 0xb0, ["mediaprev"] = 0xb1, ["mediastop"] = 0xb2, ["mediaplaypause"] = 0xb3,
        };
        for (var i = 0; i < 26; i++) d[((char)('a' + i)).ToString()] = (ushort)(0x41 + i);
        for (var i = 0; i <= 9; i++)
        {
            d[i.ToString()] = (ushort)(0x30 + i);
            d["numpad" + i] = (ushort)(0x60 + i);
        }
        for (var i = 1; i <= 24; i++) d["f" + i] = (ushort)(0x6f + i);
        return d;
    }

    public static bool IsExtended(ushort vk) => Extended.Contains(vk);

    /// <summary>Kısayolu çözümler; değiştiriciler önce gelir. Geçersizse <see cref="ActionException"/> fırlatır.</summary>
    public static List<ushort> Parse(string? combo)
    {
        if (string.IsNullOrWhiteSpace(combo)) throw new ActionException("Kısayol boş");
        var parts = combo.Split('+')
            .Select(p => new string(p.Where(c => !char.IsWhiteSpace(c)).ToArray()).ToLowerInvariant())
            .Where(p => p.Length > 0)
            .Select(p => Aliases.TryGetValue(p, out var a) ? a : p)
            .ToList();
        if (parts.Count == 0) throw new ActionException("Kısayol boş");
        var mods = new List<ushort>();
        var keys = new List<ushort>();
        foreach (var p in parts)
        {
            if (!Vk.TryGetValue(p, out var code)) throw new ActionException($"Bilinmeyen tuş: \"{p}\"");
            (Modifiers.Contains(p) ? mods : keys).Add(code);
        }
        mods.AddRange(keys);
        return mods;
    }
}

/// <summary>Kullanıcıya gösterilecek, beklenen aksiyon hatası.</summary>
public sealed class ActionException(string message) : Exception(message);
