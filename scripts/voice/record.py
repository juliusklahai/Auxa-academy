"""Record every coach line with a natural neural voice (Kokoro-82M, Apache-2.0), into public/voice.

    pip install kokoro soundfile   (and ffmpeg on the PATH)
    npx vite-node scripts/voice/lines.ts
    python3 scripts/voice/record.py [--voice af_heart] [--speed 0.95]

Only lines without a recording are made, so changing a lesson re-records just that line. Files are
named by the same short id the app computes (FNV-1a of the spoken text), and voice/index.json lists them.
"""
import argparse, json, os, subprocess, sys, tempfile, time, warnings
warnings.filterwarnings('ignore')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'public', 'voice')

ap = argparse.ArgumentParser()
ap.add_argument('--voice', default='af_heart')
ap.add_argument('--speed', type=float, default=0.95)
ap.add_argument('--force', action='store_true', help='record everything again (after changing the voice)')
ap.add_argument('--budget', type=float, default=0, help='stop cleanly after this many seconds (run again to continue)')
args = ap.parse_args()

lines = json.load(open(os.path.join(ROOT, 'scripts', 'voice', 'lines.json')))
os.makedirs(OUT, exist_ok=True)
todo = [l for l in lines if args.force or not os.path.exists(os.path.join(OUT, l['key'] + '.mp3'))]
print(f'{len(lines)} lines, {len(todo)} to record with {args.voice}', flush=True)
if todo:
    from kokoro import KPipeline
    import numpy as np, soundfile as sf
    pipe = KPipeline(lang_code='b' if args.voice.startswith('b') else 'a')
    # words outside the dictionary (Alberti, solfege, oom-pah) need espeak; point it at the bundled library
    try:
        import espeakng_loader
        from phonemizer.backend.espeak.wrapper import EspeakWrapper
        from misaki import espeak
        EspeakWrapper.set_library(espeakng_loader.get_library_path())
        EspeakWrapper.set_data_path(espeakng_loader.get_data_path())
        if getattr(pipe.g2p, 'fallback', None) is None: pipe.g2p.fallback = espeak.EspeakFallback(british=args.voice.startswith('b'))
    except Exception as e: print('  no espeak fallback:', e, flush=True)
    import re
    # the phonemizer chokes on a few symbols; plain letters, digits and basic punctuation always work
    def clean(t): return re.sub(r'\s+', ' ', re.sub(r"[^A-Za-z0-9 ,.!?'\-]", ' ', t)).strip()
    t0 = time.time()
    for n, l in enumerate(todo, 1):
        if args.budget and time.time() - t0 > args.budget: print(f'  paused after {n - 1}; run again to continue', flush=True); break
        audio = None
        for text in (l['text'], clean(l['text'])):
            try: audio = np.concatenate([a for _, _, a in pipe(text, voice=args.voice, speed=args.speed)]); break
            except Exception as e: print(f'  retry {l["key"]}: {e}', flush=True)
        if audio is None: print(f'  skipped {l["key"]}: {l["text"][:60]}', flush=True); continue
        # a breath of silence at both ends, gentle fade, normalized level
        pad = np.zeros(int(24000 * 0.12), dtype=np.float32)
        audio = np.concatenate([pad, audio.astype(np.float32), pad])
        peak = float(np.max(np.abs(audio))) or 1.0
        audio = audio * (0.89 / peak)
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as t:
            sf.write(t.name, audio, 24000)
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', t.name, '-ac', '1', '-ar', '24000', '-b:a', '40k', os.path.join(OUT, l['key'] + '.mp3')], check=True)
            os.unlink(t.name)
        if n % 20 == 0: print(f'  {n}/{len(todo)}', flush=True)
# the list the app reads, plus the voice used
keys = sorted({l['key'] for l in lines if os.path.exists(os.path.join(OUT, l['key'] + '.mp3'))})
json.dump({'voice': args.voice, 'lines': keys}, open(os.path.join(OUT, 'index.json'), 'w'))
# drop recordings no line uses any more
for f in os.listdir(OUT):
    if f.endswith('.mp3') and f[:-4] not in keys: os.unlink(os.path.join(OUT, f))
print(f'done: {len(keys)} recordings in public/voice', flush=True)
