using System.Runtime.InteropServices;
using System.Text;
using StreamDeckk.Core;
using static StreamDeckk.Native;

namespace StreamDeckk;

/// <summary>
/// "StreamDeckk.exe --selftest [sonuç.txt]": Windows'a özel parçaları gerçekten dener.
/// Kendi penceresindeki metin kutusuna SendInput ile yazı yazdırır ve kutunun içeriğini okuyarak doğrular.
/// </summary>
static class SelfTest
{
    static readonly StringBuilder Report = new();
    static readonly object Gate = new();
    static int _failed;
    static string? _file;
    static string _step = "başlangıç";
    static WndProc? _editHostProc; // GC toplamasın: pencere yaşadıkça Windows bunu çağırır

    /// <summary>Her satır dosyaya hemen yazılır; takılma olursa nerede olduğu görünür.</summary>
    static void Line(string s)
    {
        lock (Gate)
        {
            Report.AppendLine(s);
            if (_file != null) { try { File.AppendAllText(_file, s + Environment.NewLine); } catch { } }
        }
    }

    static void Step(string name)
    {
        _step = name;
        Line($"...  {name}");
    }

    static void Check(string name, bool? pass, string detail = "")
    {
        var mark = pass switch { true => "OK  ", false => "FAIL", null => "SKIP" };
        if (pass == false) _failed++;
        Line($"{mark} {name}{(detail.Length > 0 ? " — " + detail : "")}");
    }

    static void Pump(int ms)
    {
        var until = Environment.TickCount64 + ms;
        while (Environment.TickCount64 < until)
        {
            while (PeekMessageW(out var m, IntPtr.Zero, 0, 0, PM_REMOVE)) { TranslateMessage(ref m); DispatchMessageW(ref m); }
            Thread.Sleep(10);
        }
    }

    /// <summary>
    /// Görevi beklerken pencere mesajlarını işlemeye devam eder. GUI iş parçacığını bloklamak, Windows'un
    /// odak değişiminde gönderdiği senkron mesajlarla kilitlenmeye yol açar.
    /// </summary>
    static bool Wait(Task t, int timeoutMs = 10_000)
    {
        var until = Environment.TickCount64 + timeoutMs;
        while (!t.IsCompleted && Environment.TickCount64 < until) Pump(20);
        if (!t.IsCompleted) return false;
        t.GetAwaiter().GetResult(); // hata varsa fırlat
        return true;
    }

    static string Text(IntPtr hwnd)
    {
        var len = GetWindowTextLengthW(hwnd);
        var buf = new char[len + 1];
        GetWindowTextW(hwnd, buf, buf.Length);
        return new string(buf, 0, len);
    }

    public static int Run(string? resultFile)
    {
        _file = resultFile;
        if (_file != null) File.WriteAllText(_file, "");
        SetErrorMode(0x0002 /* SEM_NOGPFAULTERRORBOX: çökmede bekleyen hata penceresi açma */);
        // Bekçi: bir adım takılırsa raporla ve çık
        new Thread(() =>
        {
            Thread.Sleep(40_000);
            Line($"FAIL zaman aşımı — \"{_step}\" adımında takıldı");
            Environment.Exit(2);
        }) { IsBackground = true }.Start();

        // 1) Kısayol çözümleme
        Step("kısayol çözümleme");
        try
        {
            var ok = Keys.Parse("m+ctrl+shift").SequenceEqual(new ushort[] { 0xa2, 0xa0, 0x4d })
                     && Keys.Parse("F24").SequenceEqual(new ushort[] { 0x87 });
            Check("Kısayol çözümleme", ok);
        }
        catch (Exception e) { Check("Kısayol çözümleme", false, e.Message); }

        // 2) Simge çizimi ve tepsi
        Step("simge tepsisi");
        try
        {
            using var tray = new Tray();
            Check("Simge tepsisi oluşturuldu", true);
        }
        catch (Exception e) { Check("Simge tepsisi oluşturuldu", false, e.Message); }

        // 3) Gerçek klavye girişi: kendi metin kutumuza yaz ve oku
        IntPtr main = IntPtr.Zero;
        try
        {
            Step("test penceresi");
            // SC_KEYMENU'yu yut: Alt'a basılırsa Windows kullanıcı girdisi bekleyen menü döngüsüne girip takılır
            _editHostProc = (h, m, w, l) =>
                m == 0x0112 /* WM_SYSCOMMAND */ && (w.ToInt64() & 0xFFF0) == 0xF100 /* SC_KEYMENU */
                    ? IntPtr.Zero
                    : DefWindowProcW(h, m, w, l);
            var hInst = GetModuleHandleW(null);
            var wc = new WNDCLASSEXW { cbSize = Marshal.SizeOf<WNDCLASSEXW>(), lpfnWndProc = _editHostProc, hInstance = hInst, lpszClassName = "StreamDeckkSelfTest" };
            RegisterClassExW(ref wc);
            main = CreateWindowExW(0x8 /* TOPMOST */, "StreamDeckkSelfTest", "StreamDeckk öz-test", 0x10CF0000 /* OVERLAPPEDWINDOW|VISIBLE */,
                100, 100, 520, 140, IntPtr.Zero, IntPtr.Zero, hInst, IntPtr.Zero);
            var edit = CreateWindowExW(0, "EDIT", "", 0x50800080 /* CHILD|VISIBLE|BORDER|AUTOHSCROLL */, 10, 10, 480, 30, main, IntPtr.Zero, hInst, IntPtr.Zero);
            ShowWindow(main, 5);
            Step("pencereyi öne getirme");
            SetForegroundWindow(main);
            Pump(300);
            SetFocus(edit);
            Pump(200);
            var focused = GetForegroundWindow() == main;
            if (!focused)
            {
                Check("Klavye: Türkçe metin yazma", null, "pencere odak alamadı (etkileşimsiz oturum)");
            }
            else
            {
                Step("Türkçe metin yazma");
                const string expected = "Test ğüşıöç İĞÜŞÖÇ 💜 123";
                if (!Wait(WinInput.TypeAsync(expected, false)))
                {
                    Check("Klavye: Türkçe metin yazma", null, "giriş 10 sn içinde işlenmedi (etkileşimsiz oturum)");
                    throw new OperationCanceledException();
                }
                Pump(500);
                var got = Text(edit);
                Check("Klavye: Türkçe metin yazma", got == expected, $"okunan: \"{got}\"");

                Step("Ctrl+A");
                // Ctrl+A tümünü seçer, ardından yazılan "x" her şeyin yerine geçmeli
                Wait(WinInput.HotkeyAsync(Keys.Parse("ctrl+a")));
                Pump(200);
                Wait(WinInput.TypeAsync("x", false));
                Pump(400);
                got = Text(edit);
                Check("Klavye: Ctrl+A kısayolu", got == "x", $"okunan: \"{got}\"");

                Step("F13 gönderme");
                Wait(WinInput.HotkeyAsync(Keys.Parse("f13")));
                Wait(WinInput.HotkeyAsync(Keys.Parse("ctrl+shift+f18")));
                Check("Klavye: F13 ve Ctrl+Shift+F18 gönderildi", true);
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception e) { Check("Klavye", false, e.Message); }
        finally { if (main != IntPtr.Zero) DestroyWindow(main); }

        // 4) Ses (sunucularda ses kartı olmayabilir: yalnızca raporla)
        Step("ses çalma");
        try
        {
            var dir = Path.Combine(Path.GetTempPath(), "streamdeckk-selftest");
            Samples.WriteAll(dir);
            Wait(WinAudio.PlayAsync(Path.Combine(dir, "ding.wav"), 0.05f));
            Thread.Sleep(300);
            Wait(WinAudio.StopAllAsync());
            Check("Ses çalma", true);
        }
        catch (ActionException e) { Check("Ses çalma", null, e.Message); }
        catch (Exception e) { Check("Ses çalma", false, e.ToString()); }

        Line(_failed == 0 ? "SONUÇ: BAŞARILI" : $"SONUÇ: {_failed} HATA");
        string text;
        lock (Gate) text = Report.ToString();
        if (resultFile == null) MessageBoxW(IntPtr.Zero, text, "StreamDeckk öz-test", MB_OK | (_failed == 0 ? MB_ICONINFORMATION : MB_ICONERROR));
        return _failed == 0 ? 0 : 1;
    }
}
