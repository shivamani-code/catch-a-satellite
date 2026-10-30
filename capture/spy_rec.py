#!/usr/bin/env python3
"""Minimal SpyServer IQ recorder (protocol 2.0.1700). Writes signed 8-bit (cs8) or 16-bit (cs16) interleaved IQ.
usage: spy_rec.py host port freq_hz decimation fmt(8|16) seconds out_path [gain|-] [digital_gain|-]"""
import socket, struct, sys, time, json, os
host, port, freq, dec, fmt, secs, out = sys.argv[1], int(sys.argv[2]), int(float(sys.argv[3])), int(sys.argv[4]), int(sys.argv[5]), float(sys.argv[6]), sys.argv[7]
gain = None if len(sys.argv) < 9 or sys.argv[8] == '-' else int(sys.argv[8])
dgain = None if len(sys.argv) < 10 or sys.argv[9] == '-' else int(sys.argv[9])
PROTO = (2 << 24) | (0 << 16) | 1700
TR = bytes(((i - 128) & 0xff) for i in range(256))
def cmd(s, c, body): s.sendall(struct.pack('<II', c, len(body)) + body)
def setting(s, sid, *vals): cmd(s, 2, struct.pack('<I', sid) + b''.join(struct.pack('<I', v) for v in vals))
s = socket.create_connection((host, port), timeout=15)
s.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 8 << 20)
cmd(s, 0, struct.pack('<I', PROTO) + b'catch-a-satellite')
buf = bytearray(); dev = sync = None; t0 = time.time()
def read_msgs():
    global buf
    msgs = []
    while len(buf) >= 20:
        pid, mt, st, seq, bs = struct.unpack_from('<5I', buf, 0)
        if len(buf) < 20 + bs: break
        msgs.append((mt & 0xffff, seq, bytes(buf[20:20 + bs]))); del buf[:20 + bs]
    return msgs
while (dev is None or sync is None) and time.time() - t0 < 15:
    d = s.recv(65536)
    if not d: break
    buf += d
    for mt, seq, b in read_msgs():
        if mt == 0: dev = struct.unpack('<12I', b[:48])
        elif mt == 1: sync = struct.unpack('<9I', b[:36])
if dev is None: print(json.dumps({'error': 'no device info'})); sys.exit(2)
maxsr, decstages, maxgain, res, miniqdec = dev[2], dev[4], dev[6], dev[9], dev[10]
sr = maxsr / (1 << dec)
iqfmt = 1 if fmt == 8 else 2   # UINT8 / INT16
setting(s, 0, 1)        # streaming mode: IQ only
setting(s, 100, iqfmt)  # IQ format
setting(s, 101, freq)   # IQ frequency
setting(s, 102, dec)    # IQ decimation
if gain is not None and sync and sync[0]: setting(s, 2, gain)
if dgain is None:
    # same rule the reference clients use: device-dependent headroom + 3 dB per decimation stage
    dtype = dev[0]
    dgain = int((maxgain - (gain if gain is not None else (sync[1] if sync else 0))) + dec * 3.01) if dtype == 1 else int(dec * 3.01)
setting(s, 103, dgain)
setting(s, 1, 1)        # start streaming
f = open(out, 'ab'); n = 0; lastseq = None; lost = 0; msgs_n = 0; start = time.time(); s.settimeout(10)
import math
cal = fmt == 8; cal_buf = []; cal_t = time.time() + 0.4; cal_steps = 0; cal_log = []
TARGET = 20.0
try:
    while time.time() - start < secs:
        d = s.recv(1 << 20)
        if not d: break
        buf += d
        for mt, seq, b in read_msgs():
            if mt in (100, 101):
                if lastseq is not None and seq != (lastseq + 1) & 0xffffffff:
                    gap = (seq - lastseq - 1) & 0xffffffff
                    if 0 < gap < 2000:
                        lost += gap; f.write(bytes(len(b) * gap)); n += gap * len(b) // (2 if mt == 100 else 4)
                lastseq = seq; msgs_n += 1
                if mt == 100:
                    a = bytes(b).translate(TR)
                    if cal:
                        cal_buf.append(a)
                        if time.time() >= cal_t:
                            import array
                            arr = array.array('b', b''.join(cal_buf)); cal_buf = []
                            m = sum(v * v for v in arr) / max(1, len(arr)); sd = math.sqrt(m)
                            cal_log.append((dgain, round(sd, 2)))
                            if (8 <= sd <= 40) or cal_steps >= 8:
                                cal = False
                            else:
                                step = 20.0 if sd < 0.3 else 20 * math.log10(TARGET / sd)
                                dgain = int(max(0, min(127, round(dgain + step)))); setting(s, 103, dgain); cal_steps += 1
                                cal_t = time.time() + 0.5
                    f.write(a); n += len(b) // 2
                else:
                    f.write(b); n += len(b) // 4
except socket.timeout:
    pass
el = time.time() - start
f.close(); s.close()
print(json.dumps({'samplerate': sr, 'decimation': dec, 'format': 'cs8' if fmt == 8 else 'cs16', 'seconds': round(el, 2), 'samples': n, 'rate_pct': round(100 * n / (sr * el), 1) if el else 0, 'msgs': msgs_n, 'lost_msgs': lost, 'digital_gain': dgain, 'calibration': cal_log, 'device': list(dev), 'sync': list(sync) if sync else None}))
