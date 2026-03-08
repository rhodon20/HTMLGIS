(function () {
  window.HTMLGISModules = window.HTMLGISModules || {};

  function _getActiveLayer(ctx) {
    const activeId = ctx.getActiveId();
    const layers = ctx.getLayers();
    return layers.find((x) => x.id === activeId) || null;
  }

  function updateSelectionUI(ctx) {
    const l = _getActiveLayer(ctx);
    const b = document.getElementById('selection-badge');
    if (l && l.selectedIds.length > 0) {
      b.style.display = 'block';
      b.innerText = `Sel: ${l.selectedIds.length}`;
    } else {
      b.style.display = 'none';
    }
  }

  function refreshLabels(ctx, l) {
    l.leafletL.eachLayer((layer) => {
      layer.unbindTooltip();
      if (l.labels.active && l.labels.field) {
        const txt = layer.feature.properties[l.labels.field];
        if (txt) layer.bindTooltip(String(txt), { permanent: true, direction: 'center' });
      }
    });
  }

  function setLabelField(ctx, id, field) {
    const l = ctx.getLayers().find((x) => x.id === id);
    if (!l) return;
    l.labels.field = field;
    if (l.labels.active) refreshLabels(ctx, l);
    if (ctx.scheduleProjectSave) ctx.scheduleProjectSave();
  }

  function toggleLabels(ctx, id, active) {
    const l = ctx.getLayers().find((x) => x.id === id);
    if (!l) return;
    l.labels.active = active;
    refreshLabels(ctx, l);
    if (ctx.scheduleProjectSave) ctx.scheduleProjectSave();
  }

  function filterActiveLayer(ctx, text) {
    const l = _getActiveLayer(ctx);
    if (!l) return;
    const term = String(text || '').toLowerCase();
    const filtered = l.geojson.features.filter((f) => {
      if (!term) return true;
      for (const k in f.properties) {
        if (k !== '_uid' && String(f.properties[k]).toLowerCase().includes(term)) return true;
      }
      return false;
    });
    l.leafletL.clearLayers();
    l.leafletL.addData({ type: 'FeatureCollection', features: filtered });
  }

  function toggleSelectMode(ctx) {
    const modes = ctx.getModes();
    modes.select = !modes.select;
    modes.identify = false;
    ctx.setModes(modes);

    document.getElementById('tool-trigger-utils').classList.toggle('active-state', modes.select || modes.moveRotate);
    ctx.getMap().getContainer().style.cursor = modes.select ? 'crosshair' : '';
    ctx.toggleMenu('menu-utils');
  }

  function toggleIdentify(ctx) {
    const modes = ctx.getModes();
    modes.identify = !modes.identify;
    modes.select = false;
    ctx.setModes(modes);

    ctx.toggleMenu('menu-utils');
    alert(modes.identify ? 'Modo Info ON' : 'Modo Info OFF');
  }

  function toggleMoveRotate(ctx) {
    const l = _getActiveLayer(ctx);
    if (!l) return alert('Selecciona la capa a Mover/Rotar');

    const modes = ctx.getModes();
    modes.moveRotate = !modes.moveRotate;
    ctx.setModes(modes);

    l.leafletL.pm.toggleLayerRotation(modes.moveRotate);
    l.leafletL.pm.toggleLayerDrag(modes.moveRotate);
    document.getElementById('tool-trigger-utils').classList.toggle('active-state', modes.select || modes.moveRotate);

    if (!modes.moveRotate) {
      l.leafletL.eachLayer((layer) => {
        if (layer.feature && layer.feature.properties._uid) {
          const uid = layer.feature.properties._uid;
          const original = l.geojson.features.find((feat) => feat.properties._uid === uid);
          if (original) original.geometry = layer.toGeoJSON().geometry;
        }
      });
    }

    ctx.toggleMenu('menu-utils');
    if (ctx.scheduleProjectSave) ctx.scheduleProjectSave();
    alert(modes.moveRotate ? 'Modo Mover/Rotar ON' : 'Modo Mover/Rotar OFF. Geometrías actualizadas.');
  }

  function handleMapClick(ctx, e, layerId, feature, leafletLayer) {
    const modes = ctx.getModes();
    if (modes.identify) {
      L.DomEvent.stopPropagation(e);
      let h = '<b>Info:</b><br>';
      for (const k in feature.properties) {
        if (k !== '_uid') h += `<b>${k}:</b> ${feature.properties[k]}<br>`;
      }
      leafletLayer.bindPopup(h).openPopup();
      return;
    }

    if (modes.select) {
      L.DomEvent.stopPropagation(e);
      if (layerId !== ctx.getActiveId()) return alert('Selecciona en capa activa');
      const l = ctx.getLayers().find((x) => x.id === layerId);
      const uid = feature.properties._uid;
      if (l.selectedIds.includes(uid)) l.selectedIds = l.selectedIds.filter((x) => x !== uid);
      else l.selectedIds.push(uid);

      l.leafletL.eachLayer((ly) => {
        if (ly.feature.properties._uid === uid) {
          const isSel = l.selectedIds.includes(uid);
          let c = l.color;
          if (l.symbology.field && l.symbology.map[ly.feature.properties[l.symbology.field]]) {
            c = l.symbology.map[ly.feature.properties[l.symbology.field]];
          }
          ly.setStyle({ color: isSel ? '#ffc107' : c, fillColor: isSel ? '#ffc107' : c, weight: isSel ? 3 : 2 });
          if (ly instanceof L.CircleMarker) ly.setStyle({ fillColor: isSel ? '#ffc107' : c });
        }
      });

      updateSelectionUI(ctx);
      if (ctx.scheduleProjectSave) ctx.scheduleProjectSave();
    }
  }

  window.HTMLGISModules.editing = {
    updateSelectionUI,
    refreshLabels,
    setLabelField,
    toggleLabels,
    filterActiveLayer,
    toggleSelectMode,
    toggleIdentify,
    toggleMoveRotate,
    handleMapClick
  };
})();
