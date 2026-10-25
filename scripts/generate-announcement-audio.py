"""Generate the four Asian-language fixed announcement recordings; no passenger data."""
import asyncio
import json
import sys
from pathlib import Path

import edge_tts

LOCALES = {"ja": "ja-JP", "th": "th-TH", "id": "id-ID", "vi": "vi-VN"}
PREFERRED = {"ja": "ja-JP-NanamiNeural", "th": "th-TH-PremwadeeNeural", "id": "id-ID-GadisNeural", "vi": "vi-VN-HoaiMyNeural"}


async def main():
    jobs = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    voices = await edge_tts.list_voices()
    selected = {}
    for language, locale in LOCALES.items():
        candidates = [voice for voice in voices if voice["Locale"] == locale]
        if not candidates:
            raise RuntimeError(f"No recording voice is available for {language}")
        names = [voice["ShortName"] for voice in candidates]
        selected[language] = sorted(names, key=lambda name: (name != PREFERRED[language], name))
    pool = asyncio.Semaphore(1)
    results = []

    def save_results():
        Path(sys.argv[2]).write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

    async def generate(job):
        async with pool:
            path = Path(job["path"])
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_suffix(".partial")
            for attempt in range(3):
                choices = selected[job["lang"]]
                voice = choices[min(attempt, len(choices) - 1)]
                try:
                    await asyncio.wait_for(edge_tts.Communicate(job["text"], voice, rate="-5%").save(str(temporary)), timeout=45)
                    temporary.replace(path)
                    results.append({"id": job["id"], "lang": job["lang"], "voice": voice})
                    selected[job["lang"]] = [voice] + [name for name in choices if name != voice]
                    save_results()
                    print(f"Recorded {job['id']}/{job['lang']}", flush=True)
                    return
                except Exception:
                    temporary.unlink(missing_ok=True)
                    if attempt == 2:
                        raise
                    print(f"Resuming {job['id']}/{job['lang']} with another recording voice", flush=True)
                    await asyncio.sleep((attempt + 1) * 2)

    outcomes = await asyncio.gather(*(generate(job) for job in jobs), return_exceptions=True)
    save_results()
    failed = [f"{job['id']}/{job['lang']}" for job, outcome in zip(jobs, outcomes) if isinstance(outcome, Exception)]
    if failed:
        raise RuntimeError("Could not create recordings: " + ", ".join(failed))


if __name__ == "__main__":
    asyncio.run(main())
