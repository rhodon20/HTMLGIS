(function () {
  window.HTMLGISModules = window.HTMLGISModules || {};
  let pending = null;
  const qaState = { entries: [] };

  function inferTemplateFromLayer(layer) {
    const sample = (layer.geojson && layer.geojson.features && layer.geojson.features[0]) ? layer.geojson.features[0] : null;
    const props = sample && sample.properties ? Object.keys(sample.properties).filter((k) => k !== '_uid') : [];
    return {
      fields: props.map((name) => ({ name, type: 'text', required: false, default: '', domain: [] }))
    };
  }

  function normalizeTemplate(input, layer) {
    const base = input && typeof input === 'object' ? input : inferTemplateFromLayer(layer);
    const src = Array.isArray(base.fields) ? base.fields : [];
    const fields = src
      .map((f) => {
        const name = String((f && f.name) || '').trim();
        if (!name || name === '_uid') return null;
        const type = (f.type === 'number') ? 'number' : 'text';
        const required = !!f.required;
        const def = f.default == null ? '' : f.default;
        const domain = Array.isArray(f.domain)
          ? f.domain.map((x) => String(x).trim()).filter(Boolean)
          : String(f.domain || '').split(',').map((x) => x.trim()).filter(Boolean);
        return { name, type, required, default: def, domain };
      })
      .filter(Boolean);
    return { fields };
  }

  function ensureTemplate(layer) {
    if (!layer.captureTemplate) layer.captureTemplate = inferTemplateFromLayer(layer);
    layer.captureTemplate = normalizeTemplate(layer.captureTemplate, layer);
    return layer.captureTemplate;
  }

  function editTemplate(ctx, layerId) {
    const layer = ctx.getLayers().find((x) => x.id === layerId);
    if (!layer) return;
    const tpl = ensureTemplate(layer);
    const raw = prompt('Editar plantilla JSON de captura (fields: name,type,required,default,domain[])', JSON.stringify(tpl, null, 2));
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      layer.captureTemplate = normalizeTemplate(parsed, layer);
      if (ctx.scheduleProjectSave) ctx.scheduleProjectSave();
      alert('Plantilla actualizada');
    } catch (e) {
      alert('Plantilla invalida: ' + (e && e.message ? e.message : e));
    }
  }

  function getSnapToleranceMeters(ctx) {
    const map = ctx && typeof ctx.getMap === 'function' ? ctx.getMap() : null;
    const input = document.getElementById('digitize-tolerance');
    const px = Math.max(1, parseInt((input && input.value) || '20', 10));
    if (!map || typeof map.containerPointToLatLng !== 'function' || typeof map.distance !== 'function') return px;
    try {
      const size = map.getSize();
      const p1 = L.point(size.x / 2, size.y / 2);
      const p2 = L.point(size.x / 2 + px, size.y / 2);
      return map.distance(map.containerPointToLatLng(p1), map.containerPointToLatLng(p2));
    } catch (_) {
      return px;
    }
  }

  function getGapThresholdM2() {
    const input = document.getElementById('digitize-gap-threshold');
    const n = Number((input && input.value) || 5);
    return Number.isFinite(n) ? Math.max(0, n) : 5;
  }

  function polygonRingArea(ring) {
    if (!Array.isArray(ring) || ring.length < 4) return 0;
    try {
      return Math.abs(turf.area(turf.polygon([ring])));
    } catch (_) {
      return 0;
    }
  }

  function holesAreaForFeature(feature) {
    if (!feature || !feature.geometry) return 0;
    const g = feature.geometry;
    let total = 0;
    if (g.type === 'Polygon' && Array.isArray(g.coordinates)) {
      for (let i = 1; i < g.coordinates.length; i++) total += polygonRingArea(g.coordinates[i]);
    } else if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
      g.coordinates.forEach((poly) => {
        if (!Array.isArray(poly)) return;
        for (let i = 1; i < poly.length; i++) total += polygonRingArea(poly[i]);
      });
    }
    return total;
  }

  function holesAreaForFeatures(features) {
    return (features || []).reduce((acc, f) => acc + holesAreaForFeature(f), 0);
  }

  function lineEndpoints(feature) {
    const out = [];
    if (!feature || !feature.geometry) return out;
    const g = feature.geometry;
    if (g.type === 'LineString' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
      out.push(turf.point(g.coordinates[0]), turf.point(g.coordinates[g.coordinates.length - 1]));
    }
    if (g.type === 'MultiLineString' && Array.isArray(g.coordinates)) {
      g.coordinates.forEach((line) => {
        if (Array.isArray(line) && line.length >= 2) {
          out.push(turf.point(line[0]), turf.point(line[line.length - 1]));
        }
      });
    }
    return out;
  }

  function renderQAState() {
    const list = document.getElementById('qa-items');
    const summary = document.getElementById('qa-summary');
    if (!list || !summary) return;
    if (!qaState.entries.length) {
      summary.innerText = 'QA: sin registros';
      list.innerHTML = '<div class="qa-item">Sin validaciones todavia.</div>';
      return;
    }

    const errors = qaState.entries.filter((x) => x.level === 'error').length;
    const warnings = qaState.entries.filter((x) => x.level === 'warning').length;
    const ok = qaState.entries.filter((x) => x.level === 'ok').length;
    summary.innerText = `QA: ok ${ok} | warn ${warnings} | err ${errors}`;
    list.innerHTML = qaState.entries
      .slice(0, 12)
      .map((x) => `<div class="qa-item qa-${x.level}">[${x.level.toUpperCase()}] ${x.layer} · ${x.geomType} · ${x.uid}: ${x.text}</div>`)
      .join('');
  }

  function clearQA() {
    qaState.entries = [];
    renderQAState();
  }

  function pushQAEntry(level, layer, feature, messages) {
    const uid = feature && feature.properties && feature.properties._uid ? feature.properties._uid : `tmp_${Date.now()}`;
    const geomType = feature && feature.geometry ? feature.geometry.type : 'Unknown';
    const text = Array.isArray(messages) && messages.length > 0 ? messages.join(' | ') : 'Sin incidencias';
    qaState.entries.unshift({
      at: new Date().toISOString(),
      level,
      layer: (layer && layer.name) ? layer.name : 'Sin capa',
      uid,
      geomType,
      text
    });
    if (qaState.entries.length > 30) qaState.entries.length = 30;
    renderQAState();
  }

  function validateFeatureTopology(ctx, layer, feature) {
    const errors = [];
    const warnings = [];
    if (!feature || !feature.geometry) {
      errors.push('Geometria vacia');
      return { errors, warnings };
    }

    const g = feature.geometry;
    try {
      if (g.type === 'LineString' && (!Array.isArray(g.coordinates) || g.coordinates.length < 2)) {
        errors.push('Linea invalida: minimo 2 vertices');
      }
      if (g.type === 'Polygon' && Array.isArray(g.coordinates) && g.coordinates[0] && g.coordinates[0].length < 4) {
        errors.push('Poligono invalido: minimo 4 vertices (anillo cerrado)');
      }
      if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
        g.coordinates.forEach((poly, idx) => {
          if (poly && poly[0] && poly[0].length < 4) errors.push(`MultiPolygon parte ${idx + 1} invalida`);
        });
      }
    } catch (_) {}

    try {
      const kinks = turf.kinks(feature);
      if (kinks && Array.isArray(kinks.features) && kinks.features.length > 0) {
        errors.push(`Autointerseccion detectada (${kinks.features.length})`);
      }
    } catch (_) {}

    const existing = (layer && layer.geojson && Array.isArray(layer.geojson.features)) ? layer.geojson.features : [];
    const type = g.type;
    if (type === 'Polygon' || type === 'MultiPolygon') {
      const polygonFeatures = existing.filter((f) => f && f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'));
      polygonFeatures.forEach((f, idx) => {
        try {
          const inter = turf.intersect(feature, f);
          if (inter && turf.area(inter) > 0.01) errors.push(`Overlap con poligono existente #${idx + 1}`);
        } catch (_) {}
      });
      if (polygonFeatures.length > 0) {
        const preHoles = holesAreaForFeatures(polygonFeatures);
        const postHoles = holesAreaForFeatures(polygonFeatures.concat([feature]));
        const addedGaps = Math.max(0, postHoles - preHoles);
        const gapThreshold = getGapThresholdM2();
        if (addedGaps > gapThreshold) {
          warnings.push(`Gap potencial detectado (${addedGaps.toFixed(2)} m2 > ${gapThreshold.toFixed(2)} m2)`);
        }
      }
    }

    if (type === 'LineString' || type === 'MultiLineString') {
      const tolMeters = Math.max(0.1, getSnapToleranceMeters(ctx));
      const endpoints = lineEndpoints(feature);
      if (endpoints.length > 0) {
        endpoints.forEach((pt, idx) => {
          let minDist = Infinity;
          existing.forEach((f) => {
            if (!f || !f.geometry) return;
            if (f.geometry.type !== 'LineString' && f.geometry.type !== 'MultiLineString') return;
            try {
              const d = turf.pointToLineDistance(pt, f, { units: 'meters' });
              if (Number.isFinite(d) && d < minDist) minDist = d;
            } catch (_) {}
          });
          if (minDist > tolMeters) warnings.push(`Dangle probable en extremo ${idx + 1} (>${tolMeters.toFixed(2)}m)`);
        });
      }
    }

    return { errors, warnings };
  }

  function openFeatureForm(ctx, layer, feature, onOk, onCancel) {
    const qa = validateFeatureTopology(ctx, layer, feature);
    if (qa.errors.length > 0) {
      pushQAEntry('error', layer, feature, qa.errors.concat(qa.warnings || []));
      alert(`QA topologico: ${qa.errors.join(' | ')}`);
      if (typeof onCancel === 'function') onCancel();
      return;
    }
    if (qa.warnings.length > 0) {
      pushQAEntry('warning', layer, feature, qa.warnings);
      const proceed = confirm(`QA topologico (warning): ${qa.warnings.join(' | ')}. Continuar?`);
      if (!proceed) {
        if (typeof onCancel === 'function') onCancel();
        return;
      }
    } else {
      pushQAEntry('ok', layer, feature, ['Validacion topologica OK']);
    }

    const tpl = ensureTemplate(layer);
    const fields = tpl.fields || [];
    if (!fields.length) {
      onOk();
      return;
    }

    const body = document.getElementById('capture-form-body');
    body.innerHTML = '';

    fields.forEach((f) => {
      const row = document.createElement('div');
      row.className = 'form-group';

      const label = document.createElement('label');
      label.innerText = f.required ? `${f.name} *` : f.name;
      row.appendChild(label);

      const value = feature.properties[f.name] != null ? feature.properties[f.name] : f.default;

      let input;
      if (Array.isArray(f.domain) && f.domain.length > 0) {
        input = document.createElement('select');
        input.dataset.field = f.name;
        input.dataset.type = f.type;
        input.dataset.required = String(!!f.required);
        const empty = document.createElement('option');
        empty.value = '';
        empty.innerText = '(Seleccionar)';
        input.appendChild(empty);
        f.domain.forEach((v) => {
          const op = document.createElement('option');
          op.value = v;
          op.innerText = v;
          input.appendChild(op);
        });
        input.value = value == null ? '' : String(value);
      } else {
        input = document.createElement('input');
        input.type = f.type === 'number' ? 'number' : 'text';
        input.dataset.field = f.name;
        input.dataset.type = f.type;
        input.dataset.required = String(!!f.required);
        input.value = value == null ? '' : String(value);
      }
      row.appendChild(input);
      body.appendChild(row);
    });

    pending = { feature, onOk, onCancel };
    document.getElementById('capture-modal').style.display = 'flex';
  }

  function closeForm() {
    document.getElementById('capture-modal').style.display = 'none';
    pending = null;
  }

  function saveForm() {
    if (!pending) return;
    const inputs = document.querySelectorAll('#capture-form-body [data-field]');
    for (const el of inputs) {
      const field = el.dataset.field;
      const required = el.dataset.required === 'true';
      const type = el.dataset.type;
      let val = el.value;
      if (required && (val == null || String(val).trim() === '')) {
        alert(`El campo ${field} es obligatorio`);
        el.focus();
        return;
      }
      if (type === 'number') {
        val = val === '' ? null : Number(val);
        if (val != null && Number.isNaN(val)) {
          alert(`El campo ${field} debe ser numerico`);
          el.focus();
          return;
        }
      }
      pending.feature.properties[field] = val;
    }

    const done = pending.onOk;
    closeForm();
    if (typeof done === 'function') done();
  }

  function cancelForm() {
    if (!pending) return closeForm();
    const cb = pending.onCancel;
    closeForm();
    if (typeof cb === 'function') cb();
  }

  function init() {
    const saveBtn = document.getElementById('capture-save-btn');
    const cancelBtn = document.getElementById('capture-cancel-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveForm);
    if (cancelBtn) cancelBtn.addEventListener('click', cancelForm);
    const modal = document.getElementById('capture-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target.id === 'capture-modal') cancelForm();
      });
    }
    renderQAState();
  }

  window.HTMLGISModules.capture = {
    init,
    inferTemplateFromLayer,
    ensureTemplate,
    editTemplate,
    openFeatureForm,
    clearQA
  };
})();
