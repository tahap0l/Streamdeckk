namespace StreamDeckk.Core;

/// <summary>PC üzerinde aksiyonları gerçekleştiren katman (Windows'ta gerçek, geliştirmede simülasyon).</summary>
public interface IPlatform
{
    /// <summary>Panelde gösterilen durum: "ready", "simulated" ya da "error".</summary>
    string Status { get; }
    string? StatusError { get; }

    Task SendHotkeyAsync(IReadOnlyList<ushort> virtualKeys);
    Task TypeTextAsync(string text, bool pressEnter);
    /// <param name="volume">0..1</param>
    Task PlaySoundAsync(string path, float volume);
    Task StopSoundsAsync();

    void OpenUrl(string url);
    void OpenFolder(string path);
}

/// <summary>Windows dışı sistemlerde: aksiyonları yalnızca günlüğe yazar.</summary>
public sealed class SimulatedPlatform : IPlatform
{
    public string Status => "simulated";
    public string? StatusError => null;

    public Task SendHotkeyAsync(IReadOnlyList<ushort> vks)
    {
        Log.Info("[simülasyon] kısayol " + string.Join("+", vks.Select(v => "0x" + v.ToString("x"))));
        return Task.CompletedTask;
    }

    public Task TypeTextAsync(string text, bool enter)
    {
        Log.Info($"[simülasyon] metin \"{text}\"{(enter ? " +Enter" : "")}");
        return Task.CompletedTask;
    }

    public Task PlaySoundAsync(string path, float volume)
    {
        Log.Info($"[simülasyon] ses {Path.GetFileName(path)} seviye {volume:0.00}");
        return Task.CompletedTask;
    }

    public Task StopSoundsAsync()
    {
        Log.Info("[simülasyon] sesler durduruldu");
        return Task.CompletedTask;
    }

    public void OpenUrl(string url) => Log.Info("[simülasyon] tarayıcıda aç: " + url);
    public void OpenFolder(string path) => Log.Info("[simülasyon] klasörü aç: " + path);
}
