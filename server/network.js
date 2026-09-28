'use strict';
const os = require('os');

const VIRTUAL = /vEthernet|VirtualBox|VMware|Hyper-V|WSL|Loopback|Tailscale|ZeroTier|Hamachi|docker|Bluetooth|br-|veth/i;
const WIFI = /wi-?fi|wlan|kablosuz|wireless/i;
const ORDER = { wifi: 0, lan: 1, usb: 2, virtual: 3 };

/** PC'nin telefona gösterilecek IPv4 adresleri (Wi-Fi önce, iPhone USB sonra). */
function getAddresses(port, token) {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if ((a.family !== 'IPv4' && a.family !== 4) || a.internal || a.address.startsWith('169.254.')) continue;
      // iPhone "Kişisel Erişim Noktası" (USB kablo dahil) her zaman 172.20.10.x ağını kullanır
      const kind = a.address.startsWith('172.20.10.') ? 'usb'
        : VIRTUAL.test(name) ? 'virtual'
          : WIFI.test(name) ? 'wifi' : 'lan';
      out.push({ name, ip: a.address, kind, url: `http://${a.address}:${port}/?t=${token}` });
    }
  }
  return out.sort((x, y) => ORDER[x.kind] - ORDER[y.kind]);
}

module.exports = { getAddresses };
