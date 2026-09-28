using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text.RegularExpressions;

namespace StreamDeckk.Core;

public sealed record NetAddress(string Name, string Ip, string Kind);

public static partial class NetInfo
{
    [GeneratedRegex("vEthernet|VirtualBox|VMware|Hyper-V|WSL|Loopback|Tailscale|ZeroTier|Hamachi|docker|Bluetooth|TAP-|Npcap|br-|veth", RegexOptions.IgnoreCase)]
    private static partial Regex Virtual();

    [GeneratedRegex("wi-?fi|wlan|kablosuz|wireless", RegexOptions.IgnoreCase)]
    private static partial Regex Wifi();

    static int Order(string kind) => kind switch { "wifi" => 0, "lan" => 1, "usb" => 2, _ => 3 };

    /// <summary>Telefona gösterilecek IPv4 adresleri: Wi-Fi önce, iPhone USB sonra, sanal bağdaştırıcılar en sonda.</summary>
    public static List<NetAddress> GetAddresses()
    {
        var list = new List<NetAddress>();
        foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (ni.OperationalStatus != OperationalStatus.Up || ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
            IPInterfaceProperties props;
            try { props = ni.GetIPProperties(); } catch { continue; }
            foreach (var ua in props.UnicastAddresses)
            {
                if (ua.Address.AddressFamily != AddressFamily.InterNetwork) continue;
                var ip = ua.Address.ToString();
                if (ip.StartsWith("127.") || ip.StartsWith("169.254.")) continue;
                var label = ni.Name + " " + ni.Description;
                // iPhone "Kişisel Erişim Noktası" (USB kablo dahil) her zaman 172.20.10.x ağını kullanır
                var kind = ip.StartsWith("172.20.10.") || label.Contains("Apple Mobile Device", StringComparison.OrdinalIgnoreCase) ? "usb"
                    : Virtual().IsMatch(label) ? "virtual"
                    : ni.NetworkInterfaceType == NetworkInterfaceType.Wireless80211 || Wifi().IsMatch(label) ? "wifi"
                    : "lan";
                list.Add(new NetAddress(ni.Name, ip, kind));
            }
        }
        return list.OrderBy(a => Order(a.Kind)).ToList();
    }
}
