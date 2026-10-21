import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import selfsigned from 'selfsigned';

/**
 * HTTPS for the cabin hub. Phone browsers only allow the microphone on secure
 * pages. With `mkcert` installed (brew install mkcert), the certificate comes
 * from a local CA whose public certificate the hub serves at /ca.pem: install
 * it once on the demo phone (see /trust) and there is no warning. Without
 * mkcert it is self-signed and phones show a warning once. An airline
 * deployment would use its own CA. The hub never adds anything to this
 * computer's trust store (no `mkcert -install`).
 */
const CERT_DIR = fileURLToPath(new URL('../.cert/', import.meta.url));

export interface HubCert {
  key: string;
  cert: string;
  kind: 'mkcert' | 'self-signed';
  /** Public certificate of the local CA (mkcert), for phones to install. */
  caPath: string | null;
}

function mkcertRoot(): string | null {
  if (process.env.HEARME_SELF_SIGNED === '1') return null;
  try {
    return execFileSync('mkcert', ['-CAROOT'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

export async function loadOrCreateCert(hosts: string[]): Promise<HubCert> {
  const metaPath = join(CERT_DIR, 'hosts.json');
  const keyPath = join(CERT_DIR, 'hub-key.pem');
  const certPath = join(CERT_DIR, 'hub-cert.pem');
  const wanted = ['localhost', '127.0.0.1', ...hosts].sort();
  const root = mkcertRoot();
  const kind = root ? 'mkcert' : 'self-signed';
  const caPath = root && existsSync(join(root, 'rootCA.pem')) ? join(root, 'rootCA.pem') : null;
  if (existsSync(metaPath) && existsSync(keyPath) && existsSync(certPath)) {
    const saved = JSON.parse(readFileSync(metaPath, 'utf8')) as { hosts: string[]; until: number; kind?: string };
    const covers = wanted.every((h) => saved.hosts.includes(h));
    if (covers && saved.until > Date.now() + 86_400_000 && (saved.kind ?? 'self-signed') === kind) {
      return { key: readFileSync(keyPath, 'utf8'), cert: readFileSync(certPath, 'utf8'), kind, caPath };
    }
  }
  mkdirSync(CERT_DIR, { recursive: true });
  if (root) {
    // Creates the local CA on first use (in mkcert -CAROOT), never touching the system trust store.
    execFileSync('mkcert', ['-cert-file', certPath, '-key-file', keyPath, ...wanted], { stdio: 'ignore' });
    writeFileSync(metaPath, JSON.stringify({ hosts: wanted, until: Date.now() + 700 * 86_400_000, kind }));
    return { key: readFileSync(keyPath, 'utf8'), cert: readFileSync(certPath, 'utf8'), kind, caPath: join(root, 'rootCA.pem') };
  }
  const notBeforeDate = new Date();
  const notAfterDate = new Date(notBeforeDate.getTime() + 365 * 86_400_000);
  const altNames = wanted.map((h) => (/^\d+\.\d+\.\d+\.\d+$/.test(h) ? { type: 7 as const, ip: h } : { type: 2 as const, value: h }));
  const pems = await selfsigned.generate([{ name: 'commonName', value: 'HearMe cabin hub' }], {
    keySize: 2048,
    algorithm: 'sha256',
    notBeforeDate,
    notAfterDate,
    extensions: [{ name: 'subjectAltName', altNames }],
  });
  writeFileSync(keyPath, pems.private, { mode: 0o600 });
  writeFileSync(certPath, pems.cert);
  writeFileSync(metaPath, JSON.stringify({ hosts: wanted, until: notAfterDate.getTime(), kind }));
  return { key: pems.private, cert: pems.cert, kind, caPath: null };
}
