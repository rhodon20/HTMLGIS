(function () {
  window.HTMLGISModules = window.HTMLGISModules || {};

  function initMap(options) {
    const map = L.map(options.mapId || 'map', { preferCanvas: true, maxZoom: 22 }).setView(options.center || [40.416, -3.703], options.zoom || 6);
    L.control.scale({ imperial: false }).addTo(map);

    const bases = {
      OpenStreetMap: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 22 }),
      'Carto Dark': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 22 }),
      'PNOA Sat': L.tileLayer.wms('http://www.ign.es/wms-inspire/pnoa-ma?', { layers: 'OI.OrthoimageCoverage', format: 'image/png', transparent: true }),
      'Esri Sat': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}')
    };

    bases.OpenStreetMap.addTo(map);
    L.control.layers(bases, null, { position: 'topright' }).addTo(map);

    map.pm.addControls({ position: 'topleft', drawCircle: false, rotateMode: true, cutPolygon: true });
    map.pm.setGlobalOptions({ snappable: true, snapDistance: 20 });

    return { map, bases };
  }

  window.HTMLGISModules.map = { initMap };
})();
