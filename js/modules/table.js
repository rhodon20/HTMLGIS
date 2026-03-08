(function () {
  window.HTMLGISModules = window.HTMLGISModules || {};

  const tableState = {
    byLayer: {}
  };

  function getLayerState(layerId) {
    if (!tableState.byLayer[layerId]) {
      tableState.byLayer[layerId] = {
        sortField: null,
        sortDir: null,
        filter: { field: null, op: 'contains', value: '' }
      };
    }
    return tableState.byLayer[layerId];
  }

  function applyFilter(features, filter) {
    if (!filter || !filter.field || String(filter.value || '').trim() === '') return features;
    const v = String(filter.value).toLowerCase();
    const op = filter.op || 'contains';
    return features.filter((f) => {
      const raw = f && f.properties ? f.properties[filter.field] : null;
      const s = String(raw == null ? '' : raw).toLowerCase();
      if (op === 'contains') return s.includes(v);
      if (op === 'eq') return s === v;
      const n1 = Number(raw);
      const n2 = Number(filter.value);
      if (!Number.isFinite(n1) || !Number.isFinite(n2)) return false;
      if (op === 'gt') return n1 > n2;
      if (op === 'lt') return n1 < n2;
      return false;
    });
  }

  function applySort(features, sortField, sortDir) {
    if (!sortField || !sortDir) return features;
    const dir = sortDir === 'desc' ? -1 : 1;
    return features.slice().sort((a, b) => {
      const av = a && a.properties ? a.properties[sortField] : null;
      const bv = b && b.properties ? b.properties[sortField] : null;
      const an = Number(av);
      const bn = Number(bv);
      if (Number.isFinite(an) && Number.isFinite(bn)) return (an - bn) * dir;
      return String(av == null ? '' : av).localeCompare(String(bv == null ? '' : bv)) * dir;
    });
  }

  function updateFilterControls(layer, state) {
    const fieldSel = document.getElementById('table-filter-field');
    const opSel = document.getElementById('table-filter-op');
    const valInput = document.getElementById('table-filter-value');
    if (!fieldSel || !opSel || !valInput) return;
    const props = layer && layer.geojson && layer.geojson.features && layer.geojson.features[0]
      ? Object.keys(layer.geojson.features[0].properties).filter((k) => k !== '_uid')
      : [];
    const cur = fieldSel.value;
    fieldSel.innerHTML = '<option value="">Campo...</option>' + props.map((p) => `<option value="${p}">${p}</option>`).join('');
    fieldSel.value = (state.filter && state.filter.field && props.includes(state.filter.field)) ? state.filter.field : (cur && props.includes(cur) ? cur : '');
    opSel.value = (state.filter && state.filter.op) ? state.filter.op : 'contains';
    valInput.value = state.filter && state.filter.value != null ? String(state.filter.value) : '';
  }

  function renderTable(ctx) {
    const activeId = ctx.getActiveId();
    const layers = ctx.getLayers();
    const map = ctx.getMap();
    const tbody = document.querySelector('#attr-table tbody');
    const thead = document.querySelector('#attr-table thead');
    tbody.innerHTML = '';
    thead.innerHTML = '';
    if (!activeId) return;

    const layer = layers.find((x) => x.id === activeId);
    if (!layer) return;
    const fs = layer.geojson.features;
    if (!fs.length) return;

    const state = getLayerState(activeId);
    updateFilterControls(layer, state);
    const props = Object.keys(fs[0].properties).filter((k) => k !== '_uid');

    let work = applyFilter(fs, state.filter);
    work = applySort(work, state.sortField, state.sortDir);

    const trh = document.createElement('tr');
    props.forEach((k) => {
      const th = document.createElement('th');
      const suffix = state.sortField === k ? (state.sortDir === 'asc' ? ' ▲' : state.sortDir === 'desc' ? ' ▼' : '') : '';
      th.innerText = `${k}${suffix}`;
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        if (state.sortField !== k) {
          state.sortField = k;
          state.sortDir = 'asc';
        } else if (state.sortDir === 'asc') {
          state.sortDir = 'desc';
        } else {
          state.sortField = null;
          state.sortDir = null;
        }
        renderTable(ctx);
      });
      trh.appendChild(th);
    });
    thead.appendChild(trh);

    const lim = Math.min(work.length, 800);
    for (let i = 0; i < lim; i++) {
      const tr = document.createElement('tr');
      const feature = work[i];
      tr.addEventListener('click', () => {
        const mapLayer = layer.leafletL.getLayers().find((ly) => ly.feature && ly.feature.properties && ly.feature.properties._uid === feature.properties._uid);
        if (mapLayer && typeof mapLayer.getBounds === 'function') map.fitBounds(mapLayer.getBounds(), { maxZoom: 20 });
      });
      props.forEach((k) => {
        const td = document.createElement('td');
        td.contentEditable = true;
        td.innerText = feature.properties[k] == null ? '' : String(feature.properties[k]);
        td.onblur = () => {
          feature.properties[k] = td.innerText;
          if (ctx.scheduleProjectSave) ctx.scheduleProjectSave();
        };
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
  }

  function applyTableFilter(ctx) {
    const activeId = ctx.getActiveId();
    if (!activeId) return;
    const st = getLayerState(activeId);
    const fieldSel = document.getElementById('table-filter-field');
    const opSel = document.getElementById('table-filter-op');
    const valInput = document.getElementById('table-filter-value');
    st.filter = {
      field: fieldSel ? (fieldSel.value || null) : null,
      op: opSel ? (opSel.value || 'contains') : 'contains',
      value: valInput ? (valInput.value || '') : ''
    };
    renderTable(ctx);
  }

  function clearTableFilter(ctx) {
    const activeId = ctx.getActiveId();
    if (!activeId) return;
    const st = getLayerState(activeId);
    st.filter = { field: null, op: 'contains', value: '' };
    renderTable(ctx);
  }

  window.HTMLGISModules.table = {
    renderTable,
    applyTableFilter,
    clearTableFilter
  };
})();

