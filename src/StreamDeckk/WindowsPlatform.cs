using System.Diagnostics;
using StreamDeckk.Core;

namespace StreamDeckk;

sealed class WindowsPlatform : IPlatform
{
    public string Status => "ready";
    public string? StatusError => null;

    public Task SendHotkeyAsync(IReadOnlyList<ushort> vks) => WinInput.HotkeyAsync(vks);
    public Task TypeTextAsync(string text, bool enter) => WinInput.TypeAsync(text, enter);
    public Task PlaySoundAsync(string path, float volume) => WinAudio.PlayAsync(path, volume);
    public Task StopSoundsAsync() => WinAudio.StopAllAsync();

    public void OpenUrl(string url)
    {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch (Exception e) { Log.Info("Tarayıcı açılamadı: " + e.Message); }
    }

    public void OpenFolder(string path)
    {
        try { Process.Start(new ProcessStartInfo("explorer.exe", $"\"{path}\"") { UseShellExecute = true }); }
        catch (Exception e) { Log.Info("Klasör açılamadı: " + e.Message); }
    }
}
