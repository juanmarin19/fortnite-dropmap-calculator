# Fortnite Dropmap Calculator — Open Source

Calculadora de drops estilo **titandropm.com/map/dropcalc** pero 100% open-source, sin login de Discord ni paywall.

- Mapa con los **tiles de fortnite.gg**: `https://fortnite.gg/maps/{version}/{z}/{x}/{y}.webp`
  - Versión actual detectada: `42.30` (`window.Data.map`, `season: 42`)
  - CRS `L.CRS.Simple`, bounds `[[-256,0],[0,256]]`, centro `[-128,128]` — idéntico a `fortnite.gg/js/map.js`
- Algoritmo propio en `src/dropcalc.js`: salto del bus **en el punto más cercano al destino** (proyección perpendicular sobre el segmento entrada→salida), despliegue y corte del planeador con el reparto 58/28/8/6.

## Uso
```bash
npm install
npm run dev
```
1. Clic en el mapa: destino (pin rojo).
2. Dos clics: entrada y salida del bus (círculos cyan/azul, **arrastrables**).
3. Te marca 🔵 salto, 🪂 despliegue, ✂️ corte, badge **Re-Open** + rutas alternativas (amarilla/gris).
4. Clics posteriores se ignoran (como en Titan); usá **Clear Bus** para re-marcar el bus o **Clear All** para empezar de cero.

## Física (reparto de segmentos estilo Titan)
Ver `src/dropcalc.js` (`TITAN_LIKE`). Los tiempos por segmento y el badge siguen la física de Titan; el punto de salto es el más cercano al destino (decisión de diseño para competitivo, v0.5):

| Concepto | Valor |
|---|---|
| Bus | 73.3 studs/s |
| Freefall (y caída tras corte) | 48 studs/s |
| Planeador | 34 studs/s |
| 1 stud | 104 uds de mapa (grilla 256u = 2600960 uds = 25009 studs) |
| Caída directa | ≤ 100 studs |
| Reparto (drop largo) | 58% freefall / 28% glide / 8% cut-fall / 6% glide final |
| Badge Re-Open | `round(t_bus + t_freefall + t_glide1)` |

### Nota (v0.5)
El minimizador de `tiempoBus + tiempoAire` de Titan (400 candidatos, top-3) marcaba el salto demasiado tarde para competitivo, así que se reemplazó por el punto más cercano al destino. Los segmentos (58/28/8/6, caída directa ≤100, badge) no cambiaron.

## Tiles y legalidad
- Los tiles se cargan por hotlink a `fortnite.gg` (© Epic / fortnite.gg). No los redistribuimos.
- Para self-host: usa [fnmap (MIT)](https://github.com/crypoxyz/fnmap) que descarga `maps/{patch}/{z}/{x}/{y}` y ponelos en `public/tiles`, luego cambia `setTiles()` a `/tiles/{z}/{x}/{y}.webp`.
- Cambia la versión en `src/main.js` cuando Fortnite actualice (inspecciona `window.Data.map` en fortnite.gg).

## Licencia
MIT — ver `LICENSE`.
