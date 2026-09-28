using NAudio;
using NAudio.MediaFoundation;
using NAudio.Wave;
using StreamDeckk.Core;

namespace StreamDeckk;

/// <summary>Soundboard: sesleri varsayılan çıkış cihazında, üst üste çalabilecek şekilde oynatır.</summary>
static class WinAudio
{
    static readonly List<(WaveOutEvent Output, WaveStream Reader)> Active = new();
    static bool _mfStarted;

    static WaveStream Open(string path)
    {
        // WAV için Media Foundation gerekmez (Windows N sürümlerinde de çalışır)
        if (path.EndsWith(".wav", StringComparison.OrdinalIgnoreCase))
        {
            var wav = new WaveFileReader(path);
            if (wav.WaveFormat.Encoding is WaveFormatEncoding.Pcm or WaveFormatEncoding.IeeeFloat) return wav;
            wav.Dispose();
        }
        if (!_mfStarted) { MediaFoundationApi.Startup(); _mfStarted = true; }
        return new MediaFoundationReader(path);
    }

    public static Task PlayAsync(string path, float volume) => Task.Run(() =>
    {
        WaveStream? reader = null;
        WaveOutEvent? output = null;
        try
        {
            reader = Open(path);
            output = new WaveOutEvent { DesiredLatency = 120 };
            output.Init(reader);
            output.Volume = Math.Clamp(volume, 0f, 1f);
            var entry = (output, reader);
            lock (Active) Active.Add(entry);
            output.PlaybackStopped += (_, _) =>
            {
                lock (Active) Active.Remove(entry);
                // Olay oynatma iş parçacığında gelir; orada Dispose kilitlenebilir
                Task.Run(() => { entry.output.Dispose(); entry.reader.Dispose(); });
            };
            output.Play();
        }
        catch (Exception e)
        {
            output?.Dispose();
            reader?.Dispose();
            throw Friendly(e, path);
        }
    });

    public static Task StopAllAsync() => Task.Run(() =>
    {
        (WaveOutEvent, WaveStream)[] all;
        lock (Active) all = Active.ToArray();
        foreach (var (o, _) in all) { try { o.Stop(); } catch { } }
    });

    static Exception Friendly(Exception e, string path) => e switch
    {
        MmException { Result: MmResult.NoDriver or MmResult.BadDeviceId } =>
            new ActionException("Ses çıkış cihazı bulunamadı. Hoparlör/kulaklık bağlı mı? (Windows Ses ayarları → Çıkış)"),
        MmException mm => new ActionException($"Ses cihazı hatası: {mm.Result}"),
        System.Runtime.InteropServices.COMException =>
            new ActionException($"\"{Path.GetFileName(path)}\" çalınamadı. Dosya bozuk olabilir ya da bu Windows'ta biçim desteklenmiyor; WAV veya MP3 dene."),
        FormatException or InvalidDataException =>
            new ActionException($"\"{Path.GetFileName(path)}\" geçerli bir ses dosyası değil."),
        _ => e,
    };
}
