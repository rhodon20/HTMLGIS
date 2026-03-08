(function () {
  window.HTMLGISModules = window.HTMLGISModules || {};

  function serializeProject(ctx) {
    const map = ctx.getMap();
    const layers = ctx.getLayers();
    const projectCrs = ctx.getProjectCrs ? String(ctx.getProjectCrs() || 'EPSG:4326') : 'EPSG:4326';
    const multiCrsEditing = ctx.isMultiCrsEditingEnabled ? !!ctx.isMultiCrsEditingEnabled() : false;
    const editHistory = ctx.getEditHistory ? ctx.getEditHistory() : [];
    const editUndoStack = ctx.getEditUndoStack ? ctx.getEditUndoStack() : [];
    const editRedoStack = ctx.getEditRedoStack ? ctx.getEditRedoStack() : [];
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      projectCrs,
      multiCrsEditing,
      view: { center: map.getCenter(), zoom: map.getZoom() },
      editHistory: Array.isArray(editHistory) ? editHistory : [],
      editUndoStack: Array.isArray(editUndoStack) ? editUndoStack : [],
      editRedoStack: Array.isArray(editRedoStack) ? editRedoStack : [],
      layers: layers.map((l) => ({
        id: l.id,
        name: l.name,
        geojson: l.geojson,
        color: l.color,
        opacity: l.opacity,
        selectedIds: l.selectedIds || [],
        symbology: l.symbology || { field: null, map: {} },
        labels: l.labels || { field: null, active: false },
        captureTemplate: l.captureTemplate || null,
        group: String(l.group || 'General'),
        crs: String(l.crs || 'EPSG:4326'),
        locked: !!l.locked,
        visible: l.visible !== false
      }))
    };
  }

  function clearAllLayers(ctx) {
    const map = ctx.getMap();
    const layers = ctx.getLayers();
    layers.forEach((l) => {
      try { map.removeLayer(l.leafletL); } catch (_) {}
    });
    ctx.setLayers([]);
    ctx.setActiveId(null);
    ctx.syncState();
    ctx.updateLayerList();
    ctx.renderTable();
  }

  function restoreProject(ctx, project) {
    if (!project || !Array.isArray(project.layers)) throw new Error('Proyecto invalido');
    clearAllLayers(ctx);
    if (ctx.setProjectCrs) ctx.setProjectCrs(String(project.projectCrs || 'EPSG:4326'), { silent: true });
    if (ctx.setMultiCrsEditing) ctx.setMultiCrsEditing(!!project.multiCrsEditing, { silent: true, skipSave: true });
    if (ctx.setEditHistory) ctx.setEditHistory(Array.isArray(project.editHistory) ? project.editHistory : []);
    if (ctx.setEditUndoStack) ctx.setEditUndoStack(Array.isArray(project.editUndoStack) ? project.editUndoStack : []);
    if (ctx.setEditRedoStack) ctx.setEditRedoStack(Array.isArray(project.editRedoStack) ? project.editRedoStack : []);
    project.layers.forEach((l) => {
      ctx.registerLayer(l.geojson, l.name, l);
    });

    if (project.view && project.view.center && typeof project.view.zoom === 'number') {
      ctx.getMap().setView([project.view.center.lat, project.view.center.lng], project.view.zoom);
    }

    const firstId = project.layers[0] ? project.layers[0].id : null;
    ctx.setActive(firstId);
  }

  function saveProjectToStorage(ctx, key) {
    if (!window.SafeStorage) return;
    const payload = JSON.stringify(serializeProject(ctx));
    SafeStorage.save(key, payload);
  }

  function loadProjectFromStorage(ctx, key) {
    if (!window.SafeStorage) return false;
    const raw = SafeStorage.load(key);
    if (!raw) return false;
    try {
      restoreProject(ctx, JSON.parse(raw));
      return true;
    } catch (_) {
      return false;
    }
  }

  function downloadProjectFile(ctx) {
    const payload = JSON.stringify(serializeProject(ctx));
    const a = document.createElement('a');
    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(payload);
    a.download = 'proyecto.htmlgis.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  window.HTMLGISModules.project = {
    serializeProject,
    restoreProject,
    saveProjectToStorage,
    loadProjectFromStorage,
    downloadProjectFile,
    clearAllLayers
  };
})();
