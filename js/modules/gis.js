(function () {
  window.HTMLGISModules = window.HTMLGISModules || {};

  function getFieldOptions(ctx, layerId) {
    const layers = ctx.getLayers();
    const l = layers.find((x) => x.id === layerId);
    if (!l || l.geojson.features.length === 0) return '';
    const props = Object.keys(l.geojson.features[0].properties).filter((k) => k !== '_uid');
    let opts = '<option value="">(Seleccionar)</option>';
    props.forEach((p) => { opts += `<option value="${p}">${p}</option>`; });
    return opts;
  }
  function normalizeCrs(code) {
    const c = String(code || '').trim().toUpperCase();
    return c || 'EPSG:4326';
  }
  function registerDerivedLayer(ctx, sourceLayer, resultGeojson, name) {
    if (!resultGeojson) return null;
    const srcCrs = sourceLayer ? normalizeCrs(sourceLayer.crs) : 'EPSG:4326';
    return ctx.registerLayer(resultGeojson, name, { crs: srcCrs });
  }
  function ensureBinaryCrsCompatible(activeLayer, otherLayer) {
    if (!activeLayer || !otherLayer) return false;
    return normalizeCrs(activeLayer.crs) === normalizeCrs(otherLayer.crs);
  }
  function featuresBySelectionOrAll(layerObj) {
    if (!layerObj || !layerObj.geojson || !Array.isArray(layerObj.geojson.features)) return [];
    if (Array.isArray(layerObj.selectedIds) && layerObj.selectedIds.length > 0) {
      return layerObj.geojson.features.filter((f) => f && f.properties && layerObj.selectedIds.includes(f.properties._uid));
    }
    return layerObj.geojson.features;
  }
  function runBinaryPreview(tool, srcFc, targetFc, options) {
    const t = String(tool || '').toLowerCase();
    const src = srcFc && srcFc.type === 'FeatureCollection' ? srcFc : { type: 'FeatureCollection', features: [] };
    const target = targetFc && targetFc.type === 'FeatureCollection' ? targetFc : { type: 'FeatureCollection', features: [] };
    const opts = options || {};

    if (!Array.isArray(src.features) || src.features.length === 0) return turf.featureCollection([]);
    if (!Array.isArray(target.features) || target.features.length === 0) return turf.featureCollection([]);

    if (t === 'intersect') {
      const intersections = [];
      src.features.forEach((fA) => {
        target.features.forEach((fB) => {
          const intersection = turf.intersect(fA, fB);
          if (intersection) {
            intersection.properties = { ...(fA.properties || {}), ...(fB.properties || {}) };
            intersections.push(intersection);
          }
        });
      });
      return turf.featureCollection(intersections);
    }
    if (t === 'difference') {
      const differences = [];
      src.features.forEach((fA) => {
        let currentFeature = fA;
        target.features.forEach((fB) => {
          const diff = turf.difference(currentFeature, fB);
          if (diff) currentFeature = diff;
          else currentFeature = null;
        });
        if (currentFeature) {
          currentFeature.properties = fA.properties;
          differences.push(currentFeature);
        }
      });
      return turf.featureCollection(differences);
    }
    if (t === 'clip') {
      const clipped = [];
      src.features.forEach((fA) => {
        target.features.forEach((fB) => {
          const inter = turf.intersect(fA, fB);
          if (inter && inter.geometry) {
            inter.properties = { ...(fA.properties || {}) };
            clipped.push(inter);
          }
        });
      });
      return turf.featureCollection(clipped);
    }
    if (t === 'spatialjoin') {
      const relation = String(opts.relation || 'intersects');
      const prefix = String(opts.prefix || 'b_');
      const mode = String(opts.mode || 'first');
      const sumField = String(opts.sumField || '').trim();
      const onlyHits = !!opts.onlyHits;
      const out = src.features.map((fA) => {
        const next = JSON.parse(JSON.stringify(fA));
        if (!next.properties) next.properties = {};
        const matches = target.features.filter((fB) => {
          try {
            if (relation === 'within') return turf.booleanWithin(fA, fB);
            if (relation === 'contains') return turf.booleanContains(fA, fB);
            return turf.booleanIntersects(fA, fB);
          } catch (_) {
            return false;
          }
        });
        if (mode === 'all') {
          if (!matches.length) {
            next.properties.join_hit = 0;
            next.properties.join_count = 0;
            return [next];
          }
          return matches.map((match, idx) => {
            const row = JSON.parse(JSON.stringify(next));
            if (!row.properties) row.properties = {};
            if (match && match.properties) {
              Object.keys(match.properties).forEach((k) => {
                if (k === '_uid') return;
                row.properties[`${prefix}${k}`] = match.properties[k];
              });
            }
            row.properties.join_hit = 1;
            row.properties.join_count = matches.length;
            row.properties.join_match_index = idx + 1;
            return row;
          });
        }
        if (mode === 'count') {
          next.properties.join_count = matches.length;
          next.properties.join_hit = matches.length > 0 ? 1 : 0;
        } else if (mode === 'sum') {
          let sum = 0;
          let n = 0;
          matches.forEach((m) => {
            if (!m || !m.properties) return;
            const v = Number(m.properties[sumField]);
            if (Number.isFinite(v)) {
              sum += v;
              n++;
            }
          });
          next.properties.join_sum = sum;
          next.properties.join_sum_field = sumField || null;
          next.properties.join_count = matches.length;
          next.properties.join_hit = n > 0 ? 1 : 0;
        } else {
          const match = matches[0];
          if (match && match.properties) {
            Object.keys(match.properties).forEach((k) => {
              if (k === '_uid') return;
              next.properties[`${prefix}${k}`] = match.properties[k];
            });
            next.properties.join_hit = 1;
          } else {
            next.properties.join_hit = 0;
          }
        }
        return [next];
      });
      const flat = [].concat(...out);
      const filtered = onlyHits ? flat.filter((f) => f && f.properties && Number(f.properties.join_hit) === 1) : flat;
      return turf.featureCollection(filtered);
    }
    if (t === 'nearestneighbor') {
      const prefix = String(opts.prefix || 'b_');
      const targetPts = target.features.map((f) => {
        const c = turf.centroid(f);
        c.properties = { ...(f.properties || {}) };
        return c;
      });
      if (!targetPts.length) return turf.featureCollection([]);
      const targetFcPts = turf.featureCollection(targetPts);
      const out = src.features.map((fA) => {
        const next = JSON.parse(JSON.stringify(fA));
        if (!next.properties) next.properties = {};
        const cA = turf.centroid(fA);
        const near = turf.nearestPoint(cA, targetFcPts);
        if (near && near.properties) {
          Object.keys(near.properties).forEach((k) => {
            if (k === '_uid') return;
            next.properties[`${prefix}${k}`] = near.properties[k];
          });
          try {
            next.properties.nn_dist_km = turf.distance(cA, near, { units: 'kilometers' });
          } catch (_) {
            next.properties.nn_dist_km = null;
          }
          next.properties.nn_hit = 1;
        } else {
          next.properties.nn_dist_km = null;
          next.properties.nn_hit = 0;
        }
        return next;
      });
      return turf.featureCollection(out);
    }
    throw new Error(`Preview no soporta herramienta: ${tool}`);
  }

  function openProcessModal(ctx, tool) {
    const activeId = ctx.getActiveId();
    if (!activeId) return alert('Se requiere una Capa Activa.');
    ctx.toggleMenu('menu-gis');

    ctx.setCurrentProcess({ tool, options: {} });
    const modalTitle = document.getElementById('modal-title');
    const modalForm = document.getElementById('modal-form');
    let formHTML = '';

    const layers = ctx.getLayers();
    const activeLayer = layers.find((x) => x.id === activeId);
    const activeLayerName = activeLayer ? activeLayer.name : '';
    const otherLayers = layers.filter((x) => x.id !== activeId);
    const layerOptions = otherLayers.map((l) => `<option value="${l.id}">${l.name}</option>`).join('');

    switch (tool) {
      case 'buffer': {
        modalTitle.innerText = `Buffer: ${activeLayerName}`;
        const fieldOptionsBuffer = getFieldOptions(ctx, activeId);
        formHTML = `
          <div class="form-group">
            <label>Distancia (Km):</label>
            <input type="number" id="buffer-dist" placeholder="0.5" value="0.1" step="0.01">
            <small class="text-muted">Si se usa campo, se ignora esta distancia.</small>
          </div>
          <div class="form-group">
            <label>Campo Variable de Distancia:</label>
            <select id="buffer-field">${fieldOptionsBuffer}</select>
          </div>`;
        break;
      }
      case 'union': {
        modalTitle.innerText = `Disolver (Union): ${activeLayerName}`;
        const fieldOptionsUnion = getFieldOptions(ctx, activeId);
        formHTML = `
          <div class="form-group">
            <label>Campo para Agrupar (Disolver):</label>
            <select id="union-field">${fieldOptionsUnion}</select>
            <small class="text-muted">Vacio: disolvera todas las geometrias en una sola.</small>
          </div>`;
        break;
      }
      case 'simplify': {
        modalTitle.innerText = `Simplify: ${activeLayerName}`;
        formHTML = `
          <div class="form-group">
            <label>Tolerancia (grados):</label>
            <input type="number" id="simplify-tolerance" value="0.0005" step="0.0001" min="0.00001">
            <small class="text-muted">Usa valores pequeños para no deformar la geometría.</small>
          </div>
          <div class="form-group">
            <label><input type="checkbox" id="simplify-high-quality"> High quality</label>
          </div>`;
        break;
      }
      case 'repair': {
        modalTitle.innerText = `Repair Geometry: ${activeLayerName}`;
        formHTML = `
          <div class="form-group">
            <label>Metodo:</label>
            <select id="repair-method">
              <option value="buffer0">buffer(0) para poligonos</option>
              <option value="cleancoords">cleanCoords (todas las geometrias)</option>
            </select>
          </div>`;
        break;
      }
      case 'intersect':
      case 'difference':
      case 'clip':
      case 'spatialjoin':
      case 'nearestneighbor': {
        modalTitle.innerText = `${tool === 'intersect' ? 'Interseccion' : 'Diferencia'} (2 Capas)`;
        if (tool === 'clip') modalTitle.innerText = 'Clip (2 Capas)';
        if (tool === 'spatialjoin') modalTitle.innerText = 'Spatial Join (2 Capas)';
        if (tool === 'nearestneighbor') modalTitle.innerText = 'Nearest Neighbor (2 Capas)';
        if (otherLayers.length === 0) {
          modalForm.innerHTML = '<p style="color:#e74c3c;">Se requiere otra capa para esta operacion.</p>';
          document.querySelector('#process-modal .btn-block').style.display = 'none';
          document.getElementById('process-modal').style.display = 'flex';
          return;
        }
        const extra = tool === 'spatialjoin'
          ? `
          <div class="form-group">
            <label>Relacion espacial:</label>
            <select id="sj-relation">
              <option value="intersects">intersects</option>
              <option value="within">within</option>
              <option value="contains">contains</option>
            </select>
          </div>
          <div class="form-group">
            <label>Modo de join:</label>
            <select id="sj-mode">
              <option value="first">first (atributos de primer match)</option>
              <option value="count">count (numero de matches)</option>
              <option value="sum">sum (suma numerica de campo)</option>
              <option value="all">all (explota 1:N por match)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Prefijo de campos de B:</label>
            <input type="text" id="sj-prefix" value="b_" maxlength="12">
          </div>`
          : '';
        const extraOnlyHits = tool === 'spatialjoin'
          ? `
          <div class="form-group">
            <label><input type="checkbox" id="sj-only-hits"> Solo coincidencias (join_hit=1)</label>
          </div>`
          : '';
        const extraNearest = tool === 'nearestneighbor'
          ? `
          <div class="form-group">
            <label>Prefijo de campos de B:</label>
            <input type="text" id="nn-prefix" value="b_" maxlength="12">
          </div>`
          : '';
        const extraSum = tool === 'spatialjoin'
          ? `
          <div class="form-group" id="sj-sum-wrap" style="display:none;">
            <label>Campo numerico de B para suma:</label>
            <input type="text" id="sj-sum-field" placeholder="ej: poblacion">
          </div>`
          : '';
        const opLabel = tool === 'intersect' ? 'A n B' : (tool === 'difference' ? 'A - B' : (tool === 'clip' ? 'A clip B' : 'A join B'));
        formHTML = `
          <div class="form-group">
            <label>Capa de Entrada (A):</label>
            <input type="text" value="${activeLayerName}" readonly>
          </div>
          <div class="form-group">
            <label>Capa de Referencia (B):</label>
            <select id="target-layer-id">${layerOptions}</select>
          </div>
          ${extra}
          ${extraOnlyHits}
          ${extraNearest}
          ${extraSum}
          <p class="text-muted" style="font-size:0.8rem;">Operacion: ${opLabel}</p>`;
        break;
      }
      default:
        return;
    }

    modalForm.innerHTML = formHTML;
    document.querySelector('#process-modal .btn-block').style.display = 'block';
    document.getElementById('process-modal').style.display = 'flex';
    if (tool === 'spatialjoin') {
      const modeEl = document.getElementById('sj-mode');
      const wrapEl = document.getElementById('sj-sum-wrap');
      const refreshSumUi = () => {
        if (!modeEl || !wrapEl) return;
        wrapEl.style.display = String(modeEl.value) === 'sum' ? 'block' : 'none';
      };
      if (modeEl) modeEl.addEventListener('change', refreshSumUi);
      refreshSumUi();
    }
  }

  function closeProcessModal(ctx) {
    document.getElementById('process-modal').style.display = 'none';
    const cp = ctx.getCurrentProcess();
    cp.tool = null;
    cp.options = {};
    ctx.setCurrentProcess(cp);
  }

  async function executeProcess(ctx) {
    const cp = ctx.getCurrentProcess();
    const tool = cp.tool;
    const activeId = ctx.getActiveId();
    const layers = ctx.getLayers();
    const l = layers.find((x) => x.id === activeId);
    if (!l) return;

    let src = l.geojson;
    let suffix = '';
    let options = {};
    closeProcessModal(ctx);

    if (l.selectedIds.length > 0) {
      src = { type: 'FeatureCollection', features: l.geojson.features.filter((f) => l.selectedIds.includes(f.properties._uid)) };
      suffix = '_Sel';
    }

    switch (tool) {
      case 'buffer': {
        const dist = document.getElementById('buffer-dist').value;
        const field = document.getElementById('buffer-field').value;
        if (!dist && !field) { alert('Se requiere distancia o campo.'); return; }
        if (field) { options = field; suffix += '_Var'; }
        else if (!isNaN(parseFloat(dist))) { options = parseFloat(dist); suffix += `_${options}km`; }
        else { alert('Distancia no valida.'); return; }
        break;
      }
      case 'union': {
        const unionField = document.getElementById('union-field').value;
        if (unionField) { options = { propertyName: unionField }; suffix += `_${unionField}`; }
        else { suffix += '_All'; }
        break;
      }
      case 'simplify': {
        const tol = parseFloat((document.getElementById('simplify-tolerance') || {}).value || '0');
        if (!Number.isFinite(tol) || tol <= 0) { alert('Tolerancia no valida.'); return; }
        options = {
          tolerance: tol,
          highQuality: !!((document.getElementById('simplify-high-quality') || {}).checked)
        };
        suffix += `_tol${tol}`;
        break;
      }
      case 'repair': {
        options = {
          method: String((document.getElementById('repair-method') || {}).value || 'buffer0')
        };
        suffix += `_${options.method}`;
        break;
      }
      case 'intersect':
      case 'difference':
      case 'clip':
      case 'spatialjoin':
      case 'nearestneighbor': {
        const targetLayerId = document.getElementById('target-layer-id').value;
        if (!targetLayerId) { alert('Selecciona la capa de referencia.'); return; }
        const o = layers.find((x) => x.id === targetLayerId);
        if (!o) { alert('Capa de referencia no encontrada.'); return; }
        if (!ensureBinaryCrsCompatible(l, o)) {
          alert('Las operaciones entre 2 capas requieren el mismo CRS. Reproyecta una de las capas.');
          return;
        }
        options = {
          targetGeoJSON: o.geojson,
          targetLayer: o,
          relation: tool === 'spatialjoin' ? String((document.getElementById('sj-relation') || {}).value || 'intersects') : 'intersects',
          prefix: tool === 'spatialjoin' ? String((document.getElementById('sj-prefix') || {}).value || 'b_') : 'b_',
          mode: tool === 'spatialjoin' ? String((document.getElementById('sj-mode') || {}).value || 'first') : 'first',
          sumField: tool === 'spatialjoin' ? String((document.getElementById('sj-sum-field') || {}).value || '') : '',
          onlyHits: tool === 'spatialjoin' ? !!((document.getElementById('sj-only-hits') || {}).checked) : false,
          nnPrefix: tool === 'nearestneighbor' ? String((document.getElementById('nn-prefix') || {}).value || 'b_') : 'b_'
        };
        suffix += `_${o.name}`;
        break;
      }
      default:
        break;
    }

    ctx.loader(true);
    setTimeout(() => {
      try {
        let res = null;
        if (tool === 'buffer') {
          if (typeof options === 'number') res = turf.buffer(src, options, { units: 'kilometers' });
          else {
            const buffed = src.features.map((f) => {
              const distVal = parseFloat(f.properties[options]);
              if (isNaN(distVal) || distVal <= 0) return null;
              return turf.buffer(f, distVal, { units: 'kilometers' });
            }).filter((f) => f !== null);
            res = turf.featureCollection(buffed);
          }
        } else if (tool === 'union') {
          res = turf.dissolve(src, options);
        } else if (tool === 'simplify') {
          res = turf.simplify(src, { tolerance: options.tolerance, highQuality: !!options.highQuality, mutate: false });
          if (!res || !Array.isArray(res.features) || res.features.length === 0) throw new Error('Simplify sin resultado.');
        } else if (tool === 'repair') {
          const method = String(options.method || 'buffer0');
          const out = src.features.map((f) => {
            try {
              if (!f || !f.geometry) return f;
              if (method === 'cleancoords') return turf.cleanCoords(f);
              const gt = String(f.geometry.type || '');
              if (gt === 'Polygon' || gt === 'MultiPolygon') {
                const fixed = turf.buffer(f, 0, { units: 'meters' });
                if (fixed && fixed.geometry) {
                  fixed.properties = { ...(f.properties || {}) };
                  return fixed;
                }
              }
              return turf.cleanCoords(f);
            } catch (_) {
              return f;
            }
          });
          res = turf.featureCollection(out);
        } else if (tool === 'intersect') {
          const targetGeoJSON = options.targetGeoJSON;
          res = runBinaryPreview('intersect', src, targetGeoJSON, options);
          if (res.features.length === 0) throw new Error('No se encontraron intersecciones.');
        } else if (tool === 'difference') {
          const targetGeoJSON = options.targetGeoJSON;
          res = runBinaryPreview('difference', src, targetGeoJSON, options);
          if (res.features.length === 0) throw new Error('La diferencia resulto en un conjunto vacio.');
        } else if (tool === 'clip') {
          const targetGeoJSON = options.targetGeoJSON;
          res = runBinaryPreview('clip', src, targetGeoJSON, options);
          if (res.features.length === 0) throw new Error('Clip sin resultado.');
        } else if (tool === 'spatialjoin') {
          const targetLayer = options.targetLayer;
          const relation = String(options.relation || 'intersects');
          const prefix = String(options.prefix || 'b_');
          const mode = String(options.mode || 'first');
          const sumField = String(options.sumField || '');
          const onlyHits = !!options.onlyHits;
          const targetFeatures = featuresBySelectionOrAll(targetLayer);
          res = runBinaryPreview('spatialjoin', src, turf.featureCollection(targetFeatures), { relation, prefix, mode, sumField, onlyHits });
        } else if (tool === 'nearestneighbor') {
          const targetGeoJSON = options.targetGeoJSON;
          const nnPrefix = String(options.nnPrefix || 'b_');
          res = runBinaryPreview('nearestneighbor', src, targetGeoJSON, { prefix: nnPrefix });
        }

        if (res) registerDerivedLayer(ctx, l, res, l.name + '_' + tool + suffix);
        else alert('Sin resultado');
      } catch (e) {
        alert('Error durante el geoproceso: ' + e);
      }
      ctx.loader(false);
      if (ctx.scheduleProjectSave) ctx.scheduleProjectSave();
    }, 50);
  }

  async function runGIS(ctx, tool) {
    const activeId = ctx.getActiveId();
    const layers = ctx.getLayers();
    if (!activeId) return alert('Capa activa requerida');
    const l = layers.find((x) => x.id === activeId);
    let src = l.geojson;
    let suffix = '';
    if (l.selectedIds.length > 0) {
      src = { type: 'FeatureCollection', features: l.geojson.features.filter((f) => l.selectedIds.includes(f.properties._uid)) };
      suffix = '_Sel';
    }
    if (!src.features.length) return alert('No hay geometrias para procesar (vacio o seleccion vacia)');

    ctx.loader(true);
    ctx.toggleMenu('menu-gis');
    setTimeout(() => {
      try {
        let res = null;
        if (tool === 'centroid') { res = turf.featureCollection(src.features.map((f) => turf.centroid(f))); suffix += '_Cent'; }
        else if (tool === 'centerofmass') { res = turf.featureCollection(src.features.map((f) => turf.centerOfMass(f))); suffix += '_CM'; }
        else if (tool === 'hull') { res = turf.convex(src); suffix += '_Hull'; }
        else if (tool === 'tin') {
          const pts = []; turf.flatten(src).features.forEach((f) => pts.push(turf.centroid(f)));
          if (pts.length < 3) throw new Error('TIN requiere al menos 3 puntos.');
          res = turf.tin(turf.featureCollection(pts)); suffix += '_Tin';
        } else if (tool === 'kmeans') {
          const pts = []; turf.flatten(src).features.forEach((f) => pts.push(turf.centroid(f)));
          if (pts.length < 5) throw new Error('K-Means requiere al menos 5 puntos.');
          res = turf.clustersKmeans(turf.featureCollection(pts), { numberOfClusters: 5 }); suffix += '_Kmeans';
        } else if (tool === 'voronoi') {
          const pts = []; turf.flatten(src).features.forEach((f) => pts.push(turf.centroid(f)));
          if (pts.length < 1) throw new Error('Voronoi requiere al menos 1 punto.');
          res = turf.voronoi(turf.featureCollection(pts), { bbox: turf.bbox(src) }); suffix += '_Vor';
        }
        if (res) registerDerivedLayer(ctx, l, res, l.name + suffix); else alert('Sin resultado');
      } catch (e) {
        alert('Error: ' + e);
      }
      ctx.loader(false);
      if (ctx.scheduleProjectSave) ctx.scheduleProjectSave();
    }, 50);
  }

  function calcMetrics(ctx, t) {
    const activeId = ctx.getActiveId();
    const layers = ctx.getLayers();
    if (!activeId) return;
    const l = layers.find((x) => x.id === activeId);
    const tg = l.selectedIds.length > 0 ? l.geojson.features.filter((f) => l.selectedIds.includes(f.properties._uid)) : l.geojson.features;
    if (!tg.length) return alert('Nada que medir');
    ctx.loader(true);

    setTimeout(() => {
      let tot = 0;
      tg.forEach((f) => {
        try {
          if (t === 'area') {
            const a = turf.area(f);
            f.properties.AREA_M2 = a.toFixed(2);
            f.properties.AREA_HA = (a / 10000).toFixed(4);
            tot += a;
          } else {
            const n = turf.length(f, { units: 'kilometers' });
            f.properties.LEN_KM = n.toFixed(3);
            tot += n;
          }
        } catch (_) {}
      });
      ctx.renderTable();
      ctx.loader(false);
      alert(`Total: ${t === 'area' ? (tot / 10000).toFixed(4) + ' ha' : tot.toFixed(3) + ' km'}`);
      ctx.toggleMenu('menu-gis');
      if (ctx.scheduleProjectSave) ctx.scheduleProjectSave();
    }, 50);
  }

  async function runAdvanced(ctx, t) {
    const activeId = ctx.getActiveId();
    const layers = ctx.getLayers();
    if (!activeId) return;
    const l = layers.find((x) => x.id === activeId);
    ctx.toggleMenu('menu-edit');

    if (t === 'clean') {
      l.selectedIds = [];
      ctx.refreshLayerFeatures(l);
      ctx.updateSelectionUI();
      if (ctx.scheduleProjectSave) ctx.scheduleProjectSave();
    } else if (t === 'explode') {
      ctx.loader(true);
      setTimeout(() => {
        registerDerivedLayer(ctx, l, turf.flatten(l.geojson), l.name + '_Exp');
        ctx.loader(false);
        if (ctx.scheduleProjectSave) ctx.scheduleProjectSave();
      }, 50);
    } else if (t === 'merge') {
      if (l.selectedIds.length < 2) return alert('Selecciona 2 o mas geometrias para unir.');
      ctx.loader(true);
      setTimeout(() => {
        const s = l.geojson.features.filter((f) => l.selectedIds.includes(f.properties._uid));
        const remaining = l.geojson.features.filter((f) => !l.selectedIds.includes(f.properties._uid));
        let mergedFeature = s[0];
        for (let i = 1; i < s.length; i++) mergedFeature = turf.union(mergedFeature, s[i]);
        mergedFeature.properties = s[0].properties;
        mergedFeature.properties._uid = activeId + '_' + Date.now();
        l.geojson.features = remaining;
        l.geojson.features.push(mergedFeature);
        l.selectedIds = [];
        ctx.refreshLayerFeatures(l);
        ctx.updateSelectionUI();
        ctx.loader(false);
        if (ctx.scheduleProjectSave) ctx.scheduleProjectSave();
      }, 50);
    }
  }

  window.HTMLGISModules.gis = {
    runBinaryPreview,
    openProcessModal,
    closeProcessModal,
    executeProcess,
    runGIS,
    calcMetrics,
    runAdvanced
  };
})();
