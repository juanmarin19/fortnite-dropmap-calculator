# Precisión del cálculo: dónde se pierde y cuánto

Todo lo de este documento está **medido**, no estimado, con el motor real
(`src/dropcalc.js`) y contra el mapa de fortnite.gg. Se reproduce con:

```bash
npm run precision        # equivale a: node tools/precision.mjs
```

El tool recorre siete preguntas. Resumen de conclusiones al final de cada una.

---

## 0. Constantes del modelo

| Concepto | Valor |
| --- | --- |
| Bus | 73,3 uTitan/s |
| Freefall (y caída tras corte) | 48 uTitan/s |
| Planeador | 34 uTitan/s |
| Reparto (drop largo) | 58 % / 28 % / 8 % / 6 % |
| Velocidad **efectiva** del aire | **42,105 uTitan/s** (media armónica del reparto) |
| 1 u de mapa (= 1 uTitan de fortnite.gg) | 97,69 uTitan = 10.160 uds de juego |
| Mundo | 256 u de mapa = 2.600.960 uds de juego |

La velocidad efectiva del aire sale de promediar el reparto:

```
vAire = 1 / (0,58/48 + 0,28/34 + 0,08/48 + 0,06/34) = 42,105 uTitan/s
```

---

## 1. El barrido de 400 candidatos no es el problema

Comparando el óptimo discreto (400 muestras, lo que hace Titan) contra el óptimo
continuo (refinado ternario), sobre 4.000 casos aleatorios:

| | pérdida de tiempo |
| --- | --- |
| mediana | 0,0000 s |
| p90 | 0,0004 s |
| p99 | 0,0036 s |
| máximo | 0,0876 s |

**Por qué:** la curva de tiempo total es casi plana alrededor del mínimo. Compiten
dos efectos que se cancelan — saltar más tarde suma tiempo de bus pero resta
tiempo de vuelo — así que el fondo del valle es muy ancho (ver §4).

**Conclusión:** subir el número de muestras o mostrar más decimales no aporta nada.
La geometría ya está resuelta.

---

## 2. El error que SÍ domina: dónde clicas el destino

El destino no lo calcula el programa: lo pones vos con un clic. Cada píxel mueve el
resultado así:

| zoom | 1 px equivale a | error en el tiempo |
| --- | --- | --- |
| 1,5 | 3.592 uds de juego | **0,820 s** |
| 2 | 2.540 uds de juego | **0,580 s** |
| 3 | 1.270 uds de juego | 0,290 s |
| 4 | 635 uds de juego | 0,145 s |
| 5 | 318 uds de juego | 0,073 s |
| 6 | 159 uds de juego | 0,036 s |
| 7 | 79 uds de juego | **0,018 s** |

**Conclusión:** un solo píxel de error a zoom 2 desvía el tiempo muchísimo más que
el barrido de 400 candidatos. Si buscás precisión, ampliá el mapa antes de clicar el
destino: de zoom 2 a zoom 7 el error baja de 0,58 s a 0,018 s (32 veces menos).

---

## 3. Punto más cercano al destino vs óptimo real

La v0.5 saltaba en el punto del bus **más cercano** al destino. Ése no es el punto
que minimiza `tiempoBus + tiempoAire`. Medido sobre 20.000 casos aleatorios:

| | coste en tiempo de llegada |
| --- | --- |
| mediana | **+7,31 s** |
| p90 | **+47,32 s** |
| máximo | **+94,79 s** |

Distancia entre el punto más cercano y el óptimo: mediana **12,40 u de mapa**,
p90 72,33 u (a zoom 2 eso son ~50 px y ~290 px de diferencia).

En el caso de referencia (destino y línea de bus del README):

| criterio | t | ángulo | llega a |
| --- | --- | --- | --- |
| más cercano (90°) | 0,4621 | 90,0° | 252,867 s |
| **óptimo (argmin)** | **0,1930** | **54,9°** | **225,754 s** |

**Conclusión:** el punto de máxima cercanía llega **+27,1 s más tarde** en este caso.
Saltar "cuando el bus está más cerca del destino" es intuitivo pero está mal: el bus
es más rápido que el aire, así que conviene saltar antes de que llegue al punto más
cercano.

---

## 4. La regla de los ~55° (por qué el más cercano salta tarde)

Sea `θ` el ángulo entre el rumbo del bus y la dirección salto→destino. Moverse un
trocito `ds` a lo largo del bus:

- suma `ds / vBus` de tiempo de bus;
- resta `cos(θ) · ds / vAire` de tiempo de vuelo.

El mínimo está donde se igualan:

```
cos(θ*) = vAire / vBus = 42,105 / 73,3 = 0,5744   ->   θ* = 54,94°
```

En el punto de máxima cercanía `θ = 90°` y `cos θ = 0`: la derivada vale `+1/7623`
(positiva), o sea que **seguir por el bus empeora** → el óptimo está siempre *antes*
del punto más cercano.

Comprobado contra el motor: sobre 8.156 casos con óptimo interior, el ángulo en el
óptimo es

```
mediana 54,94°   ·   p10 54,94°   ·   p90 54,94°
```

Prácticamente constante y exactamente el predicho por la teoría.

**Regla práctica:** saltá cuando el destino quede a ~55° del rumbo del bus. Un ángulo
cercano a 90° significa que estás saltando tarde.

---

## 5. La "ventana gratis"

¿Cuánto podés equivocarte el salto sin pagar tiempo? En el caso de referencia, la
ventana donde pierdes menos de 0,1 s:

```
t de 0,1739 a 0,2115  ->  6,33 u de mapa  ->  8,4 s de bus
```

El paso del barrido de 400 candidatos son 0,421 u = **0,561 s de bus**: **15 veces
más fino** que la ventana.

**Conclusión:** el resultado es robusto. Cualquier salto dentro de una ventana de
~8 s de bus llega igual de bien, así que no hace falta afinar el punto de salto.

---

## 6. Discontinuidad heredada en `i = 100`

El modelo tiene dos ramas según la distancia al destino (`i ≤ 100` → una sola caída
libre; si no → el reparto 58/28/8/6). Las dos ramas tienen pendientes distintas:

| | tiempo para `i = 100` |
| --- | --- |
| rama corta (`i/48`) | 2,0833 s |
| rama larga (`i · 0,023749`) | 2,3750 s |
| **escalón** | **0,2917 s** |

Verificado contra el motor: por debajo de `i = 100` da 2,0833 s y por encima 2,3750 s.
`i = 100` son 1,024 u de mapa ≈ 4 px a zoom 2.

**Conclusión:** es un fallo del modelo original (si una caída libre directa es posible,
debería ser más rápida que el mix, y la transición debería ser continua). En la
práctica sólo afecta a destinos a menos de ~1 u de mapa de la línea del bus, así que es
irrelevante para el uso normal. Se deja tal cual por fidelidad al modelo de Titan; se
puede empalmar si se quiere.

---

## 7. Las tres rutas alternativas

El filtro de separación mínima (0,03 en `t`) es arbitrario: mezcla posición con tiempo.
Medido sobre 4.000 casos:

| | valor |
| --- | --- |
| diferencia de tiempo ruta 0 vs ruta 2 | mediana 2,51 s · p90 17,86 s |
| las tres dentro de 1 s | **37,1 %** de los casos |
| distancia entre el salto de ruta 0 y el de ruta 2 | mediana 5,77 u de mapa |

En el caso de referencia las tres llegan casi juntas (225,754 / 225,997 / 226,016 s)
pero están a ~20 u de mapa de distancia entre sí.

**Conclusión:** la ruta 0 es la que importa. Las alternativas se separan por posición,
no por tiempo, así que a veces ofrecen tres saltos muy distintos que llegan a la vez.
Si se quiere que sean de verdad alternativas, hay que separarlas por **tiempo de
llegada** (p. ej. ≥ 2 s), no por `t`.

---

## 8. Qué NO se puede mejorar sin medir el juego

Los números de arriba son precisos **dado el modelo**. Pero el modelo es una
heurística 1-D horizontal: no hay altura, ni gravedad, ni terreno. El reparto fijo
58/28/8/6 y las constantes 48 / 34 / 73,3 no están verificadas contra el juego real
(¿a qué altura se despliega? ¿cuánto tarda de verdad el bus?). Ése es el error que
queda y **no se puede calibrar leyendo código**: hace falta medirlo en partida.

Si algún día se mide, las constantes están todas en un sitio:

```js
// src/dropcalc.js
export const TITAN_LIKE = { bus: 73.3, freefall: 48, glide: 34, scale: 104,
                            closeThreshold: 100, split: [0.58, 0.28, 0.08, 0.06] };
```

---

## Resumen ejecutivo

| Fuente de error | Magnitud | ¿Se puede reducir? |
| --- | --- | --- |
| Píxel del destino (zoom 2) | 0,58 s por píxel | **Sí**: ampliá a zoom 7 → 0,018 s |
| Criterio del salto (más cercano vs óptimo) | +7,3 s de mediana, +27,1 s en el caso de referencia | **Sí**: usar el argmin (`JUMP_MODE = 'optimal'`) |
| Barrido de 400 candidatos | 0,0000 s de mediana | No hace falta |
| Discontinuidad `i = 100` | 0,29 s, sólo a <1 u del bus | Sí (empalmar), pero casi nunca aplica |
| Reparto 58/28/8/6 y constantes de velocidad | desconocido | No sin medir en el juego |
