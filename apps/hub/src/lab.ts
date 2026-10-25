import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LabTake } from '@hearme/shared/lab';
import { encodeWav } from './audio';

/**
 * Voice lab results, kept on the hub laptop only: one JSON line per take in
 * apps/hub/.lab/takes.jsonl (gitignored). Recordings are saved only when the
 * speaker ticks "keep my recordings", as 16 kHz WAV files in .lab/audio/.
 */
export class LabLog {
  readonly file: string;
  readonly audioDir: string;

  constructor(readonly dir = process.env.HEARME_LAB_DIR ?? fileURLToPath(new URL('../.lab/', import.meta.url))) {
    this.file = join(dir, 'takes.jsonl');
    this.audioDir = join(dir, 'audio');
  }

  static newId(): string {
    return `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`;
  }

  add(take: LabTake, samples?: Float32Array): LabTake {
    mkdirSync(this.dir, { recursive: true });
    const saved: LabTake = { ...take };
    if (samples) {
      mkdirSync(this.audioDir, { recursive: true });
      saved.audio = `${take.id}.wav`;
      writeFileSync(join(this.audioDir, saved.audio), encodeWav(samples));
    }
    appendFileSync(this.file, `${JSON.stringify(saved)}\n`);
    return saved;
  }

  list(): LabTake[] {
    if (!existsSync(this.file)) return [];
    const out: LabTake[] = [];
    for (const line of readFileSync(this.file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as LabTake);
      } catch {
        // A half-written line (the laptop slept mid-write): skip it.
      }
    }
    return out;
  }

  /** Remove a take (misread, coughed, wrong button), with its recording. */
  discard(id: string): boolean {
    const all = this.list();
    const gone = all.find((t) => t.id === id);
    if (!gone) return false;
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, all.filter((t) => t !== gone).map((t) => `${JSON.stringify(t)}\n`).join(''));
    renameSync(tmp, this.file);
    if (gone.audio && basename(gone.audio) === gone.audio) rmSync(join(this.audioDir, gone.audio), { force: true });
    return true;
  }
}
