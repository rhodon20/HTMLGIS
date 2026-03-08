(function () {
  window.HTMLGISModules = window.HTMLGISModules || {};

  function renderLayerList(ctx) {
    const list = document.getElementById('layer-list');
    const layers = ctx.getLayers();
    const activeId = ctx.getActiveId();
    document.getElementById('layer-count').innerText = layers.length;
    list.innerHTML = '';

    const grouped = new Map();
    layers.forEach((l) => {
      const g = String((l && l.group) || 'General').trim() || 'General';
      if (!grouped.has(g)) grouped.set(g, []);
      grouped.get(g).push(l);
    });

    grouped.forEach((groupLayers, groupName) => {
      list.innerHTML += `<div class="sec-title" style="margin-top:8px;">Grupo: ${groupName} (${groupLayers.length})</div>`;
      groupLayers.forEach((l) => {
      const active = l.id === activeId ? 'active' : '';
      const props = l.geojson.features.length > 0
        ? Object.keys(l.geojson.features[0].properties).filter((k) => k !== '_uid')
        : [];

      let fieldOpts = '<option value="">Seleccionar campo...</option>';
      props.forEach((p) => { fieldOpts += `<option value="${p}">${p}</option>`; });
      const crs = String(l.crs || 'EPSG:4326').toUpperCase();
      const crsOptions = ['EPSG:4326', 'EPSG:3857', 'EPSG:25830', 'EPSG:23030'];
      let crsOpts = '';
      crsOptions.forEach((c) => { crsOpts += `<option value="${c}" ${c === crs ? 'selected' : ''}>${c}</option>`; });
      if (!crsOptions.includes(crs)) crsOpts += `<option value="${crs}" selected>${crs}</option>`;

      list.innerHTML += `
        <div class="layer-card ${active}">
          <div class="layer-header">
            <div class="layer-name" data-action="layer-set-active" data-layer-id="${l.id}">${l.name}</div>
            <div class="layer-tools">
              <i class="fas fa-arrow-up" data-action="layer-move-up" data-layer-id="${l.id}" title="Subir"></i>
              <i class="fas fa-arrow-down" data-action="layer-move-down" data-layer-id="${l.id}" title="Bajar"></i>
              <i class="fas ${l.locked ? 'fa-lock' : 'fa-lock-open'}" data-action="layer-toggle-lock" data-layer-id="${l.id}" title="Bloquear edición"></i>
              <i class="fas fa-cog" data-action="layer-toggle-settings" data-layer-id="${l.id}" title="Ajustes"></i>
              <input type="color" value="${l.color}" data-action="layer-change-color" data-layer-id="${l.id}" style="width:20px;border:none;background:none;cursor:pointer">
              <i class="fas ${l.visible === false ? 'fa-eye-slash' : 'fa-eye'}" data-action="layer-toggle-vis" data-layer-id="${l.id}"></i>
              <i class="fas fa-trash" style="color:#e74c3c" data-action="layer-delete" data-layer-id="${l.id}"></i>
            </div>
          </div>
          <div class="layer-slider"><input type="range" min="0" max="1" step="0.1" value="${l.opacity}" data-action="layer-change-opacity" data-layer-id="${l.id}"></div>
          <div id="settings-${l.id}" class="layer-settings">
            <div class="setting-row"><label>Categorizar:</label><select data-action="layer-apply-symbology" data-layer-id="${l.id}">${fieldOpts}</select></div>
            <div class="setting-row"><label>Etiquetas:</label><select data-action="layer-set-label-field" data-layer-id="${l.id}">${fieldOpts}</select></div>
            <div class="setting-row"><label>Grupo:</label><input type="text" value="${(l.group || 'General')}" data-action="layer-set-group" data-layer-id="${l.id}"></div>
            <div class="setting-row"><label>CRS:</label><select data-action="layer-set-crs" data-layer-id="${l.id}">${crsOpts}</select></div>
            <div class="setting-row"><button class="btn-mini" data-action="layer-reproject" data-layer-id="${l.id}">Reproyectar (a EPSG:4326)</button></div>
            <div class="setting-row"><button class="btn-mini" data-action="layer-edit-template" data-layer-id="${l.id}">Plantilla captura</button></div>
            <div class="setting-row" style="flex-direction:row;"><label>Activar:</label><input type="checkbox" ${l.labels.active ? 'checked' : ''} data-action="layer-toggle-labels" data-layer-id="${l.id}"></div>
          </div>
        </div>`;
      });
    });
  }

  window.HTMLGISModules.layers = { renderLayerList };
})();
