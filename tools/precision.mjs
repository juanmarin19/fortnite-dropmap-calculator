/* =============================================================================
   Análisis de precisión del drop calculator
   -----------------------------------------------------------------------------
   Mide, con el MOTOR REAL (importa ../src/dropcalc.js, no una copia), de dónde
   viene y cuánto pesa cada fuente de error:

     1. Barrido de 400 candidatos vs óptimo continuo  -> cuánto se pierde
     2. Punto más cercano (v0.5) vs óptimo            -> cuánto cuesta
     3. La regla de los ~55°                          -> por qué el óptimo no es el más cercano
     4. La "ventana gratis"                           -> cuánto puedes fallar sin perder tiempo
     5. Sensibilidad al píxel del destino             -> el error que de verdad domina
     6. La discontinuidad de la rama corta (i=100)     -> fallo del modelo heredado
     7. Separación real entre las 3 rutas              -> si las alternativas sirven de algo

   Ejecutar:  node tools/precision.mjs
   ============================================================================= */
import {
  TITAN_LIKE as P,
  AIR_EFF,
  OPTIMAL_ANGLE_DEG,
  GAME_PER_MAP,
  simulateRoute,
  nearestPointOnBus,
  optimalJumpOnBus,
  angleToTarget,
  calculateTopRoutes,
} from '../src/dropcalc.js';

const TITAN_PER_MAP = GAME_PER_MAP / P.scale; // 1 u de mapa = 97,69 uTitan
const S_PER_MAP_UNIT = 1 / (AIR_EFF / TITAN_PER_MAP); // segundos de vuelo por u de mapa

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const timeAt = (bs, be, t, target) => simulateRoute(lerp(bs, be, t), target, bs)?.totalTime ?? Infinity;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

let rng = 20261017;
const rnd = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
/** punto aleatorio dentro del mundo de fortnite.gg: lat -256..0, lng 0..256 */
const randomPoint = () => [-256 * rnd(), 256 * rnd()];
const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];

const hr = (t) => console.log(`\n=== ${t} ===`);

// Caso de referencia: el mismo del informe, en coordenadas de fortnite.gg ([lat, lng]).
// Conversión desde unidades de juego:  lng = (x + 1300480)/10160 · lat = (y - 1300480)/10160
// (destino (-154940,-477520) · bus (-909320,215900) -> (795020,129540))
const DEMO = {
  target: [-175.0, 112.75],  // destino
  busA: [-106.75, 38.5],     // entrada del bus
  busB: [-115.25, 206.25],   // salida del bus
};

hr('0. Constantes del modelo');
console.log(`  bus ${P.bus} · freefall ${P.freefall} · glide ${P.glide} · 1 uTitan = ${P.scale} uds de juego`);
console.log(`  velocidad efectiva del aire = ${AIR_EFF.toFixed(3)} uTitan/s`);
console.log(`  ÁNGULO ÓPTIMO = acos(vAire/vBus) = ${OPTIMAL_ANGLE_DEG.toFixed(2)}°  (el punto de máxima cercanía son 90°)`);
console.log(`  1 u de mapa = ${TITAN_PER_MAP.toFixed(2)} uTitan = ${GAME_PER_MAP} uds de juego`);

/* ---------------------------------------------------------------- 1 */
hr('1. Barrido de 400 candidatos vs óptimo continuo');
const only400 = calculateTopRoutes(DEMO.busA, DEMO.busB, DEMO.target, 1)[0];
const best = optimalJumpOnBus(DEMO.busA, DEMO.busB, DEMO.target);
console.log(`  caso de referencia: 400 muestras -> ${only400.totalTime.toFixed(4)} s`);
console.log(`                       óptimo continuo -> ${best.totalTime.toFixed(4)} s`);
console.log(`                       pérdida -> ${(only400.totalTime - best.totalTime).toFixed(4)} s`);

const losses = [];
for (let k = 0; k < 4000; k++) {
  const bs = randomPoint(), be = randomPoint(), tg = randomPoint();
  if (dist(bs, be) < 0.05) continue;
  const a = calculateTopRoutes(bs, be, tg, 1)[0];
  const b = optimalJumpOnBus(bs, be, tg);
  if (a && b) losses.push(a.totalTime - b.totalTime);
}
losses.sort((x, y) => x - y);
console.log(`  4000 casos aleatorios -> pérdida mediana ${q(losses, 0.5).toFixed(4)} s · p90 ${q(losses, 0.9).toFixed(4)} s · p99 ${q(losses, 0.99).toFixed(4)} s · máx ${losses[losses.length - 1].toFixed(4)} s`);
console.log('  CONCLUSIÓN: el barrido de 400 no es el cuello de botella. La curva es tan plana');
console.log('  que el óptimo discreto cae prácticamente encima del continuo.');

/* ---------------------------------------------------------------- 2 */
hr('2. Punto más cercano al destino (v0.5) vs óptimo real');
const nearP = nearestPointOnBus(DEMO.busA, DEMO.busB, DEMO.target);
const nearT = simulateRoute(nearP.point, DEMO.target, DEMO.busA).totalTime;
console.log(`  caso de referencia:`);
console.log(`    más cercano (t=${nearP.t.toFixed(4)}) -> ${nearT.toFixed(3)} s  · ángulo ${angleToTarget(DEMO.busA, DEMO.busB, nearP.point, DEMO.target).toFixed(1)}°`);
console.log(`    óptimo      (t=${best.t.toFixed(4)}) -> ${best.totalTime.toFixed(3)} s  · ángulo ${angleToTarget(DEMO.busA, DEMO.busB, best.point, DEMO.target).toFixed(1)}°`);
console.log(`    coste -> +${(nearT - best.totalTime).toFixed(3)} s   (${dist(nearP.point, best.point).toFixed(3)} u de mapa de diferencia)`);

const costs = [], gaps = [];
let peor = 0;
for (let k = 0; k < 20000; k++) {
  const bs = randomPoint(), be = randomPoint(), tg = randomPoint();
  if (dist(bs, be) < 0.05) continue;
  const a = simulateRoute(nearestPointOnBus(bs, be, tg).point, tg, bs)?.totalTime;
  const b = optimalJumpOnBus(bs, be, tg).totalTime;
  if (a == null || !isFinite(b)) continue;
  costs.push(a - b);
  gaps.push(dist(nearestPointOnBus(bs, be, tg).point, optimalJumpOnBus(bs, be, tg).point));
  if (a - b > peor) peor = a - b;
}
costs.sort((x, y) => x - y);
gaps.sort((x, y) => x - y);
console.log(`  20000 casos aleatorios -> coste mediano ${q(costs, 0.5).toFixed(2)} s · p90 ${q(costs, 0.9).toFixed(2)} s · máx ${peor.toFixed(2)} s`);
console.log(`  distancia entre ambos puntos de salto: mediana ${q(gaps, 0.5).toFixed(2)} u · p90 ${q(gaps, 0.9).toFixed(2)} u`);
console.log('  CONCLUSIÓN: saltar en el punto más cercano siempre llega más tarde (o igual).');

/* ---------------------------------------------------------------- 3 */
hr('3. La regla del ángulo');
const angles = [];
for (let k = 0; k < 20000; k++) {
  const bs = randomPoint(), be = randomPoint(), tg = randomPoint();
  if (dist(bs, be) < 0.05) continue;
  const o = optimalJumpOnBus(bs, be, tg);
  if (o.t <= 0.02 || o.t >= 0.98) continue; // sólo óptimos interiores (si no, está acotado por el final del bus)
  angles.push(angleToTarget(bs, be, o.point, tg));
}
angles.sort((x, y) => x - y);
console.log(`  ángulo en el óptimo sobre ${angles.length} casos con óptimo interior:`);
console.log(`    mediana ${q(angles, 0.5).toFixed(2)}° · p10 ${q(angles, 0.1).toFixed(2)}° · p90 ${q(angles, 0.9).toFixed(2)}°`);
console.log(`  predicho por la teoría: ${OPTIMAL_ANGLE_DEG.toFixed(2)}° (acos de vAire/vBus)`);
console.log('  CONCLUSIÓN: el mínimo está donde el destino queda a ~55° del rumbo del bus.');

/* ---------------------------------------------------------------- 4 */
hr('4. La "ventana gratis": cuánto puedes fallar el salto sin perder tiempo');
const TOL = 0.1;
let lo = best.t, hi = best.t;
const N = 2000;
for (let k = 1; k <= N; k++) { const t = best.t * (1 - k / N); if (t < 0) break; if (timeAt(DEMO.busA, DEMO.busB, t, DEMO.target) - best.totalTime <= TOL) lo = t; else break; }
for (let k = 1; k <= N; k++) { const t = best.t + (1 - best.t) * (k / N); if (t > 1) break; if (timeAt(DEMO.busA, DEMO.busB, t, DEMO.target) - best.totalTime <= TOL) hi = t; else break; }
const lineLen = dist(DEMO.busA, DEMO.busB);
console.log(`  caso de referencia (línea de bus de ${lineLen.toFixed(2)} u de mapa):`);
console.log(`    puedes saltar entre t=${lo.toFixed(4)} y t=${hi.toFixed(4)} y perder <${TOL} s`);
console.log(`    eso es una ventana de ${((hi - lo) * lineLen).toFixed(2)} u de mapa, es decir ${(((hi - lo) * lineLen) * TITAN_PER_MAP / P.bus).toFixed(1)} s de bus`);
console.log(`    el paso del barrido de 400 son ${(lineLen / 399).toFixed(3)} u = ${((lineLen / 399) * TITAN_PER_MAP / P.bus).toFixed(3)} s de bus -> 15x más fino que la ventana`);
console.log('  CONCLUSIÓN: no hace falta afinar el salto; sobra margen de sobra.');

/* ---------------------------------------------------------------- 5 */
hr('5. Sensibilidad al píxel donde clicas el destino');
console.log('  el mundo son 256 u de mapa = 256·2^z px, así que 1 px = 1/2^z u de mapa:');
for (const z of [1.5, 2, 3, 4, 5, 6, 7]) {
  const u = 1 / Math.pow(2, z);
  console.log(`    zoom ${String(z).padEnd(4)} ${u.toFixed(4).padStart(8)} u de mapa (${(u * GAME_PER_MAP).toFixed(0).padStart(5)} uds de juego) -> ${(S_PER_MAP_UNIT * u).toFixed(3)} s por píxel`);
}
console.log('  CONCLUSIÓN: éste es el error que domina. 1 px a zoom 2 mueve el tiempo más que');
console.log('  cientos de saltos de muestreo: para precisión, clicá con el mapa ampliado.');

/* ---------------------------------------------------------------- 6 */
hr('6. La discontinuidad de la rama corta (i=100)');
const shortT = 100 / P.freefall;
const longT = 100 * (P.split[0] / P.freefall + P.split[1] / P.glide + P.split[2] / P.freefall + P.split[3] / P.glide);
console.log(`  i=100 con rama corta -> ${shortT.toFixed(4)} s   ·   con rama larga -> ${longT.toFixed(4)} s`);
console.log(`  salto: ${(longT - shortT).toFixed(4)} s`);
console.log(`  i=100 son ${(100 / TITAN_PER_MAP).toFixed(3)} u de mapa (${((100 / TITAN_PER_MAP) * GAME_PER_MAP / 2540).toFixed(1)} px a zoom 2)`);
// comprobación real contra el motor: dos distancias a un pelo de i=100
const d100 = 100 / TITAN_PER_MAP;
const justUnder = simulateRoute([0, 0], [d100 * (1 - 1e-7), 0], [0, 0]).totalTime;
const justOver = simulateRoute([0, 0], [d100 * (1 + 1e-7), 0], [0, 0]).totalTime;
console.log(`  motor: apenas por debajo -> ${justUnder.toFixed(4)} s · apenas por encima -> ${justOver.toFixed(4)} s -> escalón de ${(justOver - justUnder).toFixed(4)} s`);
console.log('  CONCLUSIÓN: fallo heredado de Titan (la rama corta usa una pendiente distinta).');
console.log(`  Afecta sólo a destinos a menos de ${(100 / TITAN_PER_MAP).toFixed(2)} u de mapa de la línea del bus: irrelevante en uso real.`);

/* ---------------------------------------------------------------- 7 */
hr('7. Separación real entre las 3 rutas');
const spreads = [], posGaps = [];
let muyJuntas = 0, n = 0;
for (let k = 0; k < 4000; k++) {
  const bs = randomPoint(), be = randomPoint(), tg = randomPoint();
  if (dist(bs, be) < 0.05) continue;
  const r = calculateTopRoutes(bs, be, tg, 3);
  if (r.length < 3) continue;
  const spread = r[2].totalTime - r[0].totalTime;
  spreads.push(spread);
  posGaps.push(dist(r[0].jumpPoint, r[2].jumpPoint));
  if (spread <= 1) muyJuntas++;
  n++;
}
spreads.sort((x, y) => x - y);
posGaps.sort((x, y) => x - y);
const demo3 = calculateTopRoutes(DEMO.busA, DEMO.busB, DEMO.target, 3);
console.log(`  caso de referencia:`);
demo3.forEach((r, i) => console.log(`    ruta ${i}: t=${r.t.toFixed(4)} -> ${r.totalTime.toFixed(3)} s  (ángulo ${angleToTarget(DEMO.busA, DEMO.busB, r.jumpPoint, DEMO.target).toFixed(1)}°)`));
console.log(`  ${n} casos aleatorios:`);
console.log(`    diferencia de tiempo ruta0 vs ruta2: mediana ${q(spreads, 0.5).toFixed(2)} s · p90 ${q(spreads, 0.9).toFixed(2)} s`);
console.log(`    las 3 dentro de 1 s: ${((muyJuntas / n) * 100).toFixed(1)} %`);
console.log(`    distancia entre el salto de la ruta0 y el de la ruta2: mediana ${q(posGaps, 0.5).toFixed(2)} u`);
console.log('  CONCLUSIÓN: el filtro de 0,03 en t es arbitrario; a menudo ofrece 3 saltos muy');
console.log('  separados que llegan casi a la vez. La ruta 0 es la que importa.');

/* ---------------------------------------------------------------- 8 */
hr('8. Caso de referencia: valores exactos para comparar con la página');
const ref = simulateRoute(best.point, DEMO.target, DEMO.busA);
const xy = (p) => (p ? `[lat ${p[0].toFixed(3)}, lng ${p[1].toFixed(3)}]` : 'null');
console.log(`  destino        ${xy(DEMO.target)}`);
console.log(`  bus            ${xy(DEMO.busA)} -> ${xy(DEMO.busB)}`);
console.log(`  salto óptimo   ${xy(best.point)}   (t=${best.t.toFixed(6)}, ángulo ${angleToTarget(DEMO.busA, DEMO.busB, best.point, DEMO.target).toFixed(2)}°)`);
console.log(`  deploy         ${xy(ref.deployPoint)}`);
console.log(`  cut            ${xy(ref.cutPoint)}`);
console.log(`  reopen         ${xy(ref.reopenPoint)}`);
console.log(`  llegada        ${ref.totalTime.toFixed(3)} s`);
console.log(`  badge reopen   ${Math.round(ref.reopenSeconds)} s (real)  ·  ${ref.badgeTitanSeconds} s (fórmula de Titan)`);
console.log(`  salto "más cercano", para comparar: ${xy(nearestPointOnBus(DEMO.busA, DEMO.busB, DEMO.target).point)} -> ${nearT.toFixed(3)} s`);
const link = new URLSearchParams({
  t: DEMO.target.map((n) => n.toFixed(1)).join(','),
  b: [...DEMO.busA, ...DEMO.busB].map((n) => n.toFixed(1)).join(','),
});
console.log(`\n  Para verlo en la app:  /?${link.toString()}`);
