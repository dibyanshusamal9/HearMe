import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';

// Adapters phones on the cabin Wi-Fi cannot reach: VM host-only networks, WSL/Hyper-V, containers, VPN tunnels.
// (scripts/demo.mjs repeats these two patterns for its pre-flight check.)
const VIRTUAL = /vethernet|virtualbox|vbox|vmware|vmnet|hyper-v|wsl|docker|^br-|^veth|utun|tailscale|zerotier/i;
const WIRELESS = /wi-?fi|wlan|wireless|^wl|^en0$/i;

/** Wi-Fi first, then wired, then virtual adapters (192.168.56.x is VirtualBox's default host-only network). */
function rank(name: string, address: string): number {
  if (VIRTUAL.test(name) || address.startsWith('192.168.56.')) return 2;
  return WIRELESS.test(name) ? 0 : 1;
}

/** IPv4 addresses other devices can reach this hub on, the most likely cabin Wi-Fi address first. */
export function lanAddresses(interfaces: Record<string, NetworkInterfaceInfo[] | undefined> = networkInterfaces()): string[] {
  const out: { address: string; rank: number }[] = [];
  for (const [name, list] of Object.entries(interfaces)) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) out.push({ address: a.address, rank: rank(name, a.address) });
    }
  }
  return out.sort((a, b) => a.rank - b.rank).map((a) => a.address);
}
