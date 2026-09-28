namespace StreamDeckk.Core;

/// <summary>Hem dosyaya hem (varsa) konsola yazan basit günlük.</summary>
public static class Log
{
    static readonly object Gate = new();
    static string? _file;
    static bool _console;

    public static string? FilePath => _file;

    public static void Init(string dataDir, bool console)
    {
        Directory.CreateDirectory(dataDir);
        _file = Path.Combine(dataDir, "streamdeckk.log");
        _console = console;
        try
        {
            var fi = new FileInfo(_file);
            if (fi.Exists && fi.Length > 1_000_000) fi.Delete();
        }
        catch { }
    }

    public static void Info(string message)
    {
        var line = $"[{DateTime.Now:HH:mm:ss}] {message}";
        lock (Gate)
        {
            if (_console) { try { Console.WriteLine(line); } catch { } }
            if (_file != null) { try { File.AppendAllText(_file, line + Environment.NewLine); } catch { } }
        }
    }
}
