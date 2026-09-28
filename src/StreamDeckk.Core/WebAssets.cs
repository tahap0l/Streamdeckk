namespace StreamDeckk.Core;

/// <summary>Exe'ye gömülü telefon arayüzü ve kontrol paneli dosyalarını sunar.</summary>
public static class WebAssets
{
    static readonly Dictionary<string, string> Mime = new(StringComparer.OrdinalIgnoreCase)
    {
        [".html"] = "text/html; charset=utf-8",
        [".js"] = "text/javascript; charset=utf-8",
        [".css"] = "text/css; charset=utf-8",
        [".png"] = "image/png",
        [".svg"] = "image/svg+xml",
        [".ico"] = "image/x-icon",
        [".json"] = "application/json",
    };

    // Gömülü kaynak adları derleyen sisteme göre "\" ya da "/" içerebilir; "/" ile normalleştir
    static readonly Dictionary<string, string> Resources = typeof(WebAssets).Assembly.GetManifestResourceNames()
        .Where(n => n.StartsWith("web/") || n.StartsWith("web\\"))
        .ToDictionary(n => n[4..].Replace('\\', '/'), n => n, StringComparer.Ordinal);

    public static HttpResponse Serve(string relPath)
    {
        if (!Resources.TryGetValue(relPath, out var res)) return HttpResponse.Error(404, "Bulunamadı");
        using var s = typeof(WebAssets).Assembly.GetManifestResourceStream(res)!;
        using var ms = new MemoryStream();
        s.CopyTo(ms);
        return new HttpResponse
        {
            ContentType = Mime.GetValueOrDefault(Path.GetExtension(relPath), "application/octet-stream"),
            Body = ms.ToArray(),
        };
    }
}
