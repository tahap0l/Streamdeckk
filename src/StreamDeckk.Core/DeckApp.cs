using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using QRCoder;

namespace StreamDeckk.Core;

/// <summary>Sunucunun tamamı: kontrol paneli API'si, telefon WebSocket'i ve aksiyonların çalıştırılması.</summary>
public sealed partial class DeckApp
{
    public static readonly string Version =
        typeof(DeckApp).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion.Split('+')[0] ?? "2.0.0";

    readonly IPlatform _platform;
    readonly object _gate = new();
    readonly Dictionary<string, bool> _toggles = new();
    readonly List<Client> _clients = new();
    HttpServer? _server;
    DeckConfig _cfg;

    public int Port { get; private set; }
    public string PanelUrl => $"http://127.0.0.1:{Port}/admin/";

    DeckApp(IPlatform platform, DeckConfig cfg)
    {
        _platform = platform;
        _cfg = cfg;
        Port = cfg.Port;
    }

    public enum StartResult { Started, AlreadyRunning }

    /// <summary>
    /// Yapılandırmayı yükler ve sunucuyu başlatır. Aynı portta başka bir StreamDeckk çalışıyorsa
    /// <see cref="StartResult.AlreadyRunning"/> döner (ve onun paneli açılır).
    /// </summary>
    public static async Task<(StartResult, DeckApp?)> StartAsync(IPlatform platform)
    {
        var cfg = ConfigStore.Load();
        var app = new DeckApp(platform, cfg);
        for (var attempt = 0; ; attempt++)
        {
            var server = new HttpServer(app.Port, app.Handle, BodyLimit, app.OnWebSocket);
            try
            {
                server.Start();
                app._server = server;
                break;
            }
            catch (SocketException e) when (e.SocketErrorCode is SocketError.AddressAlreadyInUse or SocketError.AccessDenied && attempt < 10)
            {
                if (await IsStreamDeckk(app.Port))
                {
                    Log.Info("StreamDeckk zaten çalışıyor, kontrol paneli açılıyor.");
                    platform.OpenUrl($"http://127.0.0.1:{app.Port}/admin/");
                    return (StartResult.AlreadyRunning, null);
                }
                Log.Info($"Port {app.Port} başka bir program tarafından kullanılıyor, {app.Port + 1} deneniyor.");
                app.Port++;
            }
        }
        Log.Info($"StreamDeckk v{Version} hazır → kontrol paneli: {app.PanelUrl}");
        foreach (var a in NetInfo.GetAddresses()) Log.Info($"  {a.Kind,-7} {a.Name}: http://{a.Ip}:{app.Port}");
        return (StartResult.Started, app);
    }

    static async Task<bool> IsStreamDeckk(int port)
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
            var s = await http.GetStringAsync($"http://127.0.0.1:{port}/api/ping");
            return s.Contains("\"streamdeckk\"");
        }
        catch { return false; }
    }

    public void Stop() => _server?.Stop();

    object PublicConfig()
    {
        lock (_gate) return new { pages = _cfg.Pages, grid = _cfg.Grid, volume = _cfg.Volume };
    }

    void SaveConfig()
    {
        lock (_gate) ConfigStore.Save(_cfg);
    }

    // =====================================================================
    // HTTP
    // =====================================================================
    static int BodyLimit(HttpRequest r) => r.Path == "/api/sounds" ? 30_000_000 : 5_000_000;

    [GeneratedRegex(@"^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$", RegexOptions.IgnoreCase)]
    private static partial Regex LocalHost();

    static bool IsLocal(HttpRequest r) => IPAddress.IsLoopback(r.Remote) && LocalHost().IsMatch(r.Header("host") ?? "");

    async Task<HttpResponse> Handle(HttpRequest req)
    {
        if (req.Path.StartsWith("/api/")) return await HandleApi(req);
        if (req.Path == "/admin")
        {
            var r = new HttpResponse { Status = 302, ContentType = "text/plain" };
            r.Headers["Location"] = "/admin/";
            return r;
        }
        if (req.Path.StartsWith("/admin/"))
        {
            if (!IsLocal(req))
                return HttpResponse.Html(403, "<h1 style=\"font-family:sans-serif\">Kontrol paneli yalnızca bu bilgisayardan açılabilir.</h1>");
            return WebAssets.Serve(req.Path == "/admin/" ? "admin/index.html" : req.Path.TrimStart('/'));
        }
        if (req.Path == "/manifest.webmanifest") return Manifest(req.Q("t") ?? "");
        return WebAssets.Serve(req.Path == "/" ? "deck/index.html" : "deck" + req.Path);
    }

    static HttpResponse Manifest(string token) => new()
    {
        ContentType = "application/manifest+json",
        Body = JsonSerializer.SerializeToUtf8Bytes(new
        {
            name = "StreamDeckk",
            short_name = "StreamDeckk",
            display = "standalone",
            orientation = "portrait",
            background_color = "#07040c",
            theme_color = "#07040c",
            start_url = "/?t=" + Uri.EscapeDataString(token),
            scope = "/",
            icons = new[]
            {
                new { src = "/icons/icon-192.png", sizes = "192x192", type = "image/png" },
                new { src = "/icons/icon-512.png", sizes = "512x512", type = "image/png" },
            },
        }, Json.Web),
    };

    async Task<HttpResponse> HandleApi(HttpRequest req)
    {
        if (!IsLocal(req)) return HttpResponse.Error(403, "Kontrol paneli yalnızca bu bilgisayardan açılabilir");
        // Tarayıcıdaki başka sitelerin istek atmasını engelle (CSRF): değiştiren istekler özel başlık taşımalı
        if (req.Method != "GET" && req.Header("x-streamdeckk") != "1") return HttpResponse.Error(403, "Geçersiz istek");

        switch ($"{req.Method} {req.Path}")
        {
            case "GET /api/ping":
                return HttpResponse.Json(new { app = "streamdeckk", version = Version });

            case "GET /api/config":
                return HttpResponse.Json(PublicConfig());

            case "PUT /api/config":
            {
                var input = JsonSerializer.Deserialize<DeckConfig>(req.Body, Json.Web) ?? throw new JsonException("Boş yapılandırma");
                bool restart;
                lock (_gate)
                {
                    var prevPort = _cfg.Port;
                    _cfg = ConfigStore.Sanitize(input, _cfg);
                    restart = _cfg.Port != prevPort && _cfg.Port != Port;
                    ConfigStore.Save(_cfg);
                }
                _ = Broadcast(new { type = "config", config = PublicConfig() });
                return HttpResponse.Json(new { ok = true, config = PublicConfig(), restartNeeded = restart });
            }

            case "GET /api/status":
                int clients;
                lock (_clients) clients = _clients.Count;
                return HttpResponse.Json(new
                {
                    version = Version,
                    platform = OperatingSystem.IsWindows() ? "win32" : Environment.OSVersion.Platform.ToString(),
                    backend = _platform.Status,
                    backendError = _platform.StatusError,
                    clients,
                    dataDir = ConfigStore.DataDir,
                    port = Port,
                });

            case "GET /api/connect":
            {
                string token;
                lock (_gate) token = _cfg.Token;
                var addresses = NetInfo.GetAddresses().Select(a =>
                {
                    var url = $"http://{a.Ip}:{Port}/?t={token}";
                    return new { name = a.Name, ip = a.Ip, kind = a.Kind, url, qr = QrSvg(url) };
                }).ToList();
                return HttpResponse.Json(new { addresses, port = Port });
            }

            case "POST /api/token/regenerate":
                lock (_gate) _cfg.Token = ConfigStore.NewToken();
                SaveConfig();
                await CloseAll(4001, "eslestirme-sifirlandi");
                return HttpResponse.Json(new { ok = true });

            case "POST /api/test":
            {
                using var doc = JsonDocument.Parse(req.Body);
                var action = doc.RootElement.TryGetProperty("action", out var a) ? a.Deserialize<DeckAction>(Json.Web) : null;
                try
                {
                    var volume = await Run(action);
                    return HttpResponse.Json(new { ok = true, volume });
                }
                catch (ActionException e) { return HttpResponse.Error(400, e.Message); }
            }

            case "GET /api/sounds":
                return HttpResponse.Json(ConfigStore.ListSounds());

            case "POST /api/sounds":
            {
                var name = ConfigStore.SafeSoundName(req.Q("name"));
                if (name == null) return HttpResponse.Error(400, "Desteklenen biçimler: mp3, wav, wma, m4a, aac");
                await File.WriteAllBytesAsync(Path.Combine(ConfigStore.SoundsDir, name), req.Body);
                Log.Info("Ses yüklendi: " + name);
                return HttpResponse.Json(new { ok = true, name });
            }

            case "POST /api/open-folder":
                _platform.OpenFolder(ConfigStore.SoundsDir);
                return HttpResponse.Json(new { ok = true });
        }

        if (req.Method == "DELETE" && req.Path.StartsWith("/api/sounds/"))
        {
            var name = ConfigStore.SafeSoundName(req.Path["/api/sounds/".Length..]);
            if (name == null) return HttpResponse.Error(400, "Geçersiz ad");
            try { File.Delete(Path.Combine(ConfigStore.SoundsDir, name)); } catch { }
            return HttpResponse.Json(new { ok = true });
        }
        return HttpResponse.Error(404, "Bulunamadı");
    }

    static string QrSvg(string text)
    {
        using var gen = new QRCodeGenerator();
        using var data = gen.CreateQrCode(text, QRCodeGenerator.ECCLevel.M);
        return new SvgQRCode(data).GetGraphic(8, "#0b0612", "#ffffff", true, SvgQRCode.SizingMode.ViewBoxAttribute);
    }

    // =====================================================================
    // Aksiyonlar
    // =====================================================================
    /// <summary>Aksiyonu çalıştırır. Ses seviyesi değiştiyse yeni değeri döner.</summary>
    async Task<int?> Run(DeckAction? a)
    {
        a ??= new DeckAction();
        switch (a.Kind)
        {
            case "none":
            case "page":
                return null;
            case "hotkey":
                await _platform.SendHotkeyAsync(Keys.Parse(a.Keys));
                return null;
            case "text":
                if (string.IsNullOrEmpty(a.Text)) throw new ActionException("Yazılacak metin boş");
                await _platform.TypeTextAsync(a.Text, a.Enter == true);
                return null;
            case "sound":
            {
                if (string.IsNullOrEmpty(a.Sound)) throw new ActionException("Ses dosyası seçilmemiş");
                var file = Path.Combine(ConfigStore.SoundsDir, Path.GetFileName(a.Sound));
                if (!File.Exists(file)) throw new ActionException($"Ses dosyası yok: {a.Sound}");
                int master;
                lock (_gate) master = _cfg.Volume;
                await _platform.PlaySoundAsync(file, master / 100f * ((a.Volume ?? 100) / 100f));
                return null;
            }
            case "stopSounds":
                await _platform.StopSoundsAsync();
                return null;
            case "volumeUp":
            case "volumeDown":
            {
                int next;
                lock (_gate)
                {
                    next = Math.Clamp(_cfg.Volume + (a.Kind == "volumeUp" ? 10 : -10), 0, 100);
                    _cfg.Volume = next;
                    ConfigStore.Save(_cfg);
                }
                _ = Broadcast(new { type = "volume", volume = next });
                return next;
            }
            default:
                throw new ActionException("Bilinmeyen aksiyon");
        }
    }

    /// <summary>Beklenmeyen platform hatalarını da kullanıcıya gösterilebilir mesaja çevirir.</summary>
    async Task<(bool ok, string? error, int? volume)> TryRun(DeckAction? a)
    {
        try { return (true, null, await Run(a)); }
        catch (ActionException e) { return (false, e.Message, null); }
        catch (Exception e)
        {
            Log.Info("Aksiyon hatası: " + e);
            return (false, e.Message, null);
        }
    }

    // =====================================================================
    // WebSocket (telefon)
    // =====================================================================
    sealed class Client(WebSocket ws, string who)
    {
        public WebSocket Ws { get; } = ws;
        public string Who { get; } = who;
        public SemaphoreSlim SendLock { get; } = new(1, 1);
    }

    bool TokenOk(string? t)
    {
        string token;
        lock (_gate) token = _cfg.Token;
        var a = Encoding.UTF8.GetBytes(t ?? "");
        var b = Encoding.UTF8.GetBytes(token);
        return a.Length == b.Length && CryptographicOperations.FixedTimeEquals(a, b);
    }

    async Task OnWebSocket(HttpRequest req, WebSocket ws)
    {
        if (req.Path != "/ws" || !TokenOk(req.Q("t")))
        {
            try { await ws.CloseAsync((WebSocketCloseStatus)4001, "gecersiz-anahtar", CancellationToken.None); } catch { }
            return;
        }
        var client = new Client(ws, req.Remote.ToString());
        lock (_clients) _clients.Add(client);
        Log.Info("Cihaz bağlandı: " + client.Who);
        try
        {
            Dictionary<string, bool> toggles;
            lock (_gate) toggles = new(_toggles);
            await Send(client, new
            {
                type = "hello",
                version = Version,
                config = PublicConfig(),
                toggles,
                addresses = NetInfo.GetAddresses().Where(a => a.Kind != "virtual").Select(a => $"{a.Ip}:{Port}").ToList(),
            });

            var buf = new byte[64 * 1024];
            while (ws.State == WebSocketState.Open)
            {
                var len = 0;
                ValueWebSocketReceiveResult r;
                do
                {
                    if (len == buf.Length) { await ws.CloseAsync(WebSocketCloseStatus.MessageTooBig, "cok-buyuk", CancellationToken.None); return; }
                    r = await ws.ReceiveAsync(buf.AsMemory(len), CancellationToken.None);
                    len += r.Count;
                } while (!r.EndOfMessage && r.MessageType != WebSocketMessageType.Close);
                if (r.MessageType == WebSocketMessageType.Close) break;
                if (r.MessageType == WebSocketMessageType.Text) _ = OnMessage(client, Encoding.UTF8.GetString(buf, 0, len));
            }
        }
        catch (WebSocketException) { }
        catch (IOException) { }
        finally
        {
            lock (_clients) _clients.Remove(client);
            Log.Info("Cihaz ayrıldı: " + client.Who);
            if (ws.State == WebSocketState.CloseReceived)
            {
                try { await ws.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None); } catch { }
            }
        }
    }

    DeckButton? FindButton(string? pageId, string? buttonId)
    {
        lock (_gate)
        {
            var page = _cfg.Pages.FirstOrDefault(p => p.Id == pageId)
                       ?? _cfg.Pages.FirstOrDefault(p => p.Buttons.Any(b => b?.Id == buttonId));
            return page?.Buttons.FirstOrDefault(b => b?.Id == buttonId);
        }
    }

    async Task OnMessage(Client c, string text)
    {
        JsonElement msg;
        try { msg = JsonDocument.Parse(text).RootElement; } catch { return; }
        string? Str(string name) => msg.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        var type = Str("type");
        object? id = msg.TryGetProperty("id", out var idEl) ? idEl.Clone() : null;

        if (type == "ping") { await Send(c, new { type = "pong" }); return; }

        if (type == "toggle-flip")
        {
            var tb = FindButton(Str("pageId"), Str("buttonId"));
            if (tb?.Type != "toggle") return;
            lock (_gate) _toggles[tb.Id] = !_toggles.GetValueOrDefault(tb.Id);
            await BroadcastToggles();
            return;
        }

        if (type != "press") return;
        var b = FindButton(Str("pageId"), Str("buttonId"));
        if (b == null) { await Send(c, new { type = "result", id, ok = false, error = "Tuş bulunamadı" }); return; }

        bool isOn;
        lock (_gate) isOn = b.Type == "toggle" && _toggles.GetValueOrDefault(b.Id);
        var action = isOn && b.OffAction != null ? b.OffAction : b.Action;
        var (ok, error, volume) = await TryRun(action);
        if (ok && b.Type == "toggle")
        {
            lock (_gate) _toggles[b.Id] = !isOn;
            await BroadcastToggles();
        }
        if (!ok) Log.Info($"Tuş \"{b.Label}\" hatası: {error}");
        await Send(c, new { type = "result", id, ok, error, volume });
    }

    Task BroadcastToggles()
    {
        Dictionary<string, bool> t;
        lock (_gate) t = new(_toggles);
        return Broadcast(new { type = "toggles", toggles = t });
    }

    static async Task Send(Client c, object msg)
    {
        var data = JsonSerializer.SerializeToUtf8Bytes(msg, Json.Web);
        await c.SendLock.WaitAsync();
        try
        {
            if (c.Ws.State == WebSocketState.Open)
                await c.Ws.SendAsync(data, WebSocketMessageType.Text, true, CancellationToken.None);
        }
        catch { }
        finally { c.SendLock.Release(); }
    }

    Task Broadcast(object msg)
    {
        Client[] all;
        lock (_clients) all = _clients.ToArray();
        return Task.WhenAll(all.Select(c => Send(c, msg)));
    }

    async Task CloseAll(int code, string reason)
    {
        Client[] all;
        lock (_clients) all = _clients.ToArray();
        foreach (var c in all)
        {
            await c.SendLock.WaitAsync();
            try { await c.Ws.CloseOutputAsync((WebSocketCloseStatus)code, reason, CancellationToken.None); } catch { }
            finally { c.SendLock.Release(); }
        }
    }

    /// <summary>Simge tepsisinden "Tüm sesleri durdur".</summary>
    public Task StopSounds() => TryRun(new DeckAction { Kind = "stopSounds" });
}
