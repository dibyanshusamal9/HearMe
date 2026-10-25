import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as x509 from '@peculiar/x509';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

// Keep certificates out of the real apps/hub/.cert, and do not depend on whether mkcert is installed.
process.env.HEARME_CERT_DIR = mkdtempSync(join(tmpdir(), 'hearme-cert-'));
process.env.HEARME_CERT = 'local';
const { createLocalCa, fingerprint, issueServerCert, loadOrCreateCert, mobileconfig, pemToDer, wantedHosts } = await import('../src/cert');
const { createHandler, joinUrl, safeNext } = await import('../src/server');
const { AiEngine } = await import('../src/ai');
const { CabinRelay } = await import('../src/relay');

type Ca = Awaited<ReturnType<typeof createLocalCa>>;
let ca: Ca;
beforeAll(async () => {
  ca = await createLocalCa();
}, 60_000);

const ext = <T,>(cert: x509.X509Certificate, type: new (...a: never[]) => T) => cert.getExtension(type as never) as T | null;

describe('built-in local CA (mkcert-style)', () => {
  it('makes a root that can only sign certificates, with a key identifier', () => {
    const root = new x509.X509Certificate(ca.certPem);
    const bc = ext(root, x509.BasicConstraintsExtension)!;
    expect(bc.ca).toBe(true);
    expect(bc.pathLength).toBe(0);
    expect(bc.critical).toBe(true);
    const ku = ext(root, x509.KeyUsagesExtension)!;
    expect(ku.usages & x509.KeyUsageFlags.keyCertSign).toBeTruthy();
    expect(ext(root, x509.SubjectKeyIdentifierExtension)).not.toBeNull();
    expect(ca.name).toMatch(/^HearMe local CA \(/);
  });

  it('issues a server certificate for every LAN address that chains to the root', async () => {
    const hosts = wantedHosts(['192.168.1.20']);
    const leaf = await issueServerCert(ca, hosts);
    const cert = new x509.X509Certificate(leaf.certPem);
    const root = new x509.X509Certificate(ca.certPem);
    expect(await cert.verify({ publicKey: root.publicKey, signatureOnly: true })).toBe(true);
    expect(cert.issuer).toBe(root.subject);
    const san = ext(cert, x509.SubjectAlternativeNameExtension)!.names.toJSON().map((n) => n.value);
    expect(san).toEqual(expect.arrayContaining(['localhost', '127.0.0.1', '192.168.1.20']));
    expect(ext(cert, x509.ExtendedKeyUsageExtension)!.usages).toContain(x509.ExtendedKeyUsage.serverAuth);
    expect(ext(cert, x509.BasicConstraintsExtension)!.ca).toBe(false);
    // Authority key id = the root's subject key id, so every platform can build the chain.
    expect(ext(cert, x509.AuthorityKeyIdentifierExtension)!.keyId).toBe(ext(root, x509.SubjectKeyIdentifierExtension)!.keyId);
    // Apple rejects server certificates valid for more than 825 days; we stay under 398.
    const days = (cert.notAfter.getTime() - cert.notBefore.getTime()) / 86_400_000;
    expect(days).toBeLessThanOrEqual(398);
  });

  it('formats the fingerprint the way phones show it', () => {
    const hex = createHash('sha256').update(pemToDer(ca.certPem)).digest('hex').toUpperCase();
    expect(fingerprint(ca.certPem).replace(/:/g, '')).toBe(hex);
    expect(fingerprint(ca.certPem)).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });

  it('builds an iOS profile that contains only the root certificate', () => {
    const profile = mobileconfig(ca.certPem, ca.name);
    expect(profile).toContain('<string>com.apple.security.root</string>');
    expect(profile).toContain(pemToDer(ca.certPem).toString('base64'));
    expect(profile).not.toContain('PRIVATE KEY');
    // The same root always gets the same identifiers, so re-installing replaces it.
    expect(mobileconfig(ca.certPem, ca.name)).toBe(profile);
  });
});

describe('loadOrCreateCert', () => {
  it('keeps the root when the Wi-Fi address changes, so phones never re-install', async () => {
    const first = await loadOrCreateCert(['192.168.1.20']);
    expect(first.source).toBe('local-ca');
    expect(first.caPem).toContain('BEGIN CERTIFICATE');
    const again = await loadOrCreateCert(['192.168.1.20']);
    expect(again.cert).toBe(first.cert); // reused, not re-issued
    const moved = await loadOrCreateCert(['10.0.0.7']);
    expect(moved.cert).not.toBe(first.cert);
    expect(moved.caFingerprint).toBe(first.caFingerprint);
    expect(moved.hosts).toContain('10.0.0.7');
    // Private keys are readable only by this user. Windows has no POSIX mode bits (Node reports 0o666 and chmod only
    // toggles read-only); there the keys are protected by the user-profile ACL the certificate folder inherits.
    if (process.platform !== 'win32') {
      const dir = process.env.HEARME_CERT_DIR!;
      expect(statSync(join(dir, 'ca', 'hearme-root-ca-key.pem')).mode & 0o077).toBe(0);
      expect(statSync(join(dir, 'hub-key.pem')).mode & 0o077).toBe(0);
    }
  }, 60_000);
});

describe('trust page and downloads', () => {
  let server: Server;
  let base: string;
  let relay: InstanceType<typeof CabinRelay>;
  const start = async (withCert: boolean) => {
    const staticDir = mkdtempSync(join(tmpdir(), 'hearme-static-'));
    writeFileSync(join(staticDir, 'index.html'), '<!doctype html>');
    mkdirSync(join(staticDir, 'mobile'));
    writeFileSync(join(staticDir, 'mobile', 'index.html'), '<!doctype html><div id="root">Passenger browser app</div>');
    const certificate = withCert ? await loadOrCreateCert(['192.168.1.20']) : null;
    relay = new CabinRelay({ pingMs: 60_000 });
    const urls = () => ({ base: 'https://192.168.1.20:8443', lan: ['192.168.1.20'], trust: withCert ? 'http://192.168.1.20:8080/trust' : undefined });
    const ai = new AiEngine({ asrSize: 'base', threads: 1, loadEmbedder: async () => Promise.reject(new Error('off')), loadAsr: async () => Promise.reject(new Error('off')) });
    const handler = createHandler({ staticDir, ai, relay, urls, version: 'test', certificate: () => certificate });
    server = createServer((req, res) => void handler(req, res));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return certificate;
  };
  afterEach(async () => {
    relay.close();
    await new Promise((r) => server.close(r));
  });

  it('serves the root (public part only) in the formats phones install', async () => {
    const cert = (await start(true))!;
    const der = Buffer.from(await (await fetch(`${base}/trust/hearme-ca.crt`)).arrayBuffer());
    expect(der.equals(pemToDer(cert.caPem!))).toBe(true);
    const crt = await fetch(`${base}/trust/hearme-ca.crt`);
    expect(crt.headers.get('content-type')).toBe('application/x-x509-ca-cert');
    expect((await fetch(`${base}/trust/hearme.mobileconfig`)).headers.get('content-type')).toBe('application/x-apple-aspen-config');
    for (const path of ['/trust', '/trust/hearme-ca.crt', '/trust/hearme-ca.pem', '/trust/hearme.mobileconfig', '/api/trust']) {
      const body = await (await fetch(`${base}${path}`)).text();
      expect(body, path).not.toContain('PRIVATE KEY');
    }
    const info = await (await fetch(`${base}/api/trust`)).json();
    expect(info).toMatchObject({ source: 'local-ca', caFingerprint: cert.caFingerprint, trustPage: 'http://192.168.1.20:8080/trust' });
    expect(readFileSync(join(process.env.HEARME_CERT_DIR!, 'ca', 'hearme-root-ca-key.pem'), 'utf8')).toContain('PRIVATE KEY');
  });

  it('only continues to same-site pages after the check', async () => {
    await start(true);
    const page = await (await fetch(`${base}/trust?next=${encodeURIComponent('//evil.example/x')}`)).text();
    expect(page).toContain('"next":"/mobile/?seat=23C"');
    const ok = await (await fetch(`${base}/trust?next=${encodeURIComponent('/mobile/?seat=21A')}`)).text();
    expect(ok).toContain('"next":"/mobile/?seat=21A"');
    expect(safeNext('https://evil.example/')).toBe('/mobile/?seat=23C');
    expect(safeNext('/\\evil')).toBe('/mobile/?seat=23C');
  });

  it('says so honestly when HTTPS is off, and offers nothing to install', async () => {
    await start(false);
    expect((await fetch(`${base}/trust/hearme-ca.crt`)).status).toBe(404);
    expect(await (await fetch(`${base}/trust`)).text()).toContain('without HTTPS');
  });

  it('opens the browser app directly without requiring certificate installation', () => {
    expect(joinUrl({ base: 'https://h:8443', lan: [], trust: 'http://h:8080/trust' }, '21A')).toBe('http://h:8080/mobile/?seat=21A');
    expect(joinUrl({ base: 'https://hub.example', lan: [] }, '21A')).toBe('https://hub.example/mobile/?seat=21A');
    expect(joinUrl({ base: 'https://h:8443', lan: [], passengerBase: 'http://h:8080' }, '31A')).toBe('http://h:8080/mobile/?seat=31A');
  });

  it('serves the passenger app and join link without an installation gate', async () => {
    await start(true);
    const app = await fetch(`${base}/mobile/?seat=31A`);
    expect(app.status).toBe(200);
    expect(await app.text()).toContain('Passenger browser app');
    const join = await (await fetch(`${base}/join`)).text();
    expect(join).toContain('http://192.168.1.20:8080/mobile/?seat=23C');
    expect(join).toContain('Open HearMe in your browser');
    expect(join).not.toContain('/trust?next=');
  });
});
