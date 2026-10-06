/* Drop calculator open-source inspirado en el CONCEPTO de Titan Dropcalc
 * (destino -> bus de 2 puntos -> salto / despliegue / corte / reapertura).
 * Implementación propia, sin copiar su código.
 *
 * Física calibrada a partir de observación del comportamiento Titan
 * (unidades del juego por segundo, convertidas a nuestras unidades de mapa):
 *  - bus:      73.3 uTitan/s  (el más rápido: conviene saltar tarde, no temprano)
 *  - freefall: 48   uTitan/s  (caída libre + caída tras corte)
 *  - glide:    34   uTitan/s  (planeador)
 * Reparto de distancia cuando el drop es largo (>100 uTitan):
 *  58% freefall, 28% glide, 8% cut-fall, 6% glide final.
 * Si es corto (<=100 uTitan): todo freefall directo.
 * 1 uTitan = 104 unidades de juego. Nuestro mapa 256u = 2600960 uds juego.
 */

export const TITAN_LIKE = {
  bus: 73.3,
  freefall: 48,
  glide: 34,
  scale: 104,
  closeThreshold: 100,
  split: [0.58, 0.28, 0.08, 0.06],
};

// 2600960 uds juego = 256 unidades de nuestro mapa (bounds fortnite.gg)
export const GAME_PER_MAP = 2600960 / 256; // 10160
const toTitan = (mapUnits) => (mapUnits * GAME_PER_MAP) / TITAN_LIKE.scale;

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const norm = (a) => {
  const d = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / d, a[1] / d];
};
const advance = (p, dir, titanDist) => {
  const mapDist = (titanDist * TITAN_LIKE.scale) / GAME_PER_MAP;
  return add(p, mul(dir, mapDist));
};

/** Simula UN candidato de salto J -> T, con bus saliendo de B0. Retorna ruta completa. */
export function simulateRoute(jump, landing, busStart, P = TITAN_LIKE) {
  const dMap = dist(jump, landing);
  const dTitan = toTitan(dMap);
  if (dTitan < 1e-9) return null;

  const dir = norm(sub(landing, jump));
  const busTitan = toTitan(dist(busStart, jump));
  const tBus = busTitan / P.bus;
  let total = tBus;
  const segments = [];
  let deploy = null;
  let cut = null;
  let reopen = null;

  if (dTitan <= P.closeThreshold) {
    const t = dTitan / P.freefall;
    total += t;
    segments.push({ type: 'freefall', from: jump, to: landing, time: t });
  } else {
    const [f, g1, c, g2] = P.split.map((s) => s * dTitan);
    const tF = f / P.freefall;
    total += tF;
    deploy = advance(jump, dir, f);
    segments.push({ type: 'freefall', from: jump, to: deploy, time: tF });

    const tG1 = g1 / P.glide;
    total += tG1;
    cut = advance(deploy, dir, g1);
    segments.push({ type: 'glide', from: deploy, to: cut, time: tG1 });

    const tC = c / P.freefall;
    total += tC;
    reopen = advance(cut, dir, c);
    segments.push({ type: 'cut-fall', from: cut, to: reopen, time: tC });

    const tG2 = g2 / P.glide;
    total += tG2;
    segments.push({ type: 'glide', from: reopen, to: landing, time: tG2 });
  }

  const tFree = segments[0]?.time ?? 0;
  const air = total - tBus;
  const byType = { freefall: 0, glide: 0, 'cut-fall': 0 };
  for (const s of segments) byType[s.type] = (byType[s.type] || 0) + s.time;
  return {
    reachable: true,
    jumpPoint: jump,
    deployPoint: deploy,
    cutPoint: cut,
    reopenPoint: reopen,
    landingPoint: landing,
    totalTime: total,
    tBus,
    tFreefall: tFree,
    airTime: air,
    byType,
    segments,
    distanceMap: dMap,
  };
}

/** Punto del segmento busA->busB más cercano al destino (proyección perpendicular, limitada al segmento). */
export function nearestPointOnBus(busA, busB, target) {
  const dx = busB[0] - busA[0];
  const dy = busB[1] - busA[1];
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 0) {
    t = ((target[0] - busA[0]) * dx + (target[1] - busA[1]) * dy) / len2;
    t = Math.min(1, Math.max(0, t));
  }
  return { point: [busA[0] + dx * t, busA[1] + dy * t], t };
}

/** Top-N rutas sobre la recta del bus (como Titan: 400 muestras, ordenadas, separación mínima). */
export function calculateTopRoutes(busA, busB, target, topN = 3, P = TITAN_LIKE) {
  const cands = [];
  const SAMPLES = 400;
  for (let k = 0; k < SAMPLES; k++) {
    const t = k / (SAMPLES - 1);
    const J = add(busA, mul(sub(busB, busA), t));
    const r = simulateRoute(J, target, busA, P);
    if (r) cands.push({ ...r, t });
  }
  cands.sort((a, b) => a.totalTime - b.totalTime);
  const picked = [];
  for (const c of cands) {
    if (picked.every((p) => Math.abs(p.t - c.t) >= 0.03)) picked.push(c);
    if (picked.length === topN) break;
  }
  if (picked.length < topN) {
    for (const c of cands) {
      if (picked.length === topN) break;
      if (!picked.includes(c)) picked.push(c);
    }
  }
  return picked;
}

export const calculateDrop = (busA, busB, target, P) =>
  calculateTopRoutes(busA, busB, target, 1, P)[0] ?? null;

/** Distancia perpendicular del destino a la recta del bus (para aviso de alcance). */
export function perpendicularDistance(busA, busB, p) {
  const dx = busB[0] - busA[0];
  const dy = busB[1] - busA[1];
  const len = Math.hypot(dx, dy) || 1;
  return Math.abs(dy * p[0] - dx * p[1] + busB[0] * busA[1] - busB[1] * busA[0]) / len;
}

export const unitsToMeters = (u) => Math.round(u * 35);
export const fmtTime = (s) => `${s.toFixed(0)}s`;
