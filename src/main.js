import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { calculateTopRoutes } from './dropcalc.js';
import { COLORS } from './pois.js';

const $ = (id) => document.getElementById(id);

// ---------- Mapa (mismo encuadre por defecto que Titan: grilla 256u centrada) ----------
const map = L.map('map', {
  crs: L.CRS.Simple, center: [-128, 128], zoom: 2,
  minZoom: 0, maxZoom: 7, zoomSnap: 0.5, zoomControl: false,
  attributionControl: false,
});
L.tileLayer('https://fortnite.gg/maps/42.30/{z}/{x}/{y}.webp', {
  noWrap: true, bounds: [[-256, 0], [0, 256]], minNativeZoom: 3, maxNativeZoom: 5, maxZoom: 7,
}).addTo(map);

function fitIsland() {
  const s = map.getSize();
  const z = Math.max(0, Math.min(7, Math.floor(Math.log2(Math.min(s.x, s.y) / 256) * 2) / 2));
  map.setView([-128, 128], z, { animate: false });
}
fitIsland();

// ---------- Estado ----------
let landing = null; // [lat,lng]
let busA = null, busB = null;
let layers = [];
const pinColor = COLORS[0];

$('clearAll').onclick = () => { landing = busA = busB = null; redraw(); save(); };
$('clearBus').onclick = () => { busA = busB = null; redraw(); save(); };

// ---------- Persistencia + share ----------
function save() {
  try {
    localStorage.setItem('dropcalc', JSON.stringify({ landing, busA, busB }));
    const u = new URL(location.href);
    u.searchParams.delete('t'); u.searchParams.delete('b');
    if (landing) u.searchParams.set('t', landing.map((n) => n.toFixed(1)).join(','));
    if (busA && busB) u.searchParams.set('b', [...busA, ...busB].map((n) => n.toFixed(1)).join(','));
    history.replaceState(null, '', u);
  } catch { /* noop */ }
}
function load() {
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('t')) {
      const [a, b] = q.get('t').split(',').map(Number);
      if (isFinite(a) && isFinite(b)) landing = [a, b];
    }
    if (q.get('b')) {
      const n = q.get('b').split(',').map(Number);
      if (n.length === 4 && n.every(isFinite)) { busA = [n[0], n[1]]; busB = [n[2], n[3]]; }
    }
    if (landing || busA) return true;
    const s = JSON.parse(localStorage.getItem('dropcalc') || 'null');
    if (s) { landing = s.landing || null; busA = s.busA || null; busB = s.busB || null; return !!(landing || busA); }
  } catch { /* noop */ }
  return false;
}
function showToast(msg, ms = 2200) {
  const toast = $('toast');
  toast.textContent = msg; toast.style.display = 'block';
  clearTimeout(showToast._t); showToast._t = setTimeout(() => (toast.style.display = 'none'), ms);
}

// ---------- Marcadores (estilo visual de Titan Dropcalc) ----------
const ROUTE_COLORS = ['#5b7fff', '#facc15', '#c0c0c0'];

function pinIcon(color) {
  return L.divIcon({
    className: '',
    html: `<svg width="28" height="40" viewBox="0 0 28 40" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))"><path d="M14,38 C14,38 26,22 26,14 A12,12 0 0,0 2,14 C2,22 14,38 14,38 Z" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="14" cy="14" r="5" fill="#fff"/></svg>`,
    iconSize: [28, 40], iconAnchor: [14, 40],
  });
}

function jumpDot(latlng, idx) {
  const col = ROUTE_COLORS[idx] || ROUTE_COLORS[2];
  const size = idx === 0 ? 14 : 10;
  const bw = idx === 0 ? 2 : 1;
  layers.push(L.marker(latlng, {
    icon: L.divIcon({
      className: '',
      html: `<div style="width:${size}px;height:${size}px;background:${col};border:${bw}px solid #fff;border-radius:50%;box-shadow:0 0 8px ${col}80;"></div>`,
      iconSize: [size, size], iconAnchor: [size / 2, size / 2],
    }),
    interactive: false,
    zIndexOffset: idx === 0 ? 1200 : 900,
  }).addTo(map));
}

const EVENT_STYLE = {
  deploy: {
    border: '#22c55e', label: 'DEPLOY',
    svg: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="#fff"/>` +
      `<path d="M6.5 17.5a9.5 9.5 0 0 1 19 0z" fill="#22c55e"/>` +
      `<path d="M6.5 17.5 14 24M25.5 17.5 18 24M16 17.5V24" stroke="#22c55e" stroke-width="1.4" fill="none"/>` +
      `<circle cx="16" cy="25.5" r="2.6" fill="#22c55e"/></svg>`,
  },
  cut: {
    border: '#a3e635', label: 'CUT',
    svg: (s) => `<svg width="${s}" height="${s}" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="#a855f7"/>` +
      `<g stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"><path d="M10.5 8.5 21.5 21"/>` +
      `<path d="M21.5 8.5 10.5 21"/><circle cx="10" cy="23.5" r="2.7"/><circle cx="22" cy="23.5" r="2.7"/></g></svg>`,
  },
};
function eventMarker(latlng, kind, withBadge, zIndexOffset) {
  const s = EVENT_STYLE[kind];
  const size = withBadge ? 32 : 22;
  const html = `<div style="position:relative;display:flex;flex-direction:column;align-items:center;">` +
    `<div style="width:${size}px;height:${size}px;filter:drop-shadow(0 0 4px rgba(0,0,0,.5));${withBadge ? '' : 'opacity:.7;'}">${s.svg(size)}</div>` +
    (withBadge
      ? `<div style="margin-top:2px;background:rgba(0,0,0,.85);color:#fff;padding:2px 6px;border-radius:4px;font-size:9px;white-space:nowrap;font-weight:600;border:1px solid ${s.border};">${s.label}</div>`
      : '') +
    `</div>`;
  layers.push(L.marker(latlng, {
    icon: L.divIcon({
      className: '', html,
      iconSize: withBadge ? [32, 52] : [22, 22],
      iconAnchor: withBadge ? [16, 16] : [11, 11],
    }),
    interactive: false,
    zIndexOffset,
  }).addTo(map));
}

function reopenMarker(latlng, seconds) {
  layers.push(L.marker(latlng, {
    icon: L.divIcon({
      className: '',
      html: `<div style="position:relative;">` +
        `<div style="width:14px;height:14px;background:#e879f9;border:2px solid #fff;border-radius:50%;box-shadow:0 0 8px rgba(232,121,249,.5);"></div>` +
        `<div style="position:absolute;bottom:22px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.85);color:#fff;padding:3px 8px;border-radius:4px;font-size:10px;white-space:nowrap;font-weight:500;border:1px solid #e879f9;">Re-Open at ~${seconds}s</div></div>`,
      iconSize: [14, 36], iconAnchor: [7, 7],
    }),
    interactive: false,
    zIndexOffset: 1150,
  }).addTo(map));
}

function busEndpoint(latlng, start) {
  const c = start ? '#00c8ff' : '#5b7fff';
  const m = L.marker(latlng, {
    icon: L.divIcon({ className: '', html: `<div style="width:18px;height:18px;background:${c};border:2px solid #fff;border-radius:50%;box-shadow:0 0 8px ${c}80;"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] }),
    draggable: true,
  }).addTo(map);
  m.on('dragend', (e) => {
    const ll = e.target.getLatLng();
    if (start) busA = [ll.lat, ll.lng]; else busB = [ll.lat, ll.lng];
    redraw(); save();
  });
  layers.push(m);
}

// Rutas 2 y 3 se dibujan con un "bulge" sinusoidal (amplitud 5% de la longitud del tramo).
function bulgePath(from, to, sign) {
  const d0 = to[0] - from[0], d1 = to[1] - from[1];
  const len = Math.hypot(d0, d1);
  if (!sign || len < 1e-9) return [from, to];
  const n = Math.max(20, Math.floor(len / 120));
  const px = -d1 / len, py = d0 / len;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = sign * 0.05 * len * Math.sin(Math.PI * t);
    pts.push([from[0] + d0 * t + px * a, from[1] + d1 * t + py * a]);
  }
  return pts;
}

// ---------- Flujo de clics (idéntico al de Titan) ----------
// sin destino → destino · destino sin bus → entrada · entrada sin salida → salida · completo → se ignora
map.on('click', (e) => {
  const p = [e.latlng.lat, e.latlng.lng];
  if (!landing) landing = p;
  else if (!busA) busA = p;
  else if (!busB) busB = p;
  else return;
  redraw(); save();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') $('clearBus').click();
});

// ---------- Dibujo ----------
function clearLayers() { layers.forEach((l) => map.removeLayer(l)); layers = []; }

function redraw() {
  clearLayers();
  if (landing) layers.push(L.marker(landing, { icon: pinIcon(pinColor), zIndexOffset: 1000 }).addTo(map));
  if (busA) busEndpoint(busA, true);
  if (busA && busB) {
    busEndpoint(busB, false);
    layers.push(L.polyline([busA, busB], { color: '#00d4ff', weight: 12, opacity: 0.2 }).addTo(map));
    layers.push(L.polyline([busA, busB], { color: '#00d4ff', weight: 5, opacity: 0.9, dashArray: '18,14' }).addTo(map));
  }
  if (!(landing && busA && busB)) return;

  calculateTopRoutes(busA, busB, landing, 3).forEach((r, idx) => {
    const sel = idx === 0;
    const col = ROUTE_COLORS[idx] || ROUTE_COLORS[2];
    const bend = idx === 1 ? -1 : idx === 2 ? 1 : 0;
    r.segments.forEach((s) => {
      const isFinal = s.type === 'glide' && s.to === r.landingPoint;
      let weight, opacity, dash;
      if (isFinal) { weight = sel ? 2 : 1.5; opacity = sel ? 0.7 : 0.45; dash = '6,5'; }
      else if (s.type === 'cut-fall') { weight = sel ? 2.5 : 2; opacity = sel ? 0.9 : 0.55; dash = undefined; }
      else { weight = sel ? 3 : 2.2; opacity = sel ? 0.9 : 0.55; dash = '10,8'; }
      layers.push(L.polyline(bulgePath(s.from, s.to, bend), {
        color: isFinal ? '#94a3b8' : col, weight, opacity, dashArray: dash,
      }).addTo(map));
    });
    jumpDot(r.jumpPoint, idx);
    if (r.deployPoint) eventMarker(r.deployPoint, 'deploy', sel, sel ? 1250 : 1050);
    if (r.cutPoint) eventMarker(r.cutPoint, 'cut', sel, sel ? 1100 : 1050);
    if (sel && r.reopenPoint) {
      const g = r.segments.find((x) => x.type === 'glide' && x.to !== r.landingPoint);
      reopenMarker(r.reopenPoint, Math.round(r.tBus + r.tFreefall + (g ? g.time : 0)));
    }
  });
}

// init
if (load()) redraw();
else if (!localStorage.getItem('dropcalc-hint')) {
  localStorage.setItem('dropcalc-hint', '1');
  setTimeout(() => showToast('Clic: destino · después, 2 clics: entrada y salida del bus', 6000), 700);
}
