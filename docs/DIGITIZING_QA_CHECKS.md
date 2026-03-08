# DIGITIZING QA CHECKS (MVP)

Fecha: 2026-03-07
Objetivo: reglas minimas para calidad de geometria en digitalizacion manual.

## 1) Reglas topologicas iniciales

- [x] Geometria valida (sin self-intersection en poligonos).
- [ ] Sin geometria vacia o con menos vertices de los minimos.
- [ ] Segmentos minimos (evitar microsegmentos por error de click).
- [x] Lineas sin dangles en capas que requieren conectividad.
- [x] Poligonos sin overlaps segun capa objetivo.
- [x] Poligonos sin gaps mayores a umbral configurable.

## 2) Reglas de atributos

- [ ] Campos obligatorios completos.
- [ ] Tipos de dato correctos.
- [ ] Dominios/listas respetados.
- [ ] Unicidad en IDs clave (si aplica).

## 3) Flujo de validacion

1. Validacion en vivo durante dibujo.
2. Validacion al confirmar geometria.
3. Validacion pre-export de capa/proyecto.

## 4) Salida de QA

- Estado por feature: `ok | warning | error`.
- Mensaje accionable por error.
- Resumen por capa (conteo de errores y warnings).

## 5) TODO QA

- [x] Integrar chequeos basicos con Turf/JSTS.
- [x] Panel de errores de digitalizacion.
- [ ] Zoom a error desde tabla QA.
- [ ] Export de reporte QA (JSON/CSV).
