using System.Runtime.InteropServices;
using static StreamDeckk.Native;

namespace StreamDeckk;

/// <summary>Saatin yanındaki simge: çift tık → panel, sağ tık → menü. Win32 ile, ek kütüphane olmadan.</summary>
sealed class Tray : IDisposable
{
    const uint WM_TRAY = WM_APP + 1;
    const int IdOpen = 1, IdStop = 2, IdFolder = 3, IdQuit = 4;

    readonly WndProc _proc;   // GC toplamasın diye alanda tutulur
    readonly IntPtr _hwnd;
    readonly IntPtr _icon;
    readonly uint _taskbarCreated;
    bool _added;

    public event Action? OpenPanel, StopSounds, OpenFolder, Quit;

    public Tray()
    {
        _proc = Proc;
        _hwnd = Win.CreateHiddenWindow("StreamDeckkTray", _proc);
        _icon = IconFactory.Create(Math.Max(16, GetSystemMetrics(49 /* SM_CXSMICON */)));
        _taskbarCreated = RegisterWindowMessageW("TaskbarCreated");
        Add();
    }

    NOTIFYICONDATAW Data(int flags) => new()
    {
        cbSize = Marshal.SizeOf<NOTIFYICONDATAW>(),
        hWnd = _hwnd,
        uID = 1,
        uFlags = flags,
        uCallbackMessage = (int)WM_TRAY,
        hIcon = _icon,
        szTip = "StreamDeckk",
        szInfo = "",
        szInfoTitle = "",
    };

    void Add()
    {
        var d = Data(NIF_MESSAGE | NIF_ICON | NIF_TIP);
        _added = Shell_NotifyIconW(NIM_ADD, ref d);
    }

    public void Balloon(string title, string text)
    {
        var d = Data(NIF_INFO);
        d.szInfoTitle = title;
        d.szInfo = text;
        d.dwInfoFlags = NIIF_INFO;
        Shell_NotifyIconW(NIM_MODIFY, ref d);
    }

    /// <summary>Mesaj döngüsü; <see cref="Close"/> çağrılana kadar bekler.</summary>
    public void Run()
    {
        while (GetMessageW(out var msg, IntPtr.Zero, 0, 0) > 0)
        {
            TranslateMessage(ref msg);
            DispatchMessageW(ref msg);
        }
    }

    /// <summary>Herhangi bir iş parçacığından güvenle çağrılabilir.</summary>
    public void Close() => PostMessageW(_hwnd, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);

    IntPtr Proc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam)
    {
        if (msg == WM_TRAY)
        {
            var ev = (uint)(lParam.ToInt64() & 0xFFFF);
            if (ev == WM_LBUTTONDBLCLK) OpenPanel?.Invoke();
            else if (ev is WM_RBUTTONUP or WM_CONTEXTMENU) ShowMenu();
            return IntPtr.Zero;
        }
        if (msg == _taskbarCreated) { Add(); return IntPtr.Zero; } // Gezgin yeniden başladıysa simgeyi geri koy
        if (msg == WM_DESTROY) { PostQuitMessage(0); return IntPtr.Zero; }
        return DefWindowProcW(hWnd, msg, wParam, lParam);
    }

    void ShowMenu()
    {
        var menu = CreatePopupMenu();
        AppendMenuW(menu, MF_STRING | MF_GRAYED, UIntPtr.Zero, "StreamDeckk çalışıyor");
        AppendMenuW(menu, MF_SEPARATOR, UIntPtr.Zero, null);
        AppendMenuW(menu, MF_STRING, (UIntPtr)IdOpen, "Kontrol Panelini Aç");
        AppendMenuW(menu, MF_STRING, (UIntPtr)IdStop, "Tüm Sesleri Durdur");
        AppendMenuW(menu, MF_STRING, (UIntPtr)IdFolder, "Veri Klasörünü Aç");
        AppendMenuW(menu, MF_SEPARATOR, UIntPtr.Zero, null);
        AppendMenuW(menu, MF_STRING, (UIntPtr)IdQuit, "Çıkış");
        GetCursorPos(out var p);
        SetForegroundWindow(_hwnd); // Menü dışına tıklanınca kapanabilmesi için gerekli
        var cmd = TrackPopupMenu(menu, TPM_RIGHTBUTTON | TPM_RETURNCMD | TPM_BOTTOMALIGN, p.X, p.Y, 0, _hwnd, IntPtr.Zero);
        PostMessageW(_hwnd, WM_NULL, IntPtr.Zero, IntPtr.Zero);
        DestroyMenu(menu);
        switch (cmd)
        {
            case IdOpen: OpenPanel?.Invoke(); break;
            case IdStop: StopSounds?.Invoke(); break;
            case IdFolder: OpenFolder?.Invoke(); break;
            case IdQuit: Quit?.Invoke(); break;
        }
    }

    public void Dispose()
    {
        if (_added)
        {
            var d = Data(0);
            Shell_NotifyIconW(NIM_DELETE, ref d);
            _added = false;
        }
        // Pencereyi de yok et: aksi halde nesne toplandıktan sonra Windows ölü işleyiciyi çağırır
        DestroyWindow(_hwnd);
        DestroyIcon(_icon);
    }
}

static class Win
{
    public static IntPtr CreateHiddenWindow(string className, WndProc proc)
    {
        var hInst = GetModuleHandleW(null);
        var wc = new WNDCLASSEXW
        {
            cbSize = Marshal.SizeOf<WNDCLASSEXW>(),
            lpfnWndProc = proc,
            hInstance = hInst,
            lpszClassName = className,
        };
        if (RegisterClassExW(ref wc) == 0) throw new InvalidOperationException("Pencere sınıfı kaydedilemedi: " + Marshal.GetLastWin32Error());
        var hwnd = CreateWindowExW(0, className, "StreamDeckk", 0, 0, 0, 0, 0, IntPtr.Zero, IntPtr.Zero, hInst, IntPtr.Zero);
        if (hwnd == IntPtr.Zero) throw new InvalidOperationException("Pencere oluşturulamadı: " + Marshal.GetLastWin32Error());
        return hwnd;
    }

    public static void Error(string text) =>
        MessageBoxW(IntPtr.Zero, text, "StreamDeckk", MB_OK | MB_ICONERROR | MB_SETFOREGROUND | MB_TOPMOST);
}

/// <summary>Mor, yuvarlak köşeli, 2x2 tuşlu tepsi simgesini piksel piksel çizer.</summary>
static class IconFactory
{
    static float RoundRectCoverage(float px, float py, float x0, float y0, float x1, float y1, float r)
    {
        // İşaretli uzaklık alanı + 1 piksellik yumuşatma
        var cx = Math.Clamp(px, x0 + r, x1 - r);
        var cy = Math.Clamp(py, y0 + r, y1 - r);
        var d = MathF.Sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy)) - r;
        return Math.Clamp(0.5f - d, 0f, 1f);
    }

    public static IntPtr Create(int size)
    {
        var s = (float)size;
        var pixels = new byte[size * size * 4];
        var m = s * 0.26f;
        var gap = s * 0.09f;
        var cell = (s - 2 * m - gap) / 2;
        for (var y = 0; y < size; y++)
        for (var x = 0; x < size; x++)
        {
            float px = x + 0.5f, py = y + 0.5f;
            var bg = RoundRectCoverage(px, py, 0, 0, s, s, s * 0.26f);
            var t = (px + py) / (2 * s);
            float r = 109 + (192 - 109) * t, g = 40 + (132 - 40) * t, b = 217 + (252 - 217) * t;
            float white = 0;
            for (var i = 0; i < 2; i++)
            for (var j = 0; j < 2; j++)
            {
                var x0 = m + i * (cell + gap);
                var y0 = m + j * (cell + gap);
                white = Math.Max(white, RoundRectCoverage(px, py, x0, y0, x0 + cell, y0 + cell, cell * 0.28f));
            }
            r += (255 - r) * white; g += (255 - g) * white; b += (255 - b) * white;
            var o = (y * size + x) * 4;
            pixels[o] = (byte)b; pixels[o + 1] = (byte)g; pixels[o + 2] = (byte)r; pixels[o + 3] = (byte)(bg * 255);
        }

        var bmi = new BITMAPINFOHEADER
        {
            biSize = Marshal.SizeOf<BITMAPINFOHEADER>(), biWidth = size, biHeight = -size, biPlanes = 1, biBitCount = 32,
        };
        var color = CreateDIBSection(IntPtr.Zero, ref bmi, 0, out var bits, IntPtr.Zero, 0);
        Marshal.Copy(pixels, 0, bits, pixels.Length);
        var mask = CreateBitmap(size, size, 1, 1, new byte[((size + 15) / 16) * 2 * size]);
        var info = new ICONINFO { fIcon = true, hbmColor = color, hbmMask = mask };
        var icon = CreateIconIndirect(ref info);
        DeleteObject(color);
        DeleteObject(mask);
        return icon;
    }
}
