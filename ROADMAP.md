# HTMLGIS Roadmap (Objetivo: PWA GIS cercana a QGIS)

Fecha de corte: 2026-03-07  
Benchmark tecnico usado: `JETL_Studio-main`

## 0) Estado Operativo (vivo)
Ultima actualizacion: 2026-03-08

Checklist por bloques:
- [x] F0.1 - `manifest.json` + `sw.js` + icono PWA base.
- [x] F0.2 - Persistencia proyecto (`localStorage` + importar/exportar `.htmlgis.json`).
- [x] F0.3 - Migracion de handlers inline a delegacion (`data-action`) en HTML.
- [x] F0.4 - Extraccion inicial de runtime a `js/app.js` y `js/core/*`.
- [x] F1.1 - Branding top bar (`desarrollado por Javier L.`).
- [x] F1.2 - Modulos `project`, `layers`, `table`, `map`, `tools`, `gis`, `editing` conectados.
- [x] F1.3 - Undo/Redo basico de acciones de capa/edicion.
- [x] F1.4 - Tabla v2 (ordenacion por columna + filtros avanzados).
- [x] F1.5 - Gestor de capas v2 (grupos/reorder/bloqueo).
- [ ] F1.6 - CRS/reproyeccion MVP (metadata CRS por capa + reproyeccion a EPSG:4326 + visualizacion OTF). `en curso`
- [x] D1.1 - Panel de digitalizacion (snapping/tolerancia/modo trazo + metricas en vivo basicas).
- [x] D1.2 - Plantillas de captura por capa (required/default/domain) + formulario al crear feature.
- [x] D1.3 - QA topologico de captura (autointerseccion, overlap/gaps, dangles).
- [x] D1.4 - Herramientas CAD-like basicas (ortogonal, paralelo, prolongar, trim/extend). `MVP completado`
- [x] D1.5 - Trazabilidad de edicion (log por feature + undo/redo fino por vertice). `MVP completado`
- [x] D1.6 - QoL de seleccion manual (seleccion por area, tolerancia + previsualizacion hover, atajos de teclado configurables MVP).
- [x] F2.1 - Geoprocesos MVP nuevos: `clip` + `spatial join` + `nearest neighbor` (modal configurable, CRS consistente, modos `first/count/sum/all` + filtro `solo coincidencias`).
- [x] F2.2 - Geoproceso `simplify` configurable (tolerancia + high quality) integrado en modal GIS.
- [x] F2.3 - Geoproceso `repair geometry` MVP (metodos `buffer(0)` y `cleanCoords`) integrado en modal GIS.

## 0.1) Evolucion Smoke (vivo)
Objetivo: evitar perdida de contexto entre iteraciones largas.

Estado actual:
- `HTMLGISSmoke.runBasic()` implementado (baseline inicial).
- `HTMLGISSmoke.runExtended()` implementado (UI digitalizacion/captura + checks estructurales).
- `HTMLGISSmoke.runGate(mode)` implementado (`basic|stable|extended`).
- Validacion actual de trabajo: `node --check` sobre `js/app.js` y modulos nuevos.

Propuesta de hitos smoke:
- H1: `HTMLGISSmoke.runBasic()` creado y operativo.
- H2: `HTMLGISSmoke.runExtended()` creado; siguiente paso: ampliar cobertura a I/O/geoprocesos/seleccion.
- H3: `HTMLGISSmoke.runGate('stable')` creado; siguiente paso: usarlo como criterio de merge/release.

## 0.2) TODO Bloque Activo (vivo)
Bloque actual: `D1.7 - QoL de digitalizacion (enfoque QGIS)`

- [x] Seleccion por area integrada como herramienta explicita (mobile-friendly, sin conflicto con paneo normal).
- [x] Tolerancia de seleccion configurable (px) con click tolerante sobre capa activa.
- [x] Previsualizacion hover de entidad candidata a seleccion/borrado.
- [x] Configuracion basica de atajos persistente (`Seleccionar`, `Limpiar`, `Cut`, `Area`, `Borrar`).
- [x] Personalizacion de atajos con UI dedicada + validacion de conflictos (MVP).
- [x] Seleccion por poligono/lazo (ademas de rectangulo).
- [ ] Perfiles de atajos y soporte de combinaciones (`Shift+S`, `Ctrl+Alt+...`).
- [ ] Seleccion por tolerancia topologica (vertice/segmento mas cercano) para escenarios CAD complejos.

Bloque anterior: `F1.6 - CRS/reproyeccion MVP`

- [x] Selector guiado de CRS por capa (EPSG:4326/3857/25830/23030).
- [x] Normalizacion de CRS en runtime y serializacion.
- [x] Reproyeccion on-the-fly para visualizacion en mapa (render en EPSG:4326 sin mutar fuente).
- [x] Bloqueo de edicion/digitalizacion para capas no EPSG:4326 (evitar inconsistencias CRS fuente/mapa).
- [x] Reproyeccion explicita de capa a EPSG:4326 con trazabilidad de cambios.
- [x] Base de reproyeccion inversa en edicion (`pm:create`, `pm:edit`, `move/rotate`) para futura activacion multi-CRS.
- [x] Toggle de edicion multi-CRS experimental (UI + persistencia de proyecto).
- [ ] Reproyeccion inversa en operaciones de edicion avanzada (cuando se habilite edicion multi-CRS). `parcial: capas derivadas conservan CRS, operaciones binarias bloquean CRS mixto y flujo pm:cut integrado`
- [x] Soporte CRS configurable por proyecto (selector + persistencia + default en capa vacia).
- [x] Smoke funcional de flujo CRS (cambio CRS -> bloqueo edicion -> reproyeccion -> edicion habilitada).
- [x] Smoke funcional de corte (`pm:cut`) con verificacion de undo/redo por reemplazo de feature.
- [x] Endurecimiento de permisos de edicion en acciones avanzadas (`merge` y borrado de seleccion respetan bloqueo/CRS editable).
- [x] Endurecimiento de permisos en edicion de atributos (`alta campo`, `calculadora`, `metricas`) respetando bloqueo/CRS editable.
- [x] Smoke funcional de permisos de edicion (`locked -> no edit/no alta de campo`).
- [x] Smoke funcional de permisos por CRS (`multi-CRS OFF + capa no 4326 -> bloqueado`, `multi-CRS ON -> habilitado`, con verificacion de operacion real en campos y borrado).
- [x] Smoke funcional UI para geoprocesos nuevos (`clip`/`spatial join` modal + controles).
- [x] Smoke funcional de ejecucion para `clip`/`spatial join` sin side-effects (preview engine).

## 1) Diagnostico resumido

### HTMLGIS hoy
- Monolito en un solo archivo: `index.html` (~832 lineas).
- Stack principal: Leaflet + Geoman + Turf + shpjs + omnivore + osmtogeojson (CDN).
- Funcionalidades ya operativas:
  - Carga de `zip/shp`, `geojson/json`, `kml`, `gpx`.
  - Consulta OSM (building/highway).
  - Edicion basica de geometrias (crear, mover, rotar, seleccionar, limpiar seleccion).
  - Geoprocesos: buffer, dissolve, intersect, difference, hull, centroid, center of mass, kmeans, voronoi, tin.
  - Tabla de atributos editable y calculos simples.
- Deuda tecnica principal:
  - Sin arquitectura modular (todo en `index.html`).
  - Sin `manifest.json` ni `sw.js` (no PWA real/offline).
  - Sin persistencia de proyecto/versionado/undo-redo.
  - UI con `onclick` inline y acoplamiento alto.
  - Sin worker pool (riesgo de bloqueos con datasets grandes).
  - Sin suite de pruebas/gate de release.
  - Formula con `new Function(...)` (riesgo de seguridad/estabilidad).

### JETL_Studio (referencia de madurez)
- Arquitectura modular (`js/engine`, `processNode`, `visualization`, `schemaUI`, `history`, `workerPool`, `smoke`, etc.).
- 67 transformadores/nodos por dominios (readers/geometry/spatial/attributes/raster/writers/utils).
- PWA completa (`manifest.json` + `sw.js` + cache de assets).
- Persistencia robusta (`SafeStorage`, proyectos `.jetl`, plantillas, parametros globales).
- Worker pool + cancelacion + fallback local.
- QA operativa: `JETLSmoke.runStable/runExtended/runGate`, checklist de release y matriz de compatibilidad.

## 2) Brecha a cerrar (HTMLGIS -> nivel JETL + enfoque QGIS)

1. Plataforma: arquitectura, estado, persistencia, PWA, seguridad.
2. Motor GIS: toolbox mas amplio, CRS/reproyeccion robusta, edicion/topologia avanzada.
3. Rendimiento: workers, indices espaciales, virtualizacion de tabla/capas grandes.
4. Producto: QA automatizada, release discipline, compatibilidad navegadores.
5. Escalabilidad funcional: sistema de herramientas extensible (tipo plugin/transformer).

## 2.1) Eje Estrategico: Digitalizacion + Procesos
Direccion de producto recomendada:
- JETL_Studio cubre muy bien flujos ETL/procesos.
- HTMLGIS debe diferenciarse como entorno de captura/edicion vectorial de produccion.
- Posicion objetivo: `Digitalizar -> Validar -> Procesar -> Exportar`.

Potencial actual (base ya existente):
- Muy buen punto de partida en Leaflet-Geoman para dibujo/edicion.
- Seleccion, move/rotate y tabla editable ya funcionales.
- Persistencia de proyecto y PWA base listas para trabajo de campo/offline.

Brecha critica para digitalizacion profesional:
- Falta experiencia de captura guiada (plantillas y formularios por capa).
- Falta QA topologico en tiempo real (antes de guardar).
- Falta toolkit CAD-like para acelerar digitalizacion manual.
- Falta historial de edicion granular (no solo estado general).
- Falta trazabilidad/auditoria de cambios por feature.

Conclusion de potencial:
- Potencial alto para digitalizacion de produccion si se prioriza `captura guiada + QA topologico + CAD-like` sobre nuevas funciones de visualizacion.
- Ventaja competitiva prevista frente a JETL_Studio: ciclo completo en una sola app `capturar/editar + validar + procesar`.

## 3) Roadmap propuesto por fases

## Fase 0 - Fundacion tecnica (2-3 semanas)
Objetivo: dejar de ser monolito fragil.

Entregables:
- Separar `index.html` en modulos:
  - `js/app.js`, `js/state.js`, `js/map.js`, `js/layers.js`, `js/table.js`, `js/tools/*.js`, `js/io/*.js`.
- Crear `manifest.json` y `sw.js` base (offline shell).
- Migrar handlers inline a delegacion por `data-ui-action`.
- Versionar dependencias (eliminar `@latest` en CDN critica).
- Introducir `SafeStorage` + modelo de proyecto `*.htmlgis.json`.

Criterios de cierre:
- La app arranca offline con cache warm.
- Cargar/guardar proyecto con capas + estilo + vista mapa.
- 0 handlers `onclick` inline nuevos.

## Fase 1 - Nucleo QGIS (4-6 semanas)
Objetivo: operaciones de trabajo diario equivalentes a desktop basico.

Entregables:
- Branding/identidad UI del producto (firma visible en top bar).
- Digitalizacion v1:
  - panel de captura (snapping, tolerancias, modos),
  - formularios de atributos por tipo de capa,
  - validaciones basicas antes de confirmar geometria.
- Gestor de capas avanzado:
  - grupos, reorder drag-drop, bloqueo de edicion, control escala min/max.
- CRS/reproyeccion:
  - soporte EPSG configurable (proj4), reproyeccion por capa y on-the-fly.
- Tabla de atributos v2:
  - ordenar, filtrar por campo, seleccion multiple persistente, export seleccion.
- Simbologia v2:
  - categorica, cuantiles, reglas simples, estilos guardables.
- Historial de cambios (undo/redo) para acciones de capa y edicion.

Criterios de cierre:
- Flujo diario completo sin perder estado en recarga.
- Undo/redo operativo en operaciones clave.

## Fase 2 - Caja de herramientas GIS (6-8 semanas)
Objetivo: acercar funcionalidad de procesamiento a QGIS.

Entregables:
- Toolbox modular (geometria, spatial, atributos, utilidades).
- Digitalizacion v2:
  - QA topologico asistido (errores y sugerencias),
  - herramientas CAD-like base (ortogonal/paralelo/trim/extend),
  - integracion directa de checks de calidad en el flujo de geoprocesos.
- Dialogos guiados por schema (campos input/output dinamicos).
- Operaciones prioritarias faltantes:
  - clip, spatial join, nearest neighbor, simplify topologico, repair geometry,
  - line merge, polygon<->line, vertex/triangulate,
  - join de atributos robusto, stats por grupo, tester por reglas.
- Manejo de errores por feature (`output_ok` / `output_error`) en herramientas criticas.

Criterios de cierre:
- 25-35 herramientas estables en toolbox modular.
- Errores de features no rompen corrida completa.

## Fase 3 - Performance y ejecucion robusta (4-6 semanas)
Objetivo: que escale en navegador real con datos grandes.

Entregables:
- `workerPool` (2-4 workers) + cancelacion efectiva + retry controlado.
- Migrar operaciones pesadas a workers con fallback local.
- Indice espacial (rbush o similar) para joins/intersects.
- Tabla virtualizada y render incremental para datasets grandes.
- Barra de progreso + telemetria por tarea.

Criterios de cierre:
- UI responsive durante geoprocesos pesados.
- Cancelar y relanzar sin reiniciar app.

## Fase 4 - QA y release discipline (2-3 semanas)
Objetivo: pasar de "funciona en local" a producto mantenible.

Entregables:
- Runner smoke interno estilo:
  - `HTMLGISSmoke.runBasic()`
  - `HTMLGISSmoke.runExtended()`
  - `HTMLGISSmoke.runGate(mode)`
- `TESTING.md`, `RELEASE_CHECKLIST.md`, `COMPATIBILITY_MATRIX.md`.
- Pruebas de regresion para: I/O, tabla, toolbox core, undo/redo, workers, PWA.
- Pruebas de regresion para digitalizacion:
  - captura multipaso, snapping, validacion topologica, edicion de vertices, guardado de sesion.

Criterios de cierre:
- Gate estable en verde antes de cada release.
- Checklist de release completo por iteracion.

## Fase 5 - Capacidades avanzadas (6-10 semanas)
Objetivo: diferenciarse y acercarse a experiencia QGIS profesional.

Entregables:
- Modo "Model Builder" opcional (inspirado en JETL/FME) para encadenar procesos.
- Plantillas de flujo/proyectos y parametros globales `${param}`.
- Run report exportable (`json/csv`) por corrida.
- Paquetes comunitarios/plugin API para extender herramientas.
- Raster roadmap inicial:
  - GeoTIFF reader estable, sample multibanda, zonal stats.

Criterios de cierre:
- Usuario puede automatizar pipelines reproducibles.
- Arquitectura admite extensiones sin tocar core.

## 4) Orden recomendado de implementacion (alto impacto)

1. Modularizacion + persistencia + PWA minima (Fase 0).
2. Undo/redo + tabla v2 + gestor de capas (Fase 1).
3. Worker pool + cancelacion (Fase 3, adelantar parte critica).
4. Toolbox modular y schema-driven UI (Fase 2).
5. Smoke/gate/checklist (Fase 4).
6. Model Builder + plugins + raster (Fase 5).

## 5) Backlog inmediato (primeras 2 semanas)

1. Crear estructura de carpetas `js/core`, `js/modules`, `js/io`, `js/tools`, `docs`.
2. Extraer estado global (`layers`, `activeId`, `modes`) a `js/state.js`.
3. Extraer mapa/base layers/edit hooks a `js/map.js`.
4. Implementar `SafeStorage` + guardar/abrir proyecto.
5. Introducir `manifest.json` + `sw.js` con cache de app shell.
6. Reemplazar `onclick` por delegacion con `data-ui-action`.
7. Sustituir formula `new Function` por evaluador seguro con allowlist.
8. Definir contrato de herramienta (`run(input, params) -> output`).
9. Escribir `HTMLGISSmoke.runBasic()` con 5-8 checks esenciales.
10. Crear `docs/RELEASE_CHECKLIST.md` base.
11. Definir `docs/DIGITIZING_SPEC.md` con flujos de captura (punto/linea/poligono) y criterios QA.
12. Crear `docs/DIGITIZING_QA_CHECKS.md` con reglas topologicas MVP.

## 6) KPI de avance sugeridos

- % codigo fuera de `index.html` (objetivo Fase 0: >70%).
- Tiempo maximo de bloqueo UI en proceso pesado (objetivo: <200 ms perceptibles).
- Cobertura smoke estable (objetivo: 0 fallos en `runGate('stable')`).
- Numero de herramientas modulares productivas (objetivo Fase 2: >=25).
- Reproducibilidad de proyecto (abrir/correr/exportar con mismo resultado).

## 7) Riesgos y mitigaciones

- Riesgo: intentar "todo QGIS" demasiado pronto.
  - Mitigacion: priorizar arquitectura + rendimiento + QA antes de ampliar toolbox.
- Riesgo: deuda por CDN no versionadas.
  - Mitigacion: fijar versiones y migrar vendor critico local progresivamente.
- Riesgo: regresiones frecuentes por refactor grande.
  - Mitigacion: smoke incremental desde semana 1 y gate obligatorio.

---

Este roadmap toma lo mejor de `JETL_Studio` (robustez de producto y operacion) y lo orienta a tu objetivo final: una webapp GIS tipo QGIS, no solo un demo de geoprocesos.


