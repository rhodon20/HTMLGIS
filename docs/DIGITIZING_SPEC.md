# DIGITIZING SPEC (MVP)

Fecha: 2026-03-07
Objetivo: definir captura manual vectorial de produccion en HTMLGIS.

## 1) Flujos de captura

1. Punto:
- Seleccionar capa objetivo.
- Click en mapa.
- Mostrar formulario de atributos obligatorio.
- Validar campos antes de guardar.

2. Linea:
- Activar modo linea.
- Captura con snapping configurable.
- Mostrar distancia parcial/total en vivo.
- Confirmar geometria + formulario.

3. Poligono:
- Activar modo poligono.
- Soporte agujeros (inner rings).
- Mostrar area/perimetro en vivo.
- Ejecutar validacion topologica previa a guardar.

## 2) Requisitos UX clave

- Panel de digitalizacion persistente.
- Estado visible de modo activo (punto/linea/poligono/edicion).
- Atajos basicos de teclado (Esc cancelar, Enter confirmar).
- Indicadores de snap y tolerancia activos.
- Toggle CAD ortogonal para captura asistida.
- Toggle CAD paralelo para lineas asistidas.
- Acciones CAD trim/extend sobre lineas seleccionadas (metros).
- Panel QA con historial por feature (ok/warning/error).
- Panel de historial de edicion (create/update/delete).
- Undo/Redo de operaciones de edicion (MVP).
- Undo/Redo fino por vertice (drag/add/remove) con atajos Ctrl+Z/Ctrl+Y.
- Panel diff MVP en historial (vertices/tipo antes-despues + accion "Ir").

## 3) Modelo de atributos

- Plantilla por capa con:
  - campos obligatorios,
  - dominio/lista de valores,
  - valores por defecto,
  - tipo de dato esperado.

## 4) Criterios MVP de aceptacion

- Captura completa punto/linea/poligono con formulario.
- Guardado en proyecto y recuperacion tras recarga.
- Mensajes de error claros cuando una validacion falla.
- Sin bloqueo de UI en datasets medianos.

## 5) TODO inicial de implementacion

- [x] UI panel digitalizacion.
- [x] Estado de modo de captura en runtime.
- [x] Formularios por capa (schema-driven).
- [x] Reglas de validacion de atributos.
- [x] Telemetria minima de errores de captura.
- [x] QA topologico MVP (autointerseccion, overlap, dangles, gaps por umbral).
- [x] Primer CAD-like MVP (ortogonal en geometria creada).
- [x] CAD paralelo MVP (lineas con referencia de capa activa).
- [x] CAD trim/extend MVP (lineas seleccionadas + distancia en metros).
- [x] Historial de edicion MVP persistente en proyecto.
- [x] Undo/Redo MVP para create/delete/update geometria.
- [x] Undo/Redo fino por vertice (granularidad basica).
- [x] Diff MVP de cambios geometricos en historial.
- [x] Undo/Redo por lote en operaciones complejas (merge/explode).
- [x] Undo/Redo de borrado de capa (restore de snapshot).
