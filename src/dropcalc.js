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

// Velocidad efectiva del aire (media armónica ponderada del reparto) = 42,11 uTitan/s.
export const AIR_EFF = 1 / (
  TITAN_LIKE.split[0] / TITAN_LIKE.freefall +
  TITAN_LIKE.split[1] / TITAN_LIKE.glide +
  TITAN_LIKE.split[2] / TITAN_LIKE.freefall +
  TITAN_LIKE.split[3] / TITAN_LIKE.glide
);

/* Regla del salto óptimo: el mínimo de tiempoBus + tiempoAire está donde el destino queda a
 * acos(vAire / vBus) ≈ 54,9° del rumbo del bus, NO en el punto de máxima cercanía (90°).
 * Como el bus (73,3) es más rápido que el aire (42,11), el punto de más cercanía siempre
 * salta tarde y cuesta tiempo. Medido en tools/precision.mjs. */
export const OPTIMAL_ANGLE_DEG = (Math.acos(AIR_EFF / TITAN_LIKE.bus) * 180) / Math.PI;

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
  // tiempos por fase, para poder exponer el instante real de reapertura
  let tF = 0;
  let tG1 = 0;
  let tC = 0;

  if (dTitan <= P.closeThreshold) {
    const t = dTitan / P.freefall;
    total += t;
    tF = t;
    segments.push({ type: 'freefall', from: jump, to: landing, time: t });
  } else {
    const [f, g1, c, g2] = P.split.map((s) => s * dTitan);
    tF = f / P.freefall;
    total += tF;
    deploy = advance(jump, dir, f);
    segments.push({ type: 'freefall', from: jump, to: deploy, time: tF });

    tG1 = g1 / P.glide;
    total += tG1;
    cut = advance(deploy, dir, g1);
    segments.push({ type: 'glide', from: deploy, to: cut, time: tG1 });

    tC = c / P.freefall;
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
    // Instante real en que se llega a reopenPoint (fin de la caída tras el corte).
    reopenSeconds: reopen ? tBus + tF + tG1 + tC : null,
    // Fórmula del rótulo de Titan: tBus + tFreefall + tGlide1. Apunta al instante del CORTE
    // (cuando empieza la caída), no al de la reapertura, que es donde Titan dibuja el marcador.
    // Se queda corta exactamente en tC, la duración de la caída del corte: 12,81 s en el caso
    // de referencia (rótulo 199 s para un punto que se alcanza a los 212,19 s).
    // Se expone para poder comparar, pero la UI usa reopenSeconds (ver main.js, BADGE_MODE).
    badgeTitanSeconds: reopen ? Math.round(tBus + tF + tG1) : null,
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

/** Ángulo (grados) entre el rumbo del bus y la dirección salto->destino.
 *  El mínimo de tiempo está cerca de OPTIMAL_ANGLE_DEG (≈54,9°); el punto de máxima
 *  cercanía son 90°. Sirve para diagnosticar por qué un salto no es el óptimo. */
export function angleToTarget(busA, busB, jump, target) {
  const h = norm(sub(busB, busA));
  const d = norm(sub(target, jump));
  const c = Math.max(-1, Math.min(1, h[0] * d[0] + h[1] * d[1]));
  return (Math.acos(c) * 180) / Math.PI;
}

/** Punto del bus que MINIMIZA tiempoBus + tiempoAire (el criterio de Titan), resuelto con
 *  precisión sub-unidad: barrido de 400 muestras + refinado ternario continuo en el bracket.
 *  El barrido solo ya da el óptimo con error ~0 (la curva es muy plana), pero el refinado
 *  deja el punto exacto (ver tools/precision.mjs). */
export function optimalJumpOnBus(busA, busB, target, P = TITAN_LIKE) {
  const at = (t) => add(busA, mul(sub(busB, busA), t));
  const time = (t) => simulateRoute(at(t), target, busA, P)?.totalTime ?? Infinity;
  const S = 400;
  let bt = 0;
  let best = Infinity;
  for (let k = 0; k < S; k++) {
    const t = k / (S - 1);
    const v = time(t);
    if (v < best) { best = v; bt = t; }
  }
  let lo = Math.max(0, bt - 1 / (S - 1));
  let hi = Math.min(1, bt + 1 / (S - 1));
  for (let k = 0; k < 120; k++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (time(m1) <= time(m2)) hi = m2; else lo = m1;
  }
  const t = (lo + hi) / 2;
  return { point: at(t), t, totalTime: time(t) };
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
