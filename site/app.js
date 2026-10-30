(function(){
'use strict';
const HYD={lat:17.385,lon:78.4867,name:'Hyderabad'};
const SATS=[{id:57166,name:'Meteor-M N2-3',short:'N2-3',color:'#ffb547'},{id:59051,name:'Meteor-M N2-4',short:'N2-4',color:'#5ee7ff'}];
const sat=window.satellite;
const $=id=>document.getElementById(id);
const deg=r=>r*180/Math.PI, rad=d=>d*Math.PI/180;
const pad=n=>String(n).padStart(2,'0');
const fmtIST=(d,opt)=>d.toLocaleString('en-IN',Object.assign({timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit',hour12:true},opt||{}));
const compass=a=>['N','NE','E','SE','S','SW','W','NW'][Math.round(((a%360)+360)%360/45)%8];
let DATA={captures:[],attempts:[],receivers:[]};

async function fetchText(url,ms){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms||6000);try{const r=await fetch(url,{signal:c.signal,cache:'no-store'});if(!r.ok)throw new Error(r.status);return await r.text();}finally{clearTimeout(t);}}
function parseTLE(txt){const L=txt.split(/\r?\n/).map(s=>s.trimEnd()).filter(Boolean);const out={};for(let i=0;i<L.length-1;i++){if(L[i].startsWith('1 ')&&L[i+1].startsWith('2 ')){out[parseInt(L[i].slice(2,7),10)]=[L[i],L[i+1]];i++;}}return out;}
async function loadTLEs(){
  let tl={};
  try{const t=await fetchText('https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=tle',7000);tl=parseTLE(t);}catch(e){}
  if(!SATS.every(s=>tl[s.id])){try{const f=parseTLE(await fetchText('data/tle.txt',5000));SATS.forEach(s=>{if(!tl[s.id])tl[s.id]=f[s.id];});}catch(e){}}
  SATS.forEach(s=>{if(tl[s.id]){s.tle=tl[s.id];s.rec=sat.twoline2satrec(tl[s.id][0],tl[s.id][1]);}});
}
function posAt(s,date){const pv=sat.propagate(s.rec,date);if(!pv||!pv.position)return null;const g=sat.gstime(date);const gd=sat.eciToGeodetic(pv.position,g);const v=pv.velocity;return{lat:deg(gd.latitude),lon:deg(gd.longitude),alt:gd.height,speed:Math.hypot(v.x,v.y,v.z),eci:pv.position,gmst:g};}
const obs={latitude:rad(HYD.lat),longitude:rad(HYD.lon),height:0.5};
function lookAt(s,date){const p=posAt(s,date);if(!p)return null;const ecf=sat.eciToEcf(p.eci,p.gmst);const la=sat.ecfToLookAngles(obs,ecf);return{el:deg(la.elevation),az:deg(la.azimuth)};}
function sunEl(date,lat,lon){const d=(date-Date.UTC(2000,0,1,12))/864e5;const g=rad((357.529+0.98560028*d)%360);const q=(280.459+0.98564736*d)%360;const L=rad(q+1.915*Math.sin(g)+0.020*Math.sin(2*g));const e=rad(23.439-0.00000036*d);const ra=Math.atan2(Math.cos(e)*Math.sin(L),Math.cos(L));const dec=Math.asin(Math.sin(e)*Math.sin(L));const gmst=(18.697374558+24.06570982441908*d)%24;const ha=rad(gmst*15+lon)-ra;return deg(Math.asin(Math.sin(rad(lat))*Math.sin(dec)+Math.cos(rad(lat))*Math.cos(dec)*Math.cos(ha)));}

function findPasses(hours){
  const out=[];const now=Date.now();const step=30e3;
  SATS.forEach(s=>{if(!s.rec)return;let inP=false,cur=null;
    for(let t=now-20*60e3;t<now+hours*3600e3;t+=step){const la=lookAt(s,new Date(t));if(!la)continue;
      if(la.el>0&&!inP){inP=true;cur={s,aos:t,max:la.el,tca:t,azA:la.az};}
      else if(inP){if(la.el>cur.max){cur.max=la.el;cur.tca=t;}if(la.el<=0){inP=false;cur.los=t;cur.azL=la.az;out.push(cur);cur=null;}}}
  });
  out.forEach(p=>{let a=p.aos-step,b=p.aos;for(let i=0;i<12;i++){const m=(a+b)/2;(lookAt(p.s,new Date(m)).el>0)?b=m:a=m;}p.aos=b;
    a=p.los-step;b=p.los;for(let i=0;i<12;i++){const m=(a+b)/2;(lookAt(p.s,new Date(m)).el>0)?a=m:b=m;}p.los=a;
    let best=p.tca,bm=p.max;for(let t=p.tca-40e3;t<=p.tca+40e3;t+=2e3){const e=lookAt(p.s,new Date(t)).el;if(e>bm){bm=e;best=t;}}p.tca=best;p.max=bm;
    p.day=sunEl(new Date(p.tca),HYD.lat,HYD.lon)>-3;});
  return out.filter(p=>p.max>=10&&p.los>now).sort((x,y)=>x.aos-y.aos);
}

let passes=[];
function renderPasses(){
  const list=$('passList');list.innerHTML='';
  passes.slice(0,6).forEach(p=>{const li=document.createElement('li');const d=new Date(p.aos);
    li.innerHTML=`<span class="t">${fmtIST(d,{weekday:'short'})}</span><span class="s">${p.s.short} · ${compass(p.azA)} → ${compass(p.azL)} · ${p.day?'☀️ day':'🌙 night'}</span><span class="el ${p.max>=40?'hi':''}">${Math.round(p.max)}°</span>`;list.appendChild(li);});
}
function tickCountdown(){
  if(!passes.length)return;const now=Date.now();
  while(passes.length&&passes[0].los<now)passes.shift();
  const p=passes[0];if(!p)return;const box=document.querySelector('.pass');
  let target,html;
  if(now>=p.aos){const la=lookAt(p.s,new Date(now));box.classList.add('now');target=p.los;
    html=`<b>${p.s.name} is above Hyderabad right now</b>: ${Math.max(0,la.el).toFixed(0)}° up, toward the ${compass(la.az)}. It sets in:`;}
  else{box.classList.remove('now');target=p.aos;
    html=`<b>${p.s.name}</b> rises at <b>${fmtIST(new Date(p.aos))}</b> IST in the ${compass(p.azA)} and climbs to <b>${Math.round(p.max)}°</b> at ${fmtIST(new Date(p.tca))}. ${p.day?'Daylight pass: a visible-light photo.':'Night pass: it sends infrared.'}`;}
  const s=Math.max(0,Math.floor((target-now)/1000));$('cdH').textContent=pad(Math.floor(s/3600));$('cdM').textContent=pad(Math.floor(s%3600/60));$('cdS').textContent=pad(s%60);
  const pd=$('passDetail');if(pd.dataset.h!==html){pd.innerHTML=html;pd.dataset.h=html;}
  if(window.SkyPlot&&(now-lastSky>4000||skyFor!==p)){lastSky=now;
    if(skyFor!==p){skyFor=p;skyPts=[];for(let t=p.aos;t<=p.los;t+=15e3){const la=lookAt(p.s,new Date(t));skyPts.push({t,az:la.az,el:Math.max(0,la.el)});}}
    const mx=lookAt(p.s,new Date(p.tca));
    window.SkyPlot.render($('skyplot'),{points:skyPts,max:{az:mx.az,el:mx.el,t:p.tca},color:p.s.color,label:p.s.name+' over Hyderabad'},{now});}
}
let lastSky=0,skyFor=null,skyPts=[];

function chips(){const el=$('satChips');el.innerHTML='';SATS.forEach(s=>{const c=document.createElement('button');c.type='button';c.className='chip';c.setAttribute('aria-label','Fly the globe to '+s.name);c.addEventListener('click',()=>{if(!G||!s.rec)return;const p=posAt(s,new Date());G.controls().autoRotate=false;G.pointOfView({lat:p.lat,lng:p.lon,altitude:1.9},1600);document.getElementById('top').scrollIntoView({behavior:'smooth'});});c.innerHTML=`<b><span class="sw" style="background:${s.color}"></span>${s.name}</b><span class="num" id="chip${s.id}">…</span>`;el.appendChild(c);});}
function updChips(){const now=new Date();SATS.forEach(s=>{if(!s.rec)return;const p=posAt(s,now);const e=$('chip'+s.id);if(p&&e)e.textContent=`${Math.abs(p.lat).toFixed(1)}°${p.lat>=0?'N':'S'} ${Math.abs(p.lon).toFixed(1)}°${p.lon>=0?'E':'W'} · ${Math.round(p.alt)} km · ${(p.speed*3600).toLocaleString('en-IN',{maximumFractionDigits:0})} km/h`;});}

// ---------- globe ----------
let G=null;
function track(s,center,minsBack,minsFwd){const pts=[];for(let m=-minsBack;m<=minsFwd;m+=1){const p=posAt(s,new Date(center+m*60e3));if(p)pts.push([p.lat,p.lon,0.012]);}return pts;}
function satMarkers(){const now=new Date();return SATS.filter(s=>s.rec).map(s=>{const p=posAt(s,now);return{lat:p.lat,lng:p.lon,alt:Math.min(0.14,p.alt/6371),s};});}
function initGlobe(){
  const host=$('globe');
  if(typeof Globe!=='function'){host.innerHTML='<div class="globe-fallback">The 3D globe could not load on this connection. The countdown and photos below still work.</div>';return;}
  const W=()=>host.clientWidth,H=()=>host.clientHeight;
  G=Globe({rendererConfig:{antialias:true,alpha:true,powerPreference:'low-power'}})(host)
    .width(W()).height(H()).backgroundColor('rgba(0,0,0,0)')
    .globeImageUrl('https://cdn.jsdelivr.net/npm/three-globe@2.41.12/example/img/earth-blue-marble.jpg')
    .bumpImageUrl('https://cdn.jsdelivr.net/npm/three-globe@2.41.12/example/img/earth-topology.png')
    .backgroundImageUrl('https://cdn.jsdelivr.net/npm/three-globe@2.41.12/example/img/night-sky.png')
    .showAtmosphere(true).atmosphereColor('#6fb6ff').atmosphereAltitude(0.18)
    .pathPoints(d=>d.pts).pathPointLat(p=>p[0]).pathPointLng(p=>p[1]).pathPointAlt(p=>p[2])
    .pathColor(d=>d.color).pathStroke(d=>d.w).pathDashLength(d=>d.dash).pathDashGap(d=>d.gap).pathDashAnimateTime(d=>d.anim).pathTransitionDuration(0)
    .ringsData([{lat:HYD.lat,lng:HYD.lon}]).ringColor(()=>t=>`rgba(255,79,123,${1-t})`).ringMaxRadius(5).ringPropagationSpeed(2.2).ringRepeatPeriod(1400)
    .pointsData([]).pointLat('lat').pointLng('lng').pointColor('c').pointAltitude(0.006).pointRadius('r').pointsMerge(false)
    .htmlElementsData([]).htmlLat('lat').htmlLng('lng').htmlAltitude('alt')
    .htmlElement(d=>{const el=document.createElement('div');el.style.cssText='transform:translate(-50%,-50%);pointer-events:none;display:flex;align-items:center;gap:6px;white-space:nowrap;font:700 11px system-ui;color:#fff;text-shadow:0 1px 3px #000';
      el.innerHTML=d.kind==='sat'?`<span style="width:12px;height:12px;border-radius:50%;background:${d.s.color};box-shadow:0 0 14px 4px ${d.s.color}"></span>🛰️ ${d.s.short}`:`<span style="width:8px;height:8px;border-radius:50%;background:#ff4f7b;box-shadow:0 0 10px #ff4f7b"></span>${d.label}`;return el;});
  G.controls().autoRotate=true;G.controls().autoRotateSpeed=0.35;G.controls().enableDamping=true;
  host.addEventListener('pointerdown',()=>{G.controls().autoRotate=false;},{passive:true});
  G.pointOfView({lat:18,lng:80,altitude:window.innerWidth<600?2.9:2.2},0);
  window.addEventListener('resize',()=>{G.width(W()).height(H());});
  refreshGlobe(true);
  setInterval(()=>refreshGlobe(false),2000);
  setInterval(()=>refreshGlobe(true),60000);
}
function refreshGlobe(full){
  if(!G)return;const now=Date.now();
  const html=satMarkers().map(m=>Object.assign({kind:'sat'},m));html.push({kind:'city',lat:HYD.lat,lng:HYD.lon,alt:0.01,label:'Hyderabad'});
  G.htmlElementsData(html);
  if(full){const paths=[];SATS.forEach(s=>{if(!s.rec)return;paths.push({pts:track(s,now,50,0),color:[s.color+'00',s.color+'cc'],w:1.6,dash:1,gap:0,anim:0});paths.push({pts:track(s,now,0,50),color:s.color+'88',w:0.9,dash:0.02,gap:0.015,anim:9000});});
    (DATA.captures||[]).forEach(c=>{if(c.track&&c.track.length)paths.push({pts:c.track.map(p=>[p[0],p[1],0.008]),color:'#a7ff6bcc',w:2.4,dash:1,gap:0,anim:0});});
    G.pathsData(paths);
    G.pointsData((DATA.receivers||[]).map(r=>({lat:r.lat,lng:r.lon,c:r.ok?'#a7ff6b':'#7d8bb0',r:r.ok?0.5:0.3})));}
}

// ---------- gallery + log ----------
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function renderGallery(){
  const g=$('gallery');g.innerHTML='';const caps=DATA.captures||[];
  if(!caps.length){const nxt=(DATA.schedule||[]).slice(0,4).map(x=>`<li>${esc(x.utc)} UTC · ${esc(x.sat)} · ${esc(x.where)}</li>`).join('');
    g.innerHTML=`<div class="empty"><b>Antennas are pointed. The first catch is pending.</b><p>Our recorder is scheduled to grab these passes live:</p><ul style="text-align:left;display:inline-block;margin:0">${nxt||'<li>next passes being scheduled</li>'}</ul></div>`;return;}
  caps.forEach(c=>{const a=document.createElement('article');a.className='shot';
    a.innerHTML=`${c.zoom?`<figure class="zoom"><img src="${esc(c.zoom)}" alt="Zoomed patch of our decode" loading="lazy" width="800" height="480"><figcaption><b>Zoom</b> ${esc(c.zoom_caption||'')}</figcaption></figure>`:''}<button class="img" aria-label="Open full size: ${esc(c.title)}"><img src="${esc(c.img)}" alt="${esc(c.alt||c.title)}" loading="lazy" width="${c.w||800}" height="${c.h||1000}"></button>
    <div class="meta"><h3>${esc(c.title)}</h3>
    <div class="tags"><span class="tag g">decoded by us</span><span class="tag">${esc(c.sat)}</span><span class="tag">${esc(c.utc)} UTC</span><span class="tag">${esc(c.product)}</span></div>
    <p>${esc(c.shows)}</p>
    <details><summary>How this one was caught</summary><p>${esc(c.how)}</p>${c.waterfall?`<div class="wf"><img src="${esc(c.waterfall)}" alt="Waterfall of our raw recording: frequency across, time down" loading="lazy"><span>Our raw recording as a waterfall: frequency left to right, time top to bottom. The bright band in the middle is the satellite's signal, wobbling as Doppler shifts it.</span></div>`:''}</details></div>`;
    a.querySelector('button').addEventListener('click',()=>openLB(c.full||c.img,c.title+' · '+c.utc+' UTC'));g.appendChild(a);});
}
function renderLog(){const b=$('logBody');b.innerHTML='';(DATA.attempts||[]).forEach(r=>{const tr=document.createElement('tr');const cls=r.result_class||'wait';tr.innerHTML=`<td>${esc(r.utc)}</td><td>${esc(r.sat)}</td><td>${esc(r.where)}</td><td><span class="res ${cls}">${esc(r.result)}</span></td>`;b.appendChild(tr);});
  if(!(DATA.attempts||[]).length)b.innerHTML='<tr><td colspan="4">No passes recorded yet.</td></tr>';}
function openLB(src,cap){$('lbImg').src=src;$('lbImg').alt=cap;$('lbCap').textContent=cap;$('lightbox').hidden=false;$('lbClose').focus();}
$('lbClose').addEventListener('click',()=>{$('lightbox').hidden=true;});
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('lightbox').hidden=true;});

async function main(){
  chips();
  try{DATA=JSON.parse(await fetchText('data/captures.json?v='+Date.now(),6000));}catch(e){}
  renderGallery();renderLog();if((DATA.captures||[]).length){$('heroTitle').innerHTML='We caught photos of Earth <em>straight out of the radio</em>.';}
  await loadTLEs();
  updChips();setInterval(updChips,1000);
  passes=findPasses(48);renderPasses();tickCountdown();setInterval(tickCountdown,1000);
  setInterval(()=>{passes=findPasses(48);renderPasses();},10*60e3);
  const start=()=>{try{initGlobe();}catch(e){$('globe').innerHTML='<div class="globe-fallback">3D globe unavailable on this device.</div>';}};
  if(typeof Globe==='function')start();else window.addEventListener('load',start);
}
main();
})();
