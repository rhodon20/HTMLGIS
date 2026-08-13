# HTMLGIS

Aplicación GIS web progresiva, orientada a visualización, edición y procesamiento de información vectorial desde el navegador.

## Uso

HTMLGIS no necesita compilación. Sírvelo desde un servidor HTTP local o desde GitHub Pages; no abras `index.html` directamente porque el service worker y algunas funciones del navegador requieren HTTP/HTTPS.

```bash
python3 -m http.server 8000
```

Después abre `http://localhost:8000`.

## Formatos y funciones principales

- Importación de Shapefile ZIP, GeoJSON, KML y GPX.
- Capas, grupos, simbología, etiquetas y tabla de atributos.
- Digitalización con snapping, selección, edición y controles QA.
- CRS de proyecto y reproyección de capas compatibles.
- Geoprocesos con Turf: buffer, clip, unión, intersección y otros.
- Guardado local y exportación/importación de proyectos `.htmlgis.json`.
- PWA instalable con interfaz adaptada a móvil y áreas seguras de iOS.

## Uso en móvil

La barra inferior organiza los flujos principales en **Capas**, **Mapa**, **Capturar**, **Procesos** y **Datos**. Cada opción abre un panel inferior diseñado para uso táctil. Toca el fondo oscurecido o el botón de cierre para volver al mapa.

## Comprobaciones de desarrollo

Comprueba la sintaxis antes de publicar cambios:

```bash
find js -name '*.js' -print0 | xargs -0 -n1 node --check
node --check sw.js
```

En el navegador están disponibles `HTMLGISSmoke.runBasic()`, `HTMLGISSmoke.runExtended()` y `HTMLGISSmoke.runGate(mode)`.

## Dependencias

Las dependencias de mapas y GIS se cargan desde CDN. Para el mapa base y consultas OSM se necesita conexión a internet; los recursos principales de la aplicación se almacenan mediante el service worker.

## Estado

Consulta [ROADMAP.md](ROADMAP.md) para conocer las funciones implementadas y el trabajo previsto.
