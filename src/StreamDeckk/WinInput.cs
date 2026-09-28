using System.Runtime.InteropServices;
using StreamDeckk.Core;
using static StreamDeckk.Native;

namespace StreamDeckk;

/// <summary>SendInput ile klavye kısayolu ve Unicode metin gönderir. Girişler sırayla işlenir, karışmaz.</summary>
static class WinInput
{
    static readonly SemaphoreSlim Lock = new(1, 1);
    static readonly int InputSize = Marshal.SizeOf<INPUT>();

    static INPUT Key(ushort vk, bool up) => new()
    {
        type = INPUT_KEYBOARD,
        U = new InputUnion
        {
            ki = new KEYBDINPUT
            {
                wVk = vk,
                wScan = (ushort)MapVirtualKeyW(vk, 0),
                dwFlags = (up ? KEYEVENTF_KEYUP : 0) | (Keys.IsExtended(vk) ? KEYEVENTF_EXTENDEDKEY : 0),
            },
        },
    };

    static INPUT Char(char c, bool up) => new()
    {
        type = INPUT_KEYBOARD,
        U = new InputUnion { ki = new KEYBDINPUT { wScan = c, dwFlags = KEYEVENTF_UNICODE | (up ? KEYEVENTF_KEYUP : 0) } },
    };

    static void Send(INPUT input)
    {
        if (SendInput(1, new[] { input }, InputSize) == 0)
        {
            var err = Marshal.GetLastWin32Error();
            throw new ActionException(
                $"Tuş gönderilemedi (hata {err}). Hedef program yönetici olarak çalışıyorsa StreamDeckk'i de sağ tık → \"Yönetici olarak çalıştır\" ile aç.");
        }
    }

    public static async Task HotkeyAsync(IReadOnlyList<ushort> vks)
    {
        await Lock.WaitAsync();
        try
        {
            await Task.Run(() =>
            {
                var pressed = 0;
                try
                {
                    foreach (var vk in vks) { Send(Key(vk, false)); pressed++; Thread.Sleep(15); }
                    Thread.Sleep(40);
                }
                finally
                {
                    // Takılı kalmış değiştirici tuş olmasın: basılanları her durumda bırak
                    for (var i = pressed - 1; i >= 0; i--)
                    {
                        try { Send(Key(vks[i], true)); } catch { }
                        Thread.Sleep(10);
                    }
                }
            });
        }
        finally { Lock.Release(); }
    }

    public static async Task TypeAsync(string text, bool enter)
    {
        await Lock.WaitAsync();
        try
        {
            await Task.Run(() =>
            {
                foreach (var c in text)
                {
                    if (c == '\r') continue;
                    if (c == '\n') { Send(Key(0x0D, false)); Send(Key(0x0D, true)); }
                    else { Send(Char(c, false)); Send(Char(c, true)); }
                    Thread.Sleep(4);
                }
                if (enter)
                {
                    Thread.Sleep(40);
                    Send(Key(0x0D, false));
                    Thread.Sleep(15);
                    Send(Key(0x0D, true));
                }
            });
        }
        finally { Lock.Release(); }
    }
}
