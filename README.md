# Catch a Satellite

Real photos of Earth that we pulled down ourselves from Russian Meteor-M weather satellites: predict the pass, record the raw radio signal through public volunteer receivers, decode it, and show the pictures on a 3D globe.

Live: https://catch-a-satellite.sites.tab.bot/

## What's inside
- `site/`: the web app (3D globe with globe.gl, pass predictions with satellite.js / SGP4, gallery of decoded images in `site/img`, capture log in `site/data/captures.json`)
- `site/freebuff/skyplot.js`: the sky-plot widget
- `capture/spy_rec.py`: minimal SpyServer IQ recorder (records raw IQ from a public receiver)
- `capture/meteor_lrpt_catcher.py`: schedules passes, records them and decodes Meteor-M LRPT with SatDump
- `capture/build_data.py`: builds `site/data/captures.json` from the capture output
- `test/site.test.js`: basic checks (`node --test test/`)

## Run locally
```bash
cd site && python3 -m http.server 8080
# open http://localhost:8080
```
Capturing new passes needs Python 3, NumPy, Pillow and a SatDump install.

## Tech
globe.gl / three.js, satellite.js (SGP4, MIT), vanilla JS. Capture: Python, SpyServer protocol, SatDump.

## Credits
Orbital elements from CelesTrak. Signals came through volunteers' public SpyServer receivers, credited on each photo. Not our antenna.
