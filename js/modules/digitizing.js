(function () {
  window.HTMLGISModules = window.HTMLGISModules || {};

  const modeToShape = {
    point: 'Marker',
    line: 'Line',
    polygon: 'Polygon'
  };

  const cad = { orthogonal: false, parallel: false };

  function formatMetrics(feature) {
    if (!feature || !feature.geometry) return 'Metricas: -';
    const t = feature.geometry.type;
    try {
      if (t === 'Point' || t === 'MultiPoint') return 'Metricas: punto';
      if (t === 'LineString' || t === 'MultiLineString') {
        const km = turf.length(feature, { units: 'kilometers' });
        return `Metricas: ${(km * 1000).toFixed(1)} m`;
      }
      if (t === 'Polygon' || t === 'MultiPolygon') {
        const area = turf.area(feature);
        return `Metricas: ${area.toFixed(1)} m2`;
      }
    } catch (_) {}
    return 'Metricas: -';
  }

  function setModeUI(mode) {
    const label = document.getElementById('digitize-mode');
    label.innerText = `Modo: ${mode || 'ninguno'}`;
    document.querySelectorAll('[data-action="digitize-start"]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  }

  function applySnap(map) {
    const snap = document.getElementById('digitize-snap').checked;
    const tol = Math.max(1, parseInt(document.getElementById('digitize-tolerance').value || '20', 10));
    map.pm.setGlobalOptions({ snappable: !!snap, snapDistance: tol });
  }

  function toMercator(ll) {
    const x = ll.lng * 20037508.34 / 180;
    const y = Math.log(Math.tan((90 + ll.lat) * Math.PI / 360)) * (20037508.34 / Math.PI);
    return { x, y };
  }

  function fromMercator(xy) {
    const lng = (xy.x / 20037508.34) * 180;
    const lat = (Math.atan(Math.exp((xy.y / 20037508.34) * Math.PI)) * 360 / Math.PI) - 90;
    return { lat, lng };
  }

  function orthogonalizeXY(points, closeRing) {
    if (!Array.isArray(points) || points.length < 2) return points || [];
    const out = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const prev = out[out.length - 1];
      const cur = points[i];
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      if (Math.abs(dx) >= Math.abs(dy)) out.push({ x: cur.x, y: prev.y });
      else out.push({ x: prev.x, y: cur.y });
    }
    if (closeRing && out.length > 2) {
      out[out.length - 1] = { x: out[0].x, y: out[0].y };
    }
    return out;
  }

  function setCadStatus() {
    const el = document.getElementById('digitize-cad-status');
    if (el) {
      el.innerText = `CAD: ortogonal ${cad.orthogonal ? 'on' : 'off'} | paralelo ${cad.parallel ? 'on' : 'off'}`;
    }
  }

  function getReferenceAngleFromLayer(ctx) {
    const layers = ctx && typeof ctx.getLayers === 'function' ? ctx.getLayers() : [];
    const activeId = ctx && typeof ctx.getActiveId === 'function' ? ctx.getActiveId() : null;
    const layer = layers.find((l) => l && l.id === activeId);
    const feats = layer && layer.geojson && Array.isArray(layer.geojson.features) ? layer.geojson.features : [];
    for (const f of feats) {
      if (!f || !f.geometry) continue;
      if (f.geometry.type === 'LineString' && Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length >= 2) {
        const c0 = f.geometry.coordinates[0];
        const c1 = f.geometry.coordinates[1];
        if (!Array.isArray(c0) || !Array.isArray(c1)) continue;
        const p0 = toMercator({ lat: c0[1], lng: c0[0] });
        const p1 = toMercator({ lat: c1[1], lng: c1[0] });
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) return Math.atan2(dy, dx);
      }
      if (f.geometry.type === 'MultiLineString' && Array.isArray(f.geometry.coordinates)) {
        for (const line of f.geometry.coordinates) {
          if (!Array.isArray(line) || line.length < 2) continue;
          const c0 = line[0];
          const c1 = line[1];
          if (!Array.isArray(c0) || !Array.isArray(c1)) continue;
          const p0 = toMercator({ lat: c0[1], lng: c0[0] });
          const p1 = toMercator({ lat: c1[1], lng: c1[0] });
          const dx = p1.x - p0.x;
          const dy = p1.y - p0.y;
          if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) return Math.atan2(dy, dx);
        }
      }
    }
    return null;
  }

  function parallelizeXY(points, refAngle) {
    if (!Array.isArray(points) || points.length < 2 || !Number.isFinite(refAngle)) return points || [];
    const out = [points[0]];
    const ux = Math.cos(refAngle);
    const uy = Math.sin(refAngle);
    for (let i = 1; i < points.length; i++) {
      const prev = out[out.length - 1];
      const cur = points[i];
      const odx = cur.x - prev.x;
      const ody = cur.y - prev.y;
      const len = Math.hypot(odx, ody);
      if (len < 0.001) {
        out.push({ x: cur.x, y: cur.y });
        continue;
      }
      const dot = odx * ux + ody * uy;
      const sign = dot >= 0 ? 1 : -1;
      out.push({ x: prev.x + sign * ux * len, y: prev.y + sign * uy * len });
    }
    return out;
  }

  function trimLineXY(points, cutMeters) {
    if (!Array.isArray(points) || points.length < 2) return null;
    let remain = Math.max(0, Number(cutMeters) || 0);
    if (remain <= 0) return points.slice();

    const out = points.slice();
    while (out.length >= 2 && remain > 0) {
      const n = out.length;
      const p0 = out[n - 2];
      const p1 = out[n - 1];
      const seg = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      if (seg < 0.001) {
        out.pop();
        continue;
      }
      if (remain < seg) {
        const t = (seg - remain) / seg;
        out[n - 1] = { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
        remain = 0;
      } else {
        out.pop();
        remain -= seg;
      }
    }
    return out.length >= 2 ? out : null;
  }

  function extendLineXY(points, extendMeters) {
    if (!Array.isArray(points) || points.length < 2) return null;
    const m = Math.max(0, Number(extendMeters) || 0);
    if (m <= 0) return points.slice();
    const out = points.slice();
    const n = out.length;
    const p0 = out[n - 2];
    const p1 = out[n - 1];
    let dx = p1.x - p0.x;
    let dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) return out;
    dx /= len;
    dy /= len;
    out[n - 1] = { x: p1.x + dx * m, y: p1.y + dy * m };
    return out;
  }

  function adjustCoordsByDistance(coords, mode, meters) {
    if (!Array.isArray(coords) || coords.length < 2) return null;
    const xy = coords.map((c) => toMercator({ lat: c[1], lng: c[0] }));
    const next = mode === 'trim' ? trimLineXY(xy, meters) : extendLineXY(xy, meters);
    if (!next || next.length < 2) return null;
    return next.map(fromMercator).map((p) => [p.lng, p.lat]);
  }

  function prepareCreatedLayer(ctx, layer) {
    if ((!cad.orthogonal && !cad.parallel) || !layer || typeof layer.toGeoJSON !== 'function') return;
    let feature;
    try {
      feature = layer.toGeoJSON();
    } catch (_) {
      return;
    }
    if (!feature || !feature.geometry) return;

    const type = feature.geometry.type;
    if (type === 'LineString') {
      const ll = layer.getLatLngs();
      if (!Array.isArray(ll) || ll.length < 2) return;
      const xy = ll.map(toMercator);
      let next = xy;
      if (cad.parallel) {
        const ref = getReferenceAngleFromLayer(ctx);
        if (Number.isFinite(ref)) next = parallelizeXY(next, ref);
      }
      if (cad.orthogonal) next = orthogonalizeXY(next, false);
      const out = next.map(fromMercator).map((p) => L.latLng(p.lat, p.lng));
      layer.setLatLngs(out);
      if (typeof layer.redraw === 'function') layer.redraw();
      return;
    }

    if (type === 'Polygon') {
      const rings = layer.getLatLngs();
      if (!Array.isArray(rings) || !Array.isArray(rings[0]) || rings[0].length < 4) return;
      const ring = rings[0];
      if (!cad.orthogonal) return;
      const xy = ring.map(toMercator);
      const out = orthogonalizeXY(xy, true).map(fromMercator).map((p) => L.latLng(p.lat, p.lng));
      layer.setLatLngs([out]);
      if (typeof layer.redraw === 'function') layer.redraw();
    }
  }

  function init(ctx) {
    const map = ctx.getMap();
    if (!map) return;

    applySnap(map);
    setModeUI(null);
    setCadStatus();

    map.on('pm:drawstart', (e) => {
      const wl = e.workingLayer;
      if (!wl) return;
      const update = () => {
        try {
          const f = wl.toGeoJSON();
          document.getElementById('digitize-metrics').innerText = formatMetrics(f);
        } catch (_) {
          document.getElementById('digitize-metrics').innerText = 'Metricas: -';
        }
      };
      wl.on('pm:vertexadded', update);
      wl.on('pm:snapdrag', update);
      wl.on('pm:markerdrag', update);
    });

    map.on('pm:create', (e) => {
      try {
        const f = e.layer.toGeoJSON();
        document.getElementById('digitize-metrics').innerText = formatMetrics(f);
      } catch (_) {
        document.getElementById('digitize-metrics').innerText = 'Metricas: -';
      }
    });
  }

  function start(ctx, mode) {
    const map = ctx.getMap();
    if (!ctx.getActiveId()) return alert('Selecciona una capa activa para digitalizar');
    if (typeof ctx.canEditActiveLayer === 'function' && !ctx.canEditActiveLayer()) {
      return alert('La capa activa no es editable (bloqueada o CRS no compatible con el modo actual)');
    }
    const shape = modeToShape[mode];
    if (!shape) return;

    applySnap(map);
    map.pm.disableDraw();
    map.pm.enableDraw(shape, { snappable: true, continueDrawing: true });
    setModeUI(mode);
  }

  function stop(ctx) {
    const map = ctx.getMap();
    map.pm.disableDraw();
    setModeUI(null);
  }

  function setSnap(ctx) {
    applySnap(ctx.getMap());
  }

  function setTolerance(ctx) {
    applySnap(ctx.getMap());
  }

  function setOrthogonal() {
    const cb = document.getElementById('digitize-ortho');
    cad.orthogonal = !!(cb && cb.checked);
    setCadStatus();
  }

  function setParallel() {
    const cb = document.getElementById('digitize-parallel');
    cad.parallel = !!(cb && cb.checked);
    setCadStatus();
  }

  function getCadAdjustMeters() {
    const input = document.getElementById('cad-adjust-m');
    const n = Number((input && input.value) || 5);
    return Number.isFinite(n) ? Math.max(0.1, n) : 5;
  }

  function adjustSelectedLines(ctx, mode) {
    const layers = ctx.getLayers();
    const activeId = ctx.getActiveId();
    const layer = layers.find((l) => l.id === activeId);
    if (!layer) return alert('Selecciona una capa activa');
    const layerCrs = String((layer && layer.crs) || 'EPSG:4326').toUpperCase();
    if (layerCrs !== 'EPSG:4326') {
      return alert('CAD trim/extend solo esta disponible en capas EPSG:4326 en este MVP');
    }
    const ids = Array.isArray(layer.selectedIds) ? layer.selectedIds : [];
    if (!ids.length) return alert('Selecciona al menos una linea de la capa activa');

    const meters = getCadAdjustMeters();
    let changed = 0;
    let skipped = 0;
    const geometryChanges = [];
    layer.geojson.features.forEach((f) => {
      if (!f || !f.properties || !ids.includes(f.properties._uid) || !f.geometry) return;
      if (f.geometry.type === 'LineString') {
        const before = JSON.parse(JSON.stringify(f.geometry));
        const next = adjustCoordsByDistance(f.geometry.coordinates, mode, meters);
        if (next) {
          f.geometry.coordinates = next;
          geometryChanges.push({ uid: f.properties._uid, beforeGeometry: before, afterGeometry: JSON.parse(JSON.stringify(f.geometry)), feature: f });
          changed++;
        } else skipped++;
        return;
      }
      if (f.geometry.type === 'MultiLineString' && Array.isArray(f.geometry.coordinates)) {
        const before = JSON.parse(JSON.stringify(f.geometry));
        let ok = false;
        f.geometry.coordinates = f.geometry.coordinates.map((line) => {
          const next = adjustCoordsByDistance(line, mode, meters);
          if (next) {
            ok = true;
            return next;
          }
          return line;
        });
        if (ok) {
          geometryChanges.push({ uid: f.properties._uid, beforeGeometry: before, afterGeometry: JSON.parse(JSON.stringify(f.geometry)), feature: f });
          changed++;
        }
        else skipped++;
        return;
      }
      skipped++;
    });

    if (changed > 0) {
      if (ctx.recordGeometryBatch) ctx.recordGeometryBatch(layer, geometryChanges, `cad-${mode}`);
      if (ctx.addEditHistory) geometryChanges.forEach((g) => ctx.addEditHistory('update', layer, g.feature, `cad-${mode}`));
      if (ctx.refreshLayerFeatures) ctx.refreshLayerFeatures(layer);
    }
    if (ctx.scheduleProjectSave) ctx.scheduleProjectSave();
    const label = mode === 'trim' ? 'trim' : 'extend';
    alert(`CAD ${label}: ${changed} feature(s) actualizadas, ${skipped} omitidas`);
  }

  window.HTMLGISModules.digitizing = {
    init,
    start,
    stop,
    setSnap,
    setTolerance,
    setOrthogonal,
    setParallel,
    prepareCreatedLayer,
    adjustSelectedLines
  };
})();
