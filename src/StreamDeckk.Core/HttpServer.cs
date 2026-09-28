using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;

namespace StreamDeckk.Core;

public sealed class HttpRequest
{
    public required string Method { get; init; }
    public required string Path { get; init; }
    public required Dictionary<string, string> Query { get; init; }
    public required Dictionary<string, string> Headers { get; init; }
    public required IPAddress Remote { get; init; }
    public byte[] Body { get; set; } = Array.Empty<byte>();

    public string? Header(string name) => Headers.TryGetValue(name, out var v) ? v : null;
    public string? Q(string name) => Query.TryGetValue(name, out var v) ? v : null;
}

public sealed class HttpResponse
{
    public int Status { get; init; } = 200;
    public string ContentType { get; init; } = "application/json; charset=utf-8";
    public byte[] Body { get; init; } = Array.Empty<byte>();
    public Dictionary<string, string> Headers { get; } = new();

    public static HttpResponse Json(object data, int status = 200) =>
        new() { Status = status, Body = System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(data, Core.Json.Web) };

    public static HttpResponse Error(int status, string message) => Json(new { error = message }, status);

    public static HttpResponse Html(int status, string html) =>
        new() { Status = status, ContentType = "text/html; charset=utf-8", Body = Encoding.UTF8.GetBytes(html) };
}

/// <summary>
/// Küçük HTTP/1.1 + WebSocket sunucusu. Windows'ta http.sys (URL ACL/yönetici izni) gerektirmemek için
/// doğrudan TCP üzerinde çalışır. Her istekten sonra bağlantı kapatılır.
/// </summary>
public sealed class HttpServer
{
    const int MaxHeader = 32 * 1024;
    readonly TcpListener _listener;
    readonly Func<HttpRequest, Task<HttpResponse>> _handler;
    readonly Func<HttpRequest, int> _bodyLimit;
    readonly Func<HttpRequest, WebSocket, Task> _onWebSocket;
    readonly CancellationTokenSource _cts = new();

    public int Port { get; }

    public HttpServer(int port, Func<HttpRequest, Task<HttpResponse>> handler, Func<HttpRequest, int> bodyLimit,
        Func<HttpRequest, WebSocket, Task> onWebSocket)
    {
        Port = port;
        _handler = handler;
        _bodyLimit = bodyLimit;
        _onWebSocket = onWebSocket;
        _listener = new TcpListener(IPAddress.Any, port) { ExclusiveAddressUse = true };
    }

    /// <summary>Portu dinlemeye başlar. Port doluysa <see cref="SocketException"/> fırlatır.</summary>
    public void Start()
    {
        _listener.Start(128);
        _ = AcceptLoop();
    }

    public void Stop()
    {
        _cts.Cancel();
        try { _listener.Stop(); } catch { }
    }

    async Task AcceptLoop()
    {
        while (!_cts.IsCancellationRequested)
        {
            TcpClient client;
            try { client = await _listener.AcceptTcpClientAsync(_cts.Token); }
            catch (OperationCanceledException) { return; }
            catch (ObjectDisposedException) { return; }
            catch (SocketException) { continue; }
            _ = Task.Run(() => HandleClient(client));
        }
    }

    async Task HandleClient(TcpClient client)
    {
        using var _ = client;
        client.NoDelay = true;
        var stream = client.GetStream();
        try
        {
            using var headerTimeout = CancellationTokenSource.CreateLinkedTokenSource(_cts.Token);
            headerTimeout.CancelAfter(TimeSpan.FromSeconds(15));
            var (req, leftover) = await ReadHead(stream, (IPEndPoint)client.Client.RemoteEndPoint!, headerTimeout.Token);
            if (req == null) return;

            if (req.Method == "GET" && req.Header("upgrade")?.Equals("websocket", StringComparison.OrdinalIgnoreCase) == true)
            {
                await UpgradeWebSocket(stream, req);
                return;
            }

            var limit = _bodyLimit(req);
            if (req.Header("transfer-encoding") != null) { await Write(stream, HttpResponse.Error(411, "Content-Length gerekli")); return; }
            var len = long.TryParse(req.Header("content-length"), out var l) ? l : 0;
            if (len > limit) { await Write(stream, HttpResponse.Error(413, "Dosya çok büyük")); return; }
            if (len > 0) req.Body = await ReadBody(stream, leftover, (int)len, headerTimeout.Token);

            HttpResponse resp;
            try { resp = await _handler(req); }
            catch (Exception e)
            {
                Log.Info($"İstek hatası {req.Method} {req.Path}: {e.Message}");
                resp = HttpResponse.Error(e is System.Text.Json.JsonException ? 400 : 500, e.Message);
            }
            await Write(stream, resp);
        }
        catch (OperationCanceledException) { }
        catch (IOException) { }
        catch (Exception e) { Log.Info("Bağlantı hatası: " + e.Message); }
    }

    static async Task<(HttpRequest?, byte[])> ReadHead(NetworkStream stream, IPEndPoint remote, CancellationToken ct)
    {
        var buf = new byte[MaxHeader];
        var filled = 0;
        var end = -1;
        while (end < 0)
        {
            if (filled == buf.Length) return (null, Array.Empty<byte>());
            var n = await stream.ReadAsync(buf.AsMemory(filled), ct);
            if (n == 0) return (null, Array.Empty<byte>());
            var searchFrom = Math.Max(0, filled - 3);
            filled += n;
            end = buf.AsSpan(searchFrom, filled - searchFrom).IndexOf("\r\n\r\n"u8);
            if (end >= 0) end += searchFrom;
        }
        var head = Encoding.UTF8.GetString(buf, 0, end);
        var leftover = buf.AsSpan(end + 4, filled - end - 4).ToArray();
        var lines = head.Split("\r\n");
        var first = lines[0].Split(' ');
        if (first.Length < 3) return (null, leftover);

        var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var line in lines.Skip(1))
        {
            var i = line.IndexOf(':');
            if (i > 0) headers[line[..i].Trim()] = line[(i + 1)..].Trim();
        }
        var target = first[1];
        var q = target.IndexOf('?');
        var path = Uri.UnescapeDataString(q >= 0 ? target[..q] : target);
        var query = new Dictionary<string, string>();
        if (q >= 0)
        {
            foreach (var part in target[(q + 1)..].Split('&', StringSplitOptions.RemoveEmptyEntries))
            {
                var eq = part.IndexOf('=');
                var k = Uri.UnescapeDataString((eq >= 0 ? part[..eq] : part).Replace('+', ' '));
                var v = eq >= 0 ? Uri.UnescapeDataString(part[(eq + 1)..].Replace('+', ' ')) : "";
                query[k] = v;
            }
        }
        var addr = remote.Address.IsIPv4MappedToIPv6 ? remote.Address.MapToIPv4() : remote.Address;
        return (new HttpRequest { Method = first[0].ToUpperInvariant(), Path = path, Query = query, Headers = headers, Remote = addr }, leftover);
    }

    static async Task<byte[]> ReadBody(NetworkStream stream, byte[] leftover, int len, CancellationToken ct)
    {
        var body = new byte[len];
        var have = Math.Min(len, leftover.Length);
        Array.Copy(leftover, body, have);
        using var bodyTimeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        bodyTimeout.CancelAfter(TimeSpan.FromMinutes(2));
        while (have < len)
        {
            var n = await stream.ReadAsync(body.AsMemory(have), bodyTimeout.Token);
            if (n == 0) throw new IOException("Bağlantı erken kapandı");
            have += n;
        }
        return body;
    }

    static string Reason(int status) => status switch
    {
        101 => "Switching Protocols", 200 => "OK", 302 => "Found", 400 => "Bad Request", 403 => "Forbidden",
        404 => "Not Found", 411 => "Length Required", 413 => "Payload Too Large", 500 => "Internal Server Error", _ => "Status",
    };

    static async Task Write(NetworkStream stream, HttpResponse r)
    {
        var sb = new StringBuilder();
        sb.Append($"HTTP/1.1 {r.Status} {Reason(r.Status)}\r\n");
        sb.Append($"Content-Type: {r.ContentType}\r\n");
        sb.Append($"Content-Length: {r.Body.Length}\r\n");
        sb.Append("Cache-Control: no-store\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\n");
        foreach (var (k, v) in r.Headers) sb.Append($"{k}: {v}\r\n");
        sb.Append("\r\n");
        await stream.WriteAsync(Encoding.UTF8.GetBytes(sb.ToString()));
        if (r.Body.Length > 0) await stream.WriteAsync(r.Body);
        await stream.FlushAsync();
    }

    async Task UpgradeWebSocket(NetworkStream stream, HttpRequest req)
    {
        var key = req.Header("sec-websocket-key");
        if (string.IsNullOrEmpty(key)) { await Write(stream, HttpResponse.Error(400, "WebSocket anahtarı yok")); return; }
        var accept = Convert.ToBase64String(SHA1.HashData(Encoding.ASCII.GetBytes(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")));
        var head = "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
                   $"Sec-WebSocket-Accept: {accept}\r\n\r\n";
        await stream.WriteAsync(Encoding.ASCII.GetBytes(head));
        using var ws = WebSocket.CreateFromStream(stream, new WebSocketCreationOptions
        {
            IsServer = true,
            KeepAliveInterval = TimeSpan.FromSeconds(15),
        });
        await _onWebSocket(req, ws);
    }
}
