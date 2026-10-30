const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const SITE = path.join(__dirname, '..', 'site');
const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(SITE, 'app.js'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(SITE, 'data', 'captures.json'), 'utf8'));

test('title, viewport and core sections exist', () => {
  assert.match(html, /<title>Catch a Satellite[^<]+<\/title>/);
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1/);
  for (const id of ['globe', 'pass', 'photos', 'how', 'log', 'countdown', 'gallery']) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /How we caught it/);
});
test('local assets referenced exist', () => {
  const refs = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map(m => m[1]).filter(r => !r.startsWith('http'));
  for (const r of refs) assert.ok(fs.existsSync(path.join(SITE, r.split('?')[0])), 'missing ' + r);
});
test('orbit maths uses live TLEs with a local fallback and Hyderabad coords', () => {
  assert.match(app, /celestrak\.org\/NORAD\/elements\/gp\.php/);
  assert.match(app, /data\/tle\.txt/);
  assert.match(app, /17\.385/); assert.match(app, /78\.4867/);
  const tle = fs.readFileSync(path.join(SITE, 'data', 'tle.txt'), 'utf8');
  assert.match(tle, /^1 57166U/m); assert.match(tle, /^1 59051U/m);
});
test('every gallery image is a real local file with full labels', () => {
  for (const c of data.captures) {
    for (const k of ['title', 'sat', 'utc', 'shows', 'how', 'img', 'product']) assert.ok(c[k], `capture missing ${k}`);
    assert.ok(fs.existsSync(path.join(SITE, c.img)), 'missing image ' + c.img);
    if (c.waterfall) assert.ok(fs.existsSync(path.join(SITE, c.waterfall)), 'missing waterfall ' + c.waterfall);
  }
});
test('no placeholders or lorem', () => {
  for (const s of [html, app]) { assert.ok(!/lorem ipsum|TODO|FIXME|\{\{/i.test(s)); }
});
test('site stays under the host upload limit', () => {
  let total = 0; const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p); st.isDirectory() ? walk(p) : total += st.size; } };
  walk(SITE); assert.ok(total < 1250000, 'site is ' + total + ' bytes');
});
