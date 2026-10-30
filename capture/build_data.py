#!/usr/bin/env python3
"""Build data/captures.json for the Catch a Satellite site from the capture daemon's status + SatDump outputs.
Usage: python3 build_data.py  (REC = capture output dir, SITE = ../site; override with CAS_REC_DIR / CAS_SITE_DIR)"""
import json, os, glob, datetime as dt, math
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
REC = os.environ.get('CAS_REC_DIR', os.path.join(HERE, 'rec')); SITE = os.environ.get('CAS_SITE_DIR', os.path.join(os.path.dirname(HERE), 'site'))
jobs = {j['id']: j for j in json.load(open(f'{REC}/jobs.json'))}
active_ids = set(jobs)
for extra in glob.glob(f'{REC}/jobs_*.json'):
    for j in json.load(open(extra)): jobs[j['id']] = j
st = json.load(open(f'{REC}/status.json')) if os.path.exists(f'{REC}/status.json') else {}
places = json.load(open(f'{REC}/places.json')) if os.path.exists(f'{REC}/places.json') else {}
curated = json.load(open(f'{REC}/curated.json')) if os.path.exists(f'{REC}/curated.json') else []
now = dt.datetime.now(dt.timezone.utc)
def where(j):
    return places.get(f"{j['host']}:{j['port']}", f"{j['lat']:.0f}°, {j['lon']:.0f}°")
attempts = []; schedule = []; receivers = {}
for jid, j in sorted(jobs.items(), key=lambda kv: kv[1]['start']):
    s = st.get(jid, {}); state = s.get('state', 'scheduled')
    start = dt.datetime.fromisoformat(j['start'])
    key = f"{j['host']}:{j['port']}"
    rec = receivers.setdefault(key, {'lat': j['lat'], 'lon': j['lon'], 'ok': False})
    row = {'utc': start.strftime('%d %b %H:%M'), 'sat': j['sat'].replace('METEOR-M2 ', 'M2-'), 'where': f"{where(j)} · {j['antenna'] or 'antenna n/a'} · {j['max_el']}°"}
    if state == 'scheduled':
        if start > now and jid in active_ids:
            schedule.append({'utc': start.strftime('%d %b %H:%M'), 'sat': j['sat'], 'where': where(j)})
        continue
    if state == 'done':
        bl = s.get('best_lines', 0)
        if bl > 0:
            row['result'] = f"decoded · {bl} lines"; row['result_class'] = 'ok'; rec['ok'] = True
        else:
            mb = (s.get('rec_bytes') or 0) / 1e6
            row['result'] = s.get('note_short') or f"no lock ({mb:.0f} MB recorded)"; row['result_class'] = 'no'
    elif state == 'record_failed':
        row['result'] = 'receiver busy/offline'; row['result_class'] = 'no'
    elif state in ('recording', 'recorded', 'decoding'):
        row['result'] = state + '…'; row['result_class'] = 'wait'
    elif state == 'skipped_late':
        continue
    else:
        if start > now: continue
        row['result'] = state; row['result_class'] = 'wait'
    attempts.append(row)
attempts.reverse()
out = {'generated': now.isoformat(), 'captures': curated, 'attempts': attempts, 'schedule': schedule[:6], 'receivers': list(receivers.values())}
json.dump(out, open(f'{SITE}/data/captures.json', 'w'), indent=1)
print(len(curated), 'captures;', len(attempts), 'attempts;', len(schedule), 'scheduled')
