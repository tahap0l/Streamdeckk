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
    static int _failed;

    static void Check(string name, bool? pass, string detail = "")
    {
        var mark = pass switch { true => "OK  ", false => "FAIL", null => "SKIP" };
        if (pass == false) _failed++;
        Report.AppendLine($"{mark} {name}{(detail.Length > 0 ? " — " + detail : "")}");
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

    static string Text(IntPtr hwnd)
    {
        var len = GetWindowTextLengthW(hwnd);
        var buf = new char[len + 1];
        GetWindowTextW(hwnd, buf, buf.Length);
        return new string(buf, 0, len);
    }

    public static int Run(string? resultFile)
    {
        // 1) Kısayol çözümleme
        try
        {
            var ok = Keys.Parse("m+ctrl+shift").SequenceEqual(new ushort[] { 0xa2, 0xa0, 0x4d })
                     && Keys.Parse("F24").SequenceEqual(new ushort[] { 0x87 });
            Check("Kısayol çözümleme", ok);
        }
        catch (Exception e) { Check("Kısayol çözümleme", false, e.Message); }

        // 2) Simge çizimi ve tepsi
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
            WndProc proc = (h, m, w, l) => DefWindowProcW(h, m, w, l);
            var hInst = GetModuleHandleW(null);
            var wc = new WNDCLASSEXW { cbSize = Marshal.SizeOf<WNDCLASSEXW>(), lpfnWndProc = proc, hInstance = hInst, lpszClassName = "StreamDeckkSelfTest" };
            RegisterClassExW(ref wc);
            main = CreateWindowExW(0x8 /* TOPMOST */, "StreamDeckkSelfTest", "StreamDeckk öz-test", 0x10CF0000 /* OVERLAPPEDWINDOW|VISIBLE */,
                100, 100, 520, 140, IntPtr.Zero, IntPtr.Zero, hInst, IntPtr.Zero);
            var edit = CreateWindowExW(0, "EDIT", "", 0x50800080 /* CHILD|VISIBLE|BORDER|AUTOHSCROLL */, 10, 10, 480, 30, main, IntPtr.Zero, hInst, IntPtr.Zero);
            ShowWindow(main, 5);
            // Arka plandaki bir süreç odak alamayabilir; Alt'a basıp bırakmak Windows'un odak kilidini açar
            WinInput.HotkeyAsync(new ushort[] { 0xa4 }).GetAwaiter().GetResult();
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
                const string expected = "Test ğüşıöç İĞÜŞÖÇ 💜 123";
                WinInput.TypeAsync(expected, false).GetAwaiter().GetResult();
                Pump(500);
                var got = Text(edit);
                Check("Klavye: Türkçe metin yazma", got == expected, $"okunan: \"{got}\"");

                // Ctrl+A tümünü seçer, ardından yazılan "x" her şeyin yerine geçmeli
                WinInput.HotkeyAsync(Keys.Parse("ctrl+a")).GetAwaiter().GetResult();
                Pump(200);
                WinInput.TypeAsync("x", false).GetAwaiter().GetResult();
                Pump(400);
                got = Text(edit);
                Check("Klavye: Ctrl+A kısayolu", got == "x", $"okunan: \"{got}\"");

                WinInput.HotkeyAsync(Keys.Parse("f13")).GetAwaiter().GetResult();
                WinInput.HotkeyAsync(Keys.Parse("ctrl+shift+f18")).GetAwaiter().GetResult();
                Check("Klavye: F13 ve Ctrl+Shift+F18 gönderildi", true);
            }
        }
        catch (Exception e) { Check("Klavye", false, e.Message); }
        finally { if (main != IntPtr.Zero) DestroyWindow(main); }

        // 4) Ses (sunucularda ses kartı olmayabilir: yalnızca raporla)
        try
        {
            var dir = Path.Combine(Path.GetTempPath(), "streamdeckk-selftest");
            Samples.WriteAll(dir);
            WinAudio.PlayAsync(Path.Combine(dir, "ding.wav"), 0.05f).GetAwaiter().GetResult();
            Thread.Sleep(300);
            WinAudio.StopAllAsync().GetAwaiter().GetResult();
            Check("Ses çalma", true);
        }
        catch (ActionException e) { Check("Ses çalma", null, e.Message); }
        catch (Exception e) { Check("Ses çalma", false, e.ToString()); }

        Report.AppendLine(_failed == 0 ? "SONUÇ: BAŞARILI" : $"SONUÇ: {_failed} HATA");
        var text = Report.ToString();
        if (resultFile != null) File.WriteAllText(resultFile, text);
        else MessageBoxW(IntPtr.Zero, text, "StreamDeckk öz-test", MB_OK | (_failed == 0 ? MB_ICONINFORMATION : MB_ICONERROR));
        return _failed == 0 ? 0 : 1;
    }
}
