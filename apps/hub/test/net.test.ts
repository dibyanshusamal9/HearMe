import type { NetworkInterfaceInfo } from 'node:os';
import { describe, expect, it } from 'vitest';
import { lanAddresses } from '../src/net';

const v4 = (address: string, internal = false) => ({ address, family: 'IPv4', internal }) as NetworkInterfaceInfo;

describe('LAN address for phones', () => {
  it('puts Wi-Fi before VirtualBox, WSL and VPN adapters, whatever order Windows lists them in', () => {
    const windowsLaptop = {
      'Ethernet 2': [v4('192.168.56.1')],
      'Wi-Fi': [v4('172.16.214.213')],
      'vEthernet (WSL (Hyper-V firewall))': [v4('172.29.160.1')],
      'Loopback Pseudo-Interface 1': [v4('127.0.0.1', true)],
    };
    expect(lanAddresses(windowsLaptop)).toEqual(['172.16.214.213', '192.168.56.1', '172.29.160.1']);
  });
  it('prefers wired over virtual, and skips link-local addresses', () => {
    expect(lanAddresses({ utun3: [v4('100.64.0.2')], eth0: [v4('10.0.0.5')], en0: [v4('169.254.10.1')] })).toEqual(['10.0.0.5', '100.64.0.2']);
  });
});
