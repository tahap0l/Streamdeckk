using System.Net.Sockets;
using StreamDeckk.Core;
using static StreamDeckk.Native;

namespace StreamDeckk;

static class Program
{
    /// <summary>
    /// Kullanım:
    ///   StreamDeckk.exe              → başlat, kontrol panelini aç
    ///   StreamDeckk.exe --hidden     → paneli açmadan başlat
    ///   StreamDeckk.exe --console    → günlükleri bir konsol penceresinde de göster
    ///   StreamDeckk.exe --selftest   → klavye/ses/simge tepsisini dene, sonucu göster
    /// </summary>
    [STAThread]
    static int Main(string[] args)
    {
        try { SetProcessDpiAwareness(2); } catch { }
        var console = args.Contains("--console");
        if (console) AllocConsole();

        if (args.Length > 0 && args[0] == "--selftest") return SelfTest.Run(args.Length > 1 ? args[1] : null);

        try { Log.Init(ConfigStore.DataDir, console); }
        catch (Exception e)
        {
            Win.Error($"Veri klasörü oluşturulamadı:\n{ConfigStore.DataDir}\n\n{e.Message}");
            return 1;
        }

        AppDomain.CurrentDomain.UnhandledException += (_, e) =>
        {
            Log.Info("Beklenmeyen hata: " + e.ExceptionObject);
            Win.Error($"StreamDeckk beklenmeyen bir hatayla kapandı:\n\n{(e.ExceptionObject as Exception)?.Message}\n\nAyrıntılar: {Log.FilePath}");
        };
        TaskScheduler.UnobservedTaskException += (_, e) => { Log.Info("Arka plan hatası: " + e.Exception); e.SetObserved(); };

        try
        {
            return Run(args);
        }
        catch (Exception e)
        {
            Log.Info("Başlatılamadı: " + e);
            var reason = e is SocketException { SocketErrorCode: SocketError.AddressAlreadyInUse or SocketError.AccessDenied }
                ? "Gerekli port başka bir program tarafından kullanılıyor."
                : e.Message;
            Win.Error($"StreamDeckk başlatılamadı:\n\n{reason}\n\nAyrıntılar: {Log.FilePath}");
            return 1;
        }
    }

    static int Run(string[] args)
    {
        var platform = new WindowsPlatform();
        var (result, app) = DeckApp.StartAsync(platform).GetAwaiter().GetResult();
        if (result == DeckApp.StartResult.AlreadyRunning || app == null) return 0;

        using var tray = new Tray();
        tray.OpenPanel += () => platform.OpenUrl(app.PanelUrl);
        tray.StopSounds += () => _ = app.StopSounds();
        tray.OpenFolder += () => platform.OpenFolder(ConfigStore.DataDir);
        tray.Quit += tray.Close;

        if (!args.Contains("--hidden")) platform.OpenUrl(app.PanelUrl);
        tray.Balloon("StreamDeckk hazır", "Telefonu bağlamak için bu simgeye çift tıkla ve QR kodu okut.");

        tray.Run();

        app.Stop();
        _ = WinAudio.StopAllAsync();
        Log.Info("Çıkış yapıldı.");
        return 0;
    }
}
