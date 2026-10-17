# Fortnite Dropmap Calculator — Open Source

Calculadora de drops estilo **titandropm.com/map/dropcalc** pero 100% open-source, sin login de Discord ni paywall.

- Mapa con los **tiles de fortnite.gg**: `https://fortnite.gg/maps/{version}/{z}/{x}/{y}.webp`

  - Versión actual detectada: `42.30` (`window.Data.map`, `season: 42`)
  - CRS `L.CRS.Simple`, bounds `[[-256,0],[0,256]]`, centro `[-128,128]` — idéntico a `fortnite.gg/js/map.js`
  - La pirámide va de **z=3 a z=8** (`minNativeZoom: 3`, `maxNativeZoom: 8`)
- Algoritmo propio en `src/dropcalc.js`: salto del bus en el punto que **minimiza `tiempoBus + tiempoAire`**, despliegue y corte del planeador con el reparto 58/28/8/6.

## Uso

```
npm install
npm run dev
```

1. Clic en el mapa: destino (pin rojo).
2. Dos clics: entrada y salida del bus (círculos cyan/azul, **arrastrables**).
3. Te marca 🔵 salto, 🪂 despliegue, ✂️ corte, badge **Re-Open** + rutas alternativas (amarilla/gris).
4. Clics posteriores se ignoran (como en Titan); usá **Clear Bus** para re-marcar el bus o **Clear All** para empezar de cero.

## Física (reparto de segmentos estilo Titan)

Ver `src/dropcalc.js` (`TITAN_LIKE`).

| Concepto | Valor |
| --- | --- |
| Bus | 73\.3 studs/s |
| Freefall (y caída tras corte) | 48 studs/s |
| Planeador | 34 studs/s |
| 1 stud | 104 uds de mapa (grilla 256u = 2600960 uds = 25009 studs) |
| Caída directa | ≤ 100 studs |
| Reparto (drop largo) | 58% freefall / 28% glide / 8% cut-fall / 6% glide final |
| Velocidad efectiva del aire | 42\.105 studs/s |
| **Ángulo óptimo del salto** | **≈ 54,9°** respecto al rumbo del bus |
| Badge Re-Open | instante real de reapertura (`tBus + tFreefall + tGlide1 + tCutFall`) |

## Criterios ajustables

Arriba de `src/main.js`:

```js
const JUMP_MODE = 'optimal';  // 'optimal' | 'nearest'
const BADGE_MODE = 'reopen';  // 'reopen'  | 'titan'
```

### Punto de salto: `optimal` vs `nearest`

- **`optimal`** (por defecto): el punto del bus que minimiza `tiempoBus + tiempoAire`, o sea el que **hace llegar antes**. Barrido de 400 candidatos + refinado ternario continuo, así que queda exacto al sub-unidad.
- **`nearest`**: el punto del bus más cercano al destino (lo que hacía la v0.5). Es cómodo de dibujar y suena intuitivo, pero **no** es el óptimo: medido, cuesta **+7,3 s de mediana** y hasta **+94,8 s** de tiempo de llegada.

El motivo es geométrico: el mínimo está donde el destino queda a `acos(vAire/vBus) ≈ 54,9°` del rumbo del bus, no a 90° como en el punto de máxima cercanía. Como el bus (73,3) es más rápido que el aire (42,1), saltar en el punto más cercano siempre es saltar tarde.

### Badge Re-Open

- **`reopen`** (por defecto): el instante real en que se llega al punto de reapertura, o sea el que coincide con el marcador que se dibuja.
- **`titan`**: `round(t_bus + t_freefall + t_glide1)`, la fórmula original. Apunta al instante del **corte**, no al de la reapertura (que es donde se dibuja el marcador), así que se queda corta exactamente en `tCutFall`: **12,8 s** en el caso de referencia — dice 199 s para un punto que se alcanza a los 212,2 s. Se conserva por fidelidad.

## Precisión

Análisis **medido** y completo en **[docs/PRECISION.md](docs/PRECISION.md)**. Se reproduce con:

```
npm run precision
```

Titulares:

| Fuente de error | Magnitud | ¿Reducible? |
| --- | --- | --- |
| Píxel del destino (zoom 2) | 0,58 s por píxel | **Sí**: ampliando a zoom 7 baja a 0,018 s |
| Criterio del salto (`nearest` vs `optimal`) | +7,3 s de mediana | **Sí**: `JUMP_MODE = 'optimal'` |
| Barrido de 400 candidatos | 0,0000 s de mediana | No hace falta |
| Discontinuidad `i = 100` | 0,29 s, sólo a <1 u del bus | Sí, pero casi nunca aplica |
| Constantes de velocidad y reparto | desconocido | No sin medir en el juego |

## Estructura

```
src/dropcalc.js      motor: física, punto de salto, rutas
src/main.js          UI + mapa Leaflet
src/style.css        estilos
index.html           shell
tools/precision.mjs  análisis de precisión  (npm run precision)
docs/PRECISION.md    resultados de ese análisis
```

## Tiles y legalidad

- Los tiles se cargan por hotlink a `fortnite.gg` (© Epic / fortnite.gg). No los redistribuimos.
- Para self-host: usa [fnmap (MIT)](https://github.com/crypoxyz/fnmap) que descarga `maps/{patch}/{z}/{x}/{y}` y ponelos en `public/tiles`, luego cambia `setTiles()` a `/tiles/{z}/{x}/{y}.webp`.
- Cambia la versión en `src/main.js` cuando Fortnite actualice (inspecciona `window.Data.map` en fortnite.gg).

## Licencia

MIT — ver `LICENSE`.
