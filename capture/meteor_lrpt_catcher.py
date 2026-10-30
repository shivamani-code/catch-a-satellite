#!/usr/bin/env python3
# Catch a Satellite: scheduled live capture of Meteor-M LRPT passes from public SpyServer receivers, decoded with SatDump.
import json, os, sys, time, subprocess, datetime as dt, glob, re, shutil
import numpy as np
REC = os.path.dirname(os.path.abspath(__file__))
LIB = os.path.join(os.path.dirname(REC), 'lib')
ENV = dict(os.environ, LD_LIBRARY_PATH=LIB)
STATUS = os.path.join(REC, 'status.json')
def now(): return dt.datetime.now(dt.timezone.utc)
def load_status():
    try: return json.load(open(STATUS))
    except Exception: return {}
def save_status(st):
    tmp = STATUS + '.tmp'; json.dump(st, open(tmp, 'w'), indent=1); os.replace(tmp, STATUS)
import threading
_LOCK = threading.Lock()
def upd(jid, **kw):
    with _LOCK:
        st = load_status(); st.setdefault(jid, {}).update(kw); save_status(st)

def waterfall(path, sr, out_png, fmt='cs8'):
    try:
        from PIL import Image
        dtype = np.int8 if fmt == 'cs8' else np.int16
        n = os.path.getsize(path) // (2 * np.dtype(dtype).itemsize)
        rows = 400; nfft = 1024
        step = max(n // rows, nfft)
        mm = np.memmap(path, dtype=dtype, mode='r')
        img = []
        for r in range(rows):
            s = r * step
            if s + nfft * 8 > n: break
            x = mm[2*s:2*(s+nfft*8)].astype(np.float32).view(np.complex64) if False else (mm[2*s:2*(s+nfft*8):2].astype(np.float32) + 1j*mm[2*s+1:2*(s+nfft*8):2].astype(np.float32))
            x = x.reshape(8, nfft) * np.hanning(nfft)
            p = (np.abs(np.fft.fftshift(np.fft.fft(x, axis=1), axes=1))**2).mean(0)
            img.append(10*np.log10(p + 1e-9))
        a = np.array(img)
        lo, hi = np.percentile(a, 5), np.percentile(a, 99.7)
        a = np.clip((a - lo) / (hi - lo + 1e-9), 0, 1)
        # inferno-ish colormap
        r = np.clip(a*1.6, 0, 1); g = np.clip(a*1.6-0.5, 0, 1); b = np.clip(0.5 - np.abs(a-0.35)*1.5, 0, 1) + np.clip(a-0.8, 0, 1)*2
        rgb = (np.stack([r, g, np.clip(b,0,1)], -1)*255).astype(np.uint8)
        Image.fromarray(rgb).resize((512, len(a))).save(out_png)
        # crude SNR: band power in +-50kHz vs edges
        f = np.fft.fftshift(np.fft.fftfreq(nfft, 1/sr))
        return True
    except Exception as e:
        return str(e)

def run_job(j):
    jid = j['id']; out = os.path.join(REC, jid); os.makedirs(out, exist_ok=True)
    start = dt.datetime.fromisoformat(j['start']); end = dt.datetime.fromisoformat(j['end'])
    wait = (start - now()).total_seconds()
    if wait > 0: time.sleep(wait)
    dur = int((end - now()).total_seconds())
    if dur < 60: upd(jid, state='skipped_late'); return
    base = os.path.join(out, 'baseband')
    upd(jid, state='recording', rec_started=now().isoformat(), recorder='spy_rec.py (own SpyServer client, 8-bit IQ, auto digital gain)')
    bb_path = base + '.cs8'; attempts = []
    with open(os.path.join(out, 'record.log'), 'a') as lf:
        while (end - now()).total_seconds() > 20 and len(attempts) < 8:
            remaining = int((end - now()).total_seconds())
            cmd = ['/usr/bin/python3', os.path.join(REC, 'spy_rec.py'), j['host'], str(j['port']), str(j['freq']), str(j['decimation']), '8', str(remaining), bb_path]
            lf.write(' '.join(cmd) + '\n'); lf.flush()
            p = subprocess.run(['timeout', '-k', '10', str(remaining + 60)] + cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, cwd=out)
            lf.write(p.stdout + '\n'); lf.flush()
            try: attempts.append(json.loads(p.stdout.strip().splitlines()[-1]))
            except Exception: attempts.append({'error': p.stdout[-300:]})
            if (end - now()).total_seconds() > 20: time.sleep(5)
    rc = 0 if any('samples' in a for a in attempts) else 1
    upd(jid, rec_attempts=[{k: a.get(k) for k in ('seconds', 'samples', 'rate_pct', 'lost_msgs', 'msgs', 'digital_gain', 'error')} for a in attempts])
    files = glob.glob(base + '*')
    size = sum(os.path.getsize(f) for f in files)
    upd(jid, state='recorded', rec_rc=rc, rec_bytes=size, rec_ended=now().isoformat())
    if not files or size < 1e6:
        upd(jid, state='record_failed'); return
    bb = files[0]
    wf = waterfall(bb, j['samplerate'], os.path.join(out, 'waterfall.png'), fmt='cs8')
    dec = os.path.join(out, 'decoded')
    dcmd = ['nice', '-n', '5', 'satdump', 'meteor_m2-x_lrpt', 'baseband', bb, dec, '--samplerate', str(j['samplerate']), '--baseband_format', 'cs8']
    upd(jid, state='decoding', waterfall=wf)
    with open(os.path.join(out, 'decode.log'), 'w') as lf:
        rc = subprocess.call(['timeout', '-k', '10', '3600'] + dcmd, stdout=lf, stderr=subprocess.STDOUT, env=ENV, cwd=out)
    txt = open(os.path.join(out, 'decode.log'), errors='ignore').read()
    lines = {int(m.group(1)): int(m.group(2)) for m in re.finditer(r'MSU-MR Channel (\d) Lines\s*:\s*(\d+)', txt)}
    cadu = os.path.join(dec, 'meteor_m2-x_lrpt.cadu')
    cadu_bytes = os.path.getsize(cadu) if os.path.exists(cadu) else 0
    pngs = glob.glob(os.path.join(dec, '**', '*.png'), recursive=True)
    best = max(lines.values()) if lines else 0
    upd(jid, state='done', dec_rc=rc, lines=lines, cadu_bytes=cadu_bytes, pngs=len(pngs), best_lines=best, done_at=now().isoformat())
    if best == 0 and os.environ.get('CAS_DELETE_EMPTY') == '1':
        for f in files:
            try: os.remove(f)
            except Exception: pass
        upd(jid, baseband_deleted=True)

if __name__ == '__main__':
    import threading
    jobs = json.load(open(sys.argv[1]))
    st = load_status()
    ths = []
    for j in jobs:
        if st.get(j['id'], {}).get('state') in ('done', 'record_failed'): continue
        if dt.datetime.fromisoformat(j['end']) < now(): continue
        upd(j['id'], state='scheduled', **{k: j[k] for k in ('start', 'end', 'host', 'port', 'sat', 'max_el', 'antenna', 'lat', 'lon')})
        t = threading.Thread(target=run_job, args=(j,), daemon=False); t.start(); ths.append(t)
    for t in ths: t.join()
