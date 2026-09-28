param([int]$Port, [string]$Secret, [string]$PanelUrl)
# StreamDeckk Windows yardımcısı: klavye kısayolları (SendInput), ses çalma (MCI) ve simge tepsisi.
# Node sunucusu bu betiği başlatır ve 127.0.0.1 üzerinden satır satır komut gönderir.
$ErrorActionPreference = 'Stop'

$src = @'
using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

public static class SDHelper
{
    [StructLayout(LayoutKind.Sequential)]
    struct INPUT { public uint type; public InputUnion U; }
    [StructLayout(LayoutKind.Explicit)]
    struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)]
    struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint SendInput(uint n, INPUT[] inputs, int size);
    [DllImport("user32.dll")]
    static extern uint MapVirtualKey(uint code, uint mapType);
    [DllImport("winmm.dll", CharSet = CharSet.Unicode)]
    static extern int mciSendString(string cmd, StringBuilder ret, int retLen, IntPtr cb);
    [DllImport("winmm.dll", CharSet = CharSet.Unicode)]
    static extern bool mciGetErrorString(int err, StringBuilder buf, int len);

    const uint KEYUP = 2, UNICODE = 4, EXTENDED = 1;

    static StreamWriter writer;
    static readonly object wlock = new object();
    static readonly BlockingCollection<string> queue = new BlockingCollection<string>();
    static readonly List<string> aliases = new List<string>();
    static int aliasN = 0;
    static NotifyIcon tray;

    static void Send(string line)
    {
        lock (wlock) { try { writer.Write(line + "\n"); writer.Flush(); } catch { } }
    }
    static string B64(string s) { return Convert.ToBase64String(Encoding.UTF8.GetBytes(s)); }
    static string UnB64(string s) { return Encoding.UTF8.GetString(Convert.FromBase64String(s)); }

    static void Quit()
    {
        try { if (tray != null) tray.Visible = false; } catch { }
        try { Mci("close all"); } catch { }
        Environment.Exit(0);
    }

    // ---------- Klavye ----------
    static INPUT KeyInput(ushort vk, bool up, bool ext)
    {
        INPUT i = new INPUT();
        i.type = 1;
        i.U.ki.wVk = vk;
        i.U.ki.wScan = (ushort)MapVirtualKey(vk, 0);
        i.U.ki.dwFlags = (up ? KEYUP : 0) | (ext ? EXTENDED : 0);
        return i;
    }
    static INPUT CharInput(char c, bool up)
    {
        INPUT i = new INPUT();
        i.type = 1;
        i.U.ki.wVk = 0;
        i.U.ki.wScan = c;
        i.U.ki.dwFlags = UNICODE | (up ? KEYUP : 0);
        return i;
    }
    static void SendOne(INPUT i)
    {
        INPUT[] arr = new INPUT[] { i };
        if (SendInput(1, arr, Marshal.SizeOf(typeof(INPUT))) == 0)
            throw new Exception("Tuş gönderilemedi (hata " + Marshal.GetLastWin32Error() + "). Hedef program yönetici olarak çalışıyorsa StreamDeckk'i de yönetici olarak çalıştırın.");
    }
    // spec: "162:0,160:0,77:0"  (vk:extended)
    static void Hotkey(string spec)
    {
        List<ushort> vks = new List<ushort>();
        List<bool> exts = new List<bool>();
        foreach (string part in spec.Split(','))
        {
            string[] kv = part.Split(':');
            vks.Add(ushort.Parse(kv[0]));
            exts.Add(kv.Length > 1 && kv[1] == "1");
        }
        int pressed = 0;
        try
        {
            for (int k = 0; k < vks.Count; k++) { SendOne(KeyInput(vks[k], false, exts[k])); pressed++; Thread.Sleep(15); }
            Thread.Sleep(40);
        }
        finally
        {
            for (int k = pressed - 1; k >= 0; k--) { try { SendOne(KeyInput(vks[k], true, exts[k])); } catch { } Thread.Sleep(10); }
        }
    }
    static void TypeText(string text, bool enter)
    {
        foreach (char c in text)
        {
            if (c == '\r') continue;
            if (c == '\n') { SendOne(KeyInput(0x0D, false, false)); SendOne(KeyInput(0x0D, true, false)); }
            else { SendOne(CharInput(c, false)); SendOne(CharInput(c, true)); }
            Thread.Sleep(4);
        }
        if (enter)
        {
            Thread.Sleep(40);
            SendOne(KeyInput(0x0D, false, false));
            Thread.Sleep(15);
            SendOne(KeyInput(0x0D, true, false));
        }
    }

    // ---------- Ses ----------
    static string Mci(string cmd)
    {
        StringBuilder sb = new StringBuilder(256);
        int r = mciSendString(cmd, sb, 256, IntPtr.Zero);
        if (r != 0)
        {
            StringBuilder e = new StringBuilder(256);
            mciGetErrorString(r, e, 256);
            throw new Exception("Ses hatası: " + e.ToString());
        }
        return sb.ToString();
    }
    static void Cleanup()
    {
        for (int k = aliases.Count - 1; k >= 0; k--)
        {
            string mode;
            try { mode = Mci("status " + aliases[k] + " mode"); } catch { mode = "stopped"; }
            if (mode != "playing" && mode != "seeking" && mode != "not ready")
            {
                try { Mci("close " + aliases[k]); } catch { }
                aliases.RemoveAt(k);
            }
        }
    }
    static void Play(string path, int volume)
    {
        if (!File.Exists(path)) throw new Exception("Ses dosyası bulunamadı: " + Path.GetFileName(path));
        Cleanup();
        aliasN++;
        string a = "sd" + aliasN;
        Mci("open \"" + path + "\" type mpegvideo alias " + a);
        aliases.Add(a);
        try { Mci("setaudio " + a + " volume to " + volume); } catch { }
        Mci("play " + a);
    }
    static void StopAll()
    {
        foreach (string a in aliases) { try { Mci("close " + a); } catch { } }
        aliases.Clear();
    }

    // ---------- Komut işleyici ----------
    static void Worker()
    {
        foreach (string line in queue.GetConsumingEnumerable())
        {
            string[] p = line.Split('\t');
            string id = p[0];
            try
            {
                switch (p[1])
                {
                    case "key": Hotkey(p[2]); break;
                    case "text": TypeText(UnB64(p[2]), p.Length > 3 && p[3] == "1"); break;
                    case "play": Play(UnB64(p[2]), int.Parse(p[3])); break;
                    case "stop": StopAll(); break;
                    case "cleanup": Cleanup(); break;
                    case "ping": break;
                    default: throw new Exception("Bilinmeyen komut: " + p[1]);
                }
                if (id != "0") Send(id + "\tok");
            }
            catch (Exception ex)
            {
                if (id != "0") Send(id + "\terr\t" + B64(ex.Message));
            }
        }
    }

    static Icon MakeIcon()
    {
        Bitmap bmp = new Bitmap(32, 32);
        using (Graphics g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            GraphicsPath path = new GraphicsPath();
            int r = 9;
            path.AddArc(1, 1, r, r, 180, 90);
            path.AddArc(31 - r, 1, r, r, 270, 90);
            path.AddArc(31 - r, 31 - r, r, r, 0, 90);
            path.AddArc(1, 31 - r, r, r, 90, 90);
            path.CloseFigure();
            using (LinearGradientBrush br = new LinearGradientBrush(new Point(0, 0), new Point(32, 32),
                Color.FromArgb(124, 58, 237), Color.FromArgb(192, 132, 252)))
                g.FillPath(br, path);
            using (SolidBrush w = new SolidBrush(Color.White))
            {
                for (int y = 0; y < 3; y++)
                    for (int x = 0; x < 3; x++)
                        g.FillRectangle(w, 7 + x * 7, 7 + y * 7, 5, 5);
            }
        }
        return Icon.FromHandle(bmp.GetHicon());
    }

    static void OpenUrl(string url)
    {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { }
    }

    public static void Run(int port, string secret, string panelUrl)
    {
        TcpClient client = new TcpClient();
        client.Connect("127.0.0.1", port);
        NetworkStream ns = client.GetStream();
        writer = new StreamWriter(ns, new UTF8Encoding(false));
        StreamReader reader = new StreamReader(ns, new UTF8Encoding(false));
        Send("0\thello\t" + secret);

        Thread rt = new Thread(delegate ()
        {
            try { string l; while ((l = reader.ReadLine()) != null) queue.Add(l); } catch { }
            Quit();
        });
        rt.IsBackground = true;
        rt.Start();

        Thread wt = new Thread(Worker);
        wt.IsBackground = true;
        wt.Start();

        System.Threading.Timer timer = new System.Threading.Timer(delegate { queue.Add("0\tcleanup"); }, null, 5000, 5000);

        Application.EnableVisualStyles();
        tray = new NotifyIcon();
        tray.Icon = MakeIcon();
        tray.Text = "StreamDeckk";
        ContextMenuStrip menu = new ContextMenuStrip();
        ToolStripItem title = menu.Items.Add("StreamDeckk çalışıyor");
        title.Enabled = false;
        menu.Items.Add("Kontrol Panelini Aç", null, delegate { OpenUrl(panelUrl); });
        menu.Items.Add("Tüm Sesleri Durdur", null, delegate { queue.Add("0\tstop"); });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Çıkış", null, delegate { tray.Visible = false; Send("0\tquit"); Thread.Sleep(300); Quit(); });
        tray.ContextMenuStrip = menu;
        tray.DoubleClick += delegate { OpenUrl(panelUrl); };
        tray.Visible = true;
        tray.ShowBalloonTip(4000, "StreamDeckk hazır", "Telefonu bağlamak için bu simgeye çift tıkla ve QR kodu okut.", ToolTipIcon.Info);
        Send("0\tready");
        Application.Run();
        GC.KeepAlive(timer);
    }
}
'@

Add-Type -TypeDefinition $src -ReferencedAssemblies System.Windows.Forms, System.Drawing -Language CSharp
[SDHelper]::Run($Port, $Secret, $PanelUrl)
