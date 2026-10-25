import { spawnSync } from 'node:child_process';
import { createHash, randomBytes, webcrypto } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as x509 from '@peculiar/x509';

/**
 * HTTPS for the cabin hub. Phone browsers only allow the microphone on secure
 * pages, so the hub needs a certificate phones trust. In order of preference:
 *
 *  1. custom   HEARME_TLS_CERT + HEARME_TLS_KEY: a certificate you bring, for
 *              example a publicly trusted one for a domain that points at the
 *              hub. Nothing to install on phones.
 *  2. mkcert   when `mkcert` is installed (brew install mkcert): a certificate
 *              from your machine's mkcert CA. Phones install that CA once.
 *  3. local-ca otherwise, the hub makes its own small CA the same way mkcert
 *              does (a root that stays on this laptop, plus a server
 *              certificate for the laptop's addresses).
 *
 * With 2 and 3, phones install the root once from the hub's /trust page; after
 * that there is no warning screen, even when the laptop's Wi-Fi address
 * changes (only the server certificate is re-issued, the root stays the same).
 * Only the root's public certificate is ever served. Its private key never
 * leaves this laptop. An airline deployment would use its own PKI instead.
 *
 *   HEARME_CERT=local   use the built-in CA even when mkcert is installed
 *   HEARME_CERT_DIR     where certificates are kept (default apps/hub/.cert)
 */
const CERT_DIR = process.env.HEARME_CERT_DIR ?? fileURLToPath(new URL('../.cert/', import.meta.url));

export type CertSource = 'custom' | 'mkcert' | 'local-ca';

export interface HubCertificate {
  /** PEM private key and certificate for the HTTPS server. */
  key: string;
  cert: string;
  source: CertSource;
  /** The root phones install (public certificate only), or null when there is nothing to install. */
  caPem: string | null;
  caName: string;
  /** SHA-256 of the root certificate, as phones show it ("AB:CD:…"). */
  caFingerprint: string | null;
  /** Names and addresses the server certificate covers. */
  hosts: string[];
  notAfter: number;
}

interface Meta {
  source: CertSource;
  hosts: string[];
  until: number;
  caFingerprint: string | null;
}

x509.cryptoProvider.set(webcrypto as unknown as Crypto);
const RSA = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256', publicExponent: new Uint8Array([1, 0, 1]) };
const DAY = 86_400_000;
/** Apple accepts at most 825 days for server certificates and 398 for public CAs; stay under both. */
const LEAF_DAYS = 397;
/** Phones and the laptop may disagree about the time by a little. */
const SKEW = DAY;

const isIp = (h: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':');

/** The names a hub certificate must cover: loopback, a mDNS-style name, and every LAN address. */
export function wantedHosts(lan: string[]): string[] {
  return [...new Set(['localhost', 'hearme.local', '127.0.0.1', '::1', ...lan])];
}

export function pemToDer(pem: string): Buffer {
  return Buffer.from(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64');
}

function toPem(der: ArrayBuffer | Buffer, label: string): string {
  const b64 = Buffer.from(der as ArrayBuffer).toString('base64');
  return `-----BEGIN ${label}-----\n${b64.match(/.{1,64}/g)!.join('\n')}\n-----END ${label}-----\n`;
}

/** SHA-256 of a certificate's DER bytes, formatted the way iOS and Android show it. */
export function fingerprint(pem: string): string {
  return createHash('sha256')
    .update(pemToDer(pem))
    .digest('hex')
    .toUpperCase()
    .match(/.{2}/g)!
    .join(':');
}

const serial = () => {
  const b = randomBytes(16);
  b[0] = b[0]! & 0x7f; // positive
  return b.toString('hex');
};

async function newKeys(bits: number): Promise<CryptoKeyPair> {
  return (await webcrypto.subtle.generateKey({ ...RSA, modulusLength: bits }, true, ['sign', 'verify'])) as CryptoKeyPair;
}

async function keyPem(key: CryptoKey): Promise<string> {
  return toPem(await webcrypto.subtle.exportKey('pkcs8', key), 'PRIVATE KEY');
}

async function importKey(pem: string): Promise<CryptoKey> {
  // Node's WebCrypto types and the DOM's differ slightly; the objects are the same.
  return (await webcrypto.subtle.importKey('pkcs8', new Uint8Array(pemToDer(pem)), RSA, false, ['sign'])) as unknown as CryptoKey;
}

/** A root CA like mkcert's: CA:TRUE pathlen 0, cert signing only, 10 years. */
export async function createLocalCa(now = Date.now()): Promise<{ certPem: string; keyPem: string; name: string }> {
  const host = hostname().replace(/[^A-Za-z0-9.-]/g, '-').slice(0, 40) || 'laptop';
  const name = `HearMe local CA (${host})`;
  const keys = await newKeys(3072);
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: serial(),
    name: [{ CN: [name] }, { O: ['HearMe demo, local only'] }],
    notBefore: new Date(now - SKEW),
    notAfter: new Date(now + 3650 * DAY),
    signingAlgorithm: RSA,
    keys,
    extensions: [
      new x509.BasicConstraintsExtension(true, 0, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign | x509.KeyUsageFlags.digitalSignature, true),
      await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
    ],
  });
  return { certPem: cert.toString('pem'), keyPem: await keyPem(keys.privateKey), name };
}

/** A server certificate for `hosts`, signed by the CA (like `mkcert host1 host2 …`). */
export async function issueServerCert(ca: { certPem: string; keyPem: string }, hosts: string[], now = Date.now()): Promise<{ certPem: string; keyPem: string; notAfter: number }> {
  const caCert = new x509.X509Certificate(ca.certPem);
  const keys = await newKeys(2048);
  const notAfter = now + LEAF_DAYS * DAY;
  const cert = await x509.X509CertificateGenerator.create({
    serialNumber: serial(),
    subject: [{ CN: ['HearMe cabin hub'] }, { O: ['HearMe demo, local only'] }],
    issuer: caCert.subject,
    notBefore: new Date(now - SKEW),
    notAfter: new Date(notAfter),
    signingAlgorithm: RSA,
    publicKey: keys.publicKey,
    signingKey: await importKey(ca.keyPem),
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment, true),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth]),
      new x509.SubjectAlternativeNameExtension(hosts.map((h) => (isIp(h) ? { type: 'ip' as const, value: h } : { type: 'dns' as const, value: h }))),
      await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
      await x509.AuthorityKeyIdentifierExtension.create(caCert.publicKey),
    ],
  });
  return { certPem: cert.toString('pem'), keyPem: await keyPem(keys.privateKey), notAfter };
}

/** mkcert's root directory, or null when mkcert is not installed (or disabled with HEARME_CERT=local). */
export function mkcertCaRoot(): string | null {
  if (process.env.HEARME_CERT === 'local') return null;
  try {
    const r = spawnSync('mkcert', ['-CAROOT'], { encoding: 'utf8', timeout: 5000 });
    return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : null;
  } catch {
    return null;
  }
}

function readMeta(): Meta | null {
  try {
    return JSON.parse(readFileSync(join(CERT_DIR, 'meta.json'), 'utf8')) as Meta;
  } catch {
    return null;
  }
}

const covers = (meta: Meta | null, source: CertSource, hosts: string[], caFp: string | null) =>
  !!meta && meta.source === source && meta.caFingerprint === caFp && meta.until > Date.now() + 30 * DAY && hosts.every((h) => meta.hosts.includes(h));

function caName(pem: string): string {
  try {
    const cert = new x509.X509Certificate(pem);
    return /CN=([^,]+)/.exec(cert.subject)?.[1] ?? cert.subject;
  } catch {
    return 'local CA';
  }
}

/** The local CA (created on first use). Its key file is readable only by this user. */
async function localCa(): Promise<{ certPem: string; keyPem: string }> {
  const dir = join(CERT_DIR, 'ca');
  const certPath = join(dir, 'hearme-root-ca.pem');
  const keyPath = join(dir, 'hearme-root-ca-key.pem');
  if (existsSync(certPath) && existsSync(keyPath)) return { certPem: readFileSync(certPath, 'utf8'), keyPem: readFileSync(keyPath, 'utf8') };
  const ca = await createLocalCa();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(keyPath, ca.keyPem, { mode: 0o600 });
  chmodSync(keyPath, 0o600);
  writeFileSync(certPath, ca.certPem);
  return ca;
}

/**
 * The hub's HTTPS certificate for these LAN addresses, re-issued when the
 * addresses change or it is within 30 days of expiry.
 */
export async function loadOrCreateCert(lan: string[]): Promise<HubCertificate> {
  const hosts = wantedHosts(lan);

  const customCert = process.env.HEARME_TLS_CERT;
  const customKey = process.env.HEARME_TLS_KEY;
  if (customCert && customKey) {
    const cert = readFileSync(customCert, 'utf8');
    const caPem = process.env.HEARME_TLS_CA ? readFileSync(process.env.HEARME_TLS_CA, 'utf8') : null;
    return {
      key: readFileSync(customKey, 'utf8'),
      cert,
      source: 'custom',
      caPem,
      caName: caPem ? caName(caPem) : 'publicly trusted',
      caFingerprint: caPem ? fingerprint(caPem) : null,
      hosts,
      notAfter: new x509.X509Certificate(cert).notAfter.getTime(),
    };
  }

  mkdirSync(CERT_DIR, { recursive: true });
  const meta = readMeta();
  const keyPath = join(CERT_DIR, 'hub-key.pem');
  const certPath = join(CERT_DIR, 'hub-cert.pem');
  const saved = () => ({ key: readFileSync(keyPath, 'utf8'), cert: readFileSync(certPath, 'utf8') });
  const save = (source: CertSource, caFp: string | null, until: number) =>
    writeFileSync(join(CERT_DIR, 'meta.json'), JSON.stringify({ source, hosts, until, caFingerprint: caFp } satisfies Meta, null, 2));

  const caroot = mkcertCaRoot();
  if (caroot) {
    const rootPath = join(caroot, 'rootCA.pem');
    const rootFp = existsSync(rootPath) ? fingerprint(readFileSync(rootPath, 'utf8')) : null;
    if (!(covers(meta, 'mkcert', hosts, rootFp) && existsSync(keyPath) && existsSync(certPath))) {
      // Creates mkcert's CA on first use (without installing it anywhere), then the server certificate.
      const r = spawnSync('mkcert', ['-cert-file', certPath, '-key-file', keyPath, ...hosts], { encoding: 'utf8', timeout: 60_000 });
      if (r.status !== 0) throw new Error(`mkcert failed: ${(r.stderr || r.stdout || '').trim().split('\n').pop()}`);
      chmodSync(keyPath, 0o600);
      const pem = readFileSync(certPath, 'utf8');
      save('mkcert', fingerprint(readFileSync(rootPath, 'utf8')), new x509.X509Certificate(pem).notAfter.getTime());
    }
    const caPem = readFileSync(rootPath, 'utf8');
    return { ...saved(), source: 'mkcert', caPem, caName: caName(caPem), caFingerprint: fingerprint(caPem), hosts, notAfter: readMeta()!.until };
  }

  const ca = await localCa();
  const caFp = fingerprint(ca.certPem);
  if (!(covers(meta, 'local-ca', hosts, caFp) && existsSync(keyPath) && existsSync(certPath))) {
    const leaf = await issueServerCert(ca, hosts);
    writeFileSync(keyPath, leaf.keyPem, { mode: 0o600 });
    chmodSync(keyPath, 0o600);
    writeFileSync(certPath, leaf.certPem);
    save('local-ca', caFp, leaf.notAfter);
  }
  return { ...saved(), source: 'local-ca', caPem: ca.certPem, caName: caName(ca.certPem), caFingerprint: caFp, hosts, notAfter: readMeta()!.until };
}

/**
 * An iOS configuration profile that installs the root (unsigned, so iOS
 * labels it "Not Verified"). Same identifier per root, so installing again
 * replaces it instead of adding a second copy.
 */
export function mobileconfig(caPem: string, caDisplayName: string): string {
  const fp = fingerprint(caPem).replace(/:/g, '');
  const uuid = (salt: string) => {
    const h = createHash('sha256').update(salt + fp).digest('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`.toUpperCase();
  };
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadCertificateFileName</key>
      <string>hearme-ca.cer</string>
      <key>PayloadContent</key>
      <data>${pemToDer(caPem).toString('base64')}</data>
      <key>PayloadDescription</key>
      <string>Root certificate of the HearMe demo hub on this Wi-Fi.</string>
      <key>PayloadDisplayName</key>
      <string>${esc(caDisplayName)}</string>
      <key>PayloadIdentifier</key>
      <string>app.hearme.demo.root.${fp.slice(0, 16)}</string>
      <key>PayloadType</key>
      <string>com.apple.security.root</string>
      <key>PayloadUUID</key>
      <string>${uuid('root')}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
    </dict>
  </array>
  <key>PayloadDescription</key>
  <string>Lets this iPhone open the HearMe demo hub securely (the microphone needs https). Remove it after the event: Settings, General, VPN and Device Management.</string>
  <key>PayloadDisplayName</key>
  <string>HearMe demo hub</string>
  <key>PayloadIdentifier</key>
  <string>app.hearme.demo.${fp.slice(0, 16)}</string>
  <key>PayloadOrganization</key>
  <string>HearMe (local demo)</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>${uuid('profile')}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>
`;
}
