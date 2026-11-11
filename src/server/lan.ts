/**
 * Finds this machine's LAN addresses so the host can tell friends where to connect.
 */
import { networkInterfaces } from 'node:os';

/** Interface names of virtual adapters, which are listed last. */
const VIRTUAL_NIC = /vethernet|wsl|hyper-v|virtualbox|vmware|vbox|docker|loopback|tailscale|zerotier/i;

/**
 * Lists non-loopback IPv4 addresses, private ranges first (192.168.x.x is what a home LAN uses).
 * @returns Addresses like `192.168.1.20`.
 */
export function lanAddresses(): string[] {
  const out: string[] = [];
  const virtual: string[] = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      // WSL / Hyper-V / VM adapters have private addresses too but friends cannot reach them.
      (VIRTUAL_NIC.test(name) ? virtual : out).push(a.address);
    }
  }
  const isHome = (ip: string) => ip.startsWith('192.168.') || ip.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
  const byHome = (a: string, b: string) => Number(isHome(b)) - Number(isHome(a));
  // Real adapters always come before virtual ones.
  return [...out.sort(byHome), ...virtual.sort(byHome)];
}
