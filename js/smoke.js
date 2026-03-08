(function () {
  function summarize(checks) {
    let pass = 0;
    let fail = 0;
    checks.forEach((c) => (c.ok ? pass++ : fail++));
    return { pass, fail, checks };
  }

  function logSummary(tag, summary) {
    if (summary.fail > 0) console.warn(`[HTMLGISSmoke] ${tag} FAIL`, summary);
    else console.log(`[HTMLGISSmoke] ${tag} OK`, summary);
    return summary;
  }
  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function runBasic() {
    const checks = [];

    const app = window.HTMLGISApp;
    checks.push({ name: 'app_api', ok: !!app });
    checks.push({ name: 'app_undo_redo_api', ok: !!(app && typeof app.undoEdit === 'function' && typeof app.redoEdit === 'function') });
    checks.push({ name: 'app_update_layer_list_api', ok: !!(app && typeof app.updateLayerList === 'function') });
    checks.push({ name: 'app_project_crs_api', ok: !!(app && typeof app.getProjectCrs === 'function' && typeof app.setProjectCrs === 'function') });
    checks.push({ name: 'app_multi_crs_edit_flag_api', ok: !!(app && typeof app.isMultiCrsEditingEnabled === 'function' && typeof app.setMultiCrsEditing === 'function') });
    checks.push({ name: 'app_cut_replace_api', ok: !!(app && typeof app.applyCutReplacement === 'function') });
    checks.push({ name: 'app_edit_permission_api', ok: !!(app && typeof app.setLayerLocked === 'function' && typeof app.addFieldToActive === 'function' && typeof app.deleteSelectedOnActive === 'function' && typeof app.setActive === 'function') });

    const mapOk = !!(app && app.getMap && app.getMap());
    checks.push({ name: 'map_ready', ok: mapOk });
    let mapCutCapability = false;
    try {
      const map = app && app.getMap ? app.getMap() : null;
      mapCutCapability = !!(map && map.pm && map.pm.Draw && map.pm.Draw.Cut);
    } catch (_) {}
    checks.push({ name: 'map_cut_capability', ok: mapCutCapability });

    const modules = window.HTMLGISModules || {};
    const required = ['project', 'map', 'tools', 'gis', 'editing', 'layers', 'table'];
    const missing = required.filter((k) => !modules[k]);
    checks.push({ name: 'modules_loaded', ok: missing.length === 0, detail: missing.length ? ('faltan: ' + missing.join(', ')) : 'ok' });

    let projectOk = false;
    try {
      if (app && typeof app.serializeProject === 'function') {
        const p = app.serializeProject();
        projectOk = !!(p && p.version && p.view && Array.isArray(p.layers));
      }
    } catch (_) {}
    checks.push({ name: 'project_serialize', ok: projectOk });

    return logSummary('basic', summarize(checks));
  }

  async function runExtended() {
    const basic = await runBasic();
    const checks = [];

    const modules = window.HTMLGISModules || {};
    checks.push({ name: 'module_digitizing', ok: !!modules.digitizing });
    checks.push({ name: 'module_digitizing_prepare', ok: !!(modules.digitizing && typeof modules.digitizing.prepareCreatedLayer === 'function') });
    checks.push({ name: 'module_digitizing_parallel', ok: !!(modules.digitizing && typeof modules.digitizing.setParallel === 'function') });
    checks.push({ name: 'module_digitizing_trim_extend', ok: !!(modules.digitizing && typeof modules.digitizing.adjustSelectedLines === 'function') });
    checks.push({ name: 'module_capture', ok: !!modules.capture });
    checks.push({ name: 'module_capture_clear_qa', ok: !!(modules.capture && typeof modules.capture.clearQA === 'function') });
    checks.push({ name: 'module_table_v2', ok: !!(modules.table && typeof modules.table.applyTableFilter === 'function' && typeof modules.table.clearTableFilter === 'function') });
    checks.push({ name: 'layer_manager_v2_controls', ok: !!document.querySelector('[data-action=\"layer-move-up\"]') && !!document.querySelector('[data-action=\"layer-move-down\"]') && !!document.querySelector('[data-action=\"layer-toggle-lock\"]') });
    checks.push({ name: 'layer_manager_v2_groups', ok: !!document.querySelector('[data-action=\"layer-set-group\"]') });
    checks.push({ name: 'layer_crs_controls', ok: !!document.querySelector('[data-action=\"layer-set-crs\"]') && !!document.querySelector('[data-action=\"layer-reproject\"]') });
    checks.push({ name: 'project_crs_controls', ok: !!document.getElementById('project-crs') && !!document.getElementById('project-crs-badge') });
    checks.push({ name: 'project_multi_crs_controls', ok: !!document.getElementById('project-multi-crs') && !!document.getElementById('project-multi-crs-badge') });
    const crsSelect = document.querySelector('[data-action=\"layer-set-crs\"]');
    const crsValues = crsSelect ? Array.from(crsSelect.options || []).map((o) => String(o.value || '').toUpperCase()) : [];
    checks.push({ name: 'layer_crs_select_options', ok: ['EPSG:4326', 'EPSG:3857', 'EPSG:25830', 'EPSG:23030'].every((v) => crsValues.includes(v)) });

    checks.push({ name: 'digitize_menu', ok: !!document.getElementById('menu-digitize') });
    checks.push({ name: 'selection_area_control', ok: !!document.querySelector('[data-action="select-area"]') });
    checks.push({ name: 'selection_lasso_control', ok: !!document.querySelector('[data-action="select-lasso"]') });
    checks.push({ name: 'selection_tolerance_control', ok: !!document.getElementById('selection-tolerance') });
    checks.push({ name: 'shortcut_config_control', ok: !!document.querySelector('[data-action="configure-shortcuts"]') });
    checks.push({ name: 'shortcut_modal_controls', ok: !!document.getElementById('shortcuts-modal') && !!document.querySelector('[data-action="shortcuts-save"]') && !!document.querySelector('[data-action="shortcuts-reset"]') });
    checks.push({ name: 'capture_modal', ok: !!document.getElementById('capture-modal') });
    checks.push({ name: 'capture_modal_buttons', ok: !!document.getElementById('capture-save-btn') && !!document.getElementById('capture-cancel-btn') });
    checks.push({ name: 'digitize_gap_threshold', ok: !!document.getElementById('digitize-gap-threshold') });
    checks.push({ name: 'digitize_ortho_toggle', ok: !!document.getElementById('digitize-ortho') && !!document.getElementById('digitize-cad-status') });
    checks.push({ name: 'digitize_parallel_toggle', ok: !!document.getElementById('digitize-parallel') });
    checks.push({ name: 'digitize_trim_extend_controls', ok: !!document.getElementById('cad-adjust-m') && !!document.querySelector('[data-action=\"cad-trim\"]') && !!document.querySelector('[data-action=\"cad-extend\"]') });
    checks.push({ name: 'qa_panel', ok: !!document.getElementById('qa-items') && !!document.getElementById('qa-summary') });
    checks.push({ name: 'edit_history_panel', ok: !!document.getElementById('edit-history-items') && !!document.getElementById('edit-history-summary') });
    checks.push({ name: 'edit_undo_controls', ok: !!document.querySelector('[data-action=\"edit-undo\"]') && !!document.querySelector('[data-action=\"edit-redo\"]') && !!document.getElementById('edit-undo-summary') });
    checks.push({ name: 'table_v2_controls', ok: !!document.getElementById('table-filter-field') && !!document.getElementById('table-filter-op') && !!document.getElementById('table-filter-value') });
    checks.push({ name: 'gis_clip_menu_item', ok: !!document.querySelector('[data-action="open-process"][data-tool="clip"]') });
    checks.push({ name: 'gis_spatialjoin_menu_item', ok: !!document.querySelector('[data-action="open-process"][data-tool="spatialjoin"]') });
    checks.push({ name: 'gis_nearest_menu_item', ok: !!document.querySelector('[data-action="open-process"][data-tool="nearestneighbor"]') });
    checks.push({ name: 'gis_simplify_menu_item', ok: !!document.querySelector('[data-action="open-process"][data-tool="simplify"]') });
    checks.push({ name: 'gis_repair_menu_item', ok: !!document.querySelector('[data-action="open-process"][data-tool="repair"]') });

    let clipModalFlowOk = false;
    let clipModalFlowDetail = 'skip_no_binary_layer_pair';
    try {
      const app = window.HTMLGISApp;
      const layersNow = app && typeof app.getLayers === 'function' ? app.getLayers() : [];
      if (Array.isArray(layersNow) && layersNow.length >= 2) {
        const clipBtn = document.querySelector('[data-action="open-process"][data-tool="clip"]');
        const closeBtn = document.querySelector('[data-action="close-process-modal"]');
        if (clipBtn && closeBtn) {
          clipBtn.click();
          const modal = document.getElementById('process-modal');
          const targetSel = document.getElementById('target-layer-id');
          clipModalFlowOk = !!(modal && modal.style.display === 'flex' && targetSel);
          clipModalFlowDetail = `modalOpen=${!!(modal && modal.style.display === 'flex')} targetSel=${!!targetSel}`;
          closeBtn.click();
        } else {
          clipModalFlowDetail = 'missing_clip_ui';
        }
      }
    } catch (err) {
      clipModalFlowDetail = String((err && err.message) || err || 'error');
    }
    checks.push({ name: 'gis_clip_modal_flow', ok: clipModalFlowOk, detail: clipModalFlowDetail });

    let spatialJoinModalFlowOk = false;
    let spatialJoinModalFlowDetail = 'skip_no_binary_layer_pair';
    try {
      const app = window.HTMLGISApp;
      const layersNow = app && typeof app.getLayers === 'function' ? app.getLayers() : [];
      if (Array.isArray(layersNow) && layersNow.length >= 2) {
        const sjBtn = document.querySelector('[data-action="open-process"][data-tool="spatialjoin"]');
        const closeBtn = document.querySelector('[data-action="close-process-modal"]');
        if (sjBtn && closeBtn) {
          sjBtn.click();
          const modal = document.getElementById('process-modal');
          const targetSel = document.getElementById('target-layer-id');
          const rel = document.getElementById('sj-relation');
          const mode = document.getElementById('sj-mode');
          const pref = document.getElementById('sj-prefix');
          const onlyHits = document.getElementById('sj-only-hits');
          const sumWrap = document.getElementById('sj-sum-wrap');
          spatialJoinModalFlowOk = !!(modal && modal.style.display === 'flex' && targetSel && rel && mode && pref && onlyHits && sumWrap);
          spatialJoinModalFlowDetail = `modalOpen=${!!(modal && modal.style.display === 'flex')} targetSel=${!!targetSel} relation=${!!rel} mode=${!!mode} prefix=${!!pref} onlyHits=${!!onlyHits} sumWrap=${!!sumWrap}`;
          closeBtn.click();
        } else {
          spatialJoinModalFlowDetail = 'missing_spatialjoin_ui';
        }
      }
    } catch (err) {
      spatialJoinModalFlowDetail = String((err && err.message) || err || 'error');
    }
    checks.push({ name: 'gis_spatialjoin_modal_flow', ok: spatialJoinModalFlowOk, detail: spatialJoinModalFlowDetail });

    let nearestModalFlowOk = false;
    let nearestModalFlowDetail = 'skip_no_binary_layer_pair';
    try {
      const app = window.HTMLGISApp;
      const layersNow = app && typeof app.getLayers === 'function' ? app.getLayers() : [];
      if (Array.isArray(layersNow) && layersNow.length >= 2) {
        const nnBtn = document.querySelector('[data-action="open-process"][data-tool="nearestneighbor"]');
        const closeBtn = document.querySelector('[data-action="close-process-modal"]');
        if (nnBtn && closeBtn) {
          nnBtn.click();
          const modal = document.getElementById('process-modal');
          const targetSel = document.getElementById('target-layer-id');
          const pref = document.getElementById('nn-prefix');
          nearestModalFlowOk = !!(modal && modal.style.display === 'flex' && targetSel && pref);
          nearestModalFlowDetail = `modalOpen=${!!(modal && modal.style.display === 'flex')} targetSel=${!!targetSel} prefix=${!!pref}`;
          closeBtn.click();
        } else {
          nearestModalFlowDetail = 'missing_nearest_ui';
        }
      }
    } catch (err) {
      nearestModalFlowDetail = String((err && err.message) || err || 'error');
    }
    checks.push({ name: 'gis_nearest_modal_flow', ok: nearestModalFlowOk, detail: nearestModalFlowDetail });

    let simplifyModalFlowOk = false;
    let simplifyModalFlowDetail = 'missing_simplify_ui';
    try {
      const simplifyBtn = document.querySelector('[data-action="open-process"][data-tool="simplify"]');
      const closeBtn = document.querySelector('[data-action="close-process-modal"]');
      if (simplifyBtn && closeBtn) {
        simplifyBtn.click();
        const modal = document.getElementById('process-modal');
        const tol = document.getElementById('simplify-tolerance');
        const hq = document.getElementById('simplify-high-quality');
        simplifyModalFlowOk = !!(modal && modal.style.display === 'flex' && tol && hq);
        simplifyModalFlowDetail = `modalOpen=${!!(modal && modal.style.display === 'flex')} tol=${!!tol} highQuality=${!!hq}`;
        closeBtn.click();
      }
    } catch (err) {
      simplifyModalFlowDetail = String((err && err.message) || err || 'error');
    }
    checks.push({ name: 'gis_simplify_modal_flow', ok: simplifyModalFlowOk, detail: simplifyModalFlowDetail });

    let repairModalFlowOk = false;
    let repairModalFlowDetail = 'missing_repair_ui';
    try {
      const repairBtn = document.querySelector('[data-action="open-process"][data-tool="repair"]');
      const closeBtn = document.querySelector('[data-action="close-process-modal"]');
      if (repairBtn && closeBtn) {
        repairBtn.click();
        const modal = document.getElementById('process-modal');
        const method = document.getElementById('repair-method');
        repairModalFlowOk = !!(modal && modal.style.display === 'flex' && method);
        repairModalFlowDetail = `modalOpen=${!!(modal && modal.style.display === 'flex')} method=${!!method}`;
        closeBtn.click();
      }
    } catch (err) {
      repairModalFlowDetail = String((err && err.message) || err || 'error');
    }
    checks.push({ name: 'gis_repair_modal_flow', ok: repairModalFlowOk, detail: repairModalFlowDetail });

    let gisBinaryPreviewFlowOk = false;
    let gisBinaryPreviewFlowDetail = 'skip_no_compatible_layer_pair';
    try {
      const app = window.HTMLGISApp;
      const mod = (window.HTMLGISModules || {}).gis;
      if (app && mod && typeof mod.runBinaryPreview === 'function' && typeof app.getLayers === 'function') {
        const layersNow = app.getLayers() || [];
        let pair = null;
        for (let i = 0; i < layersNow.length; i++) {
          for (let j = i + 1; j < layersNow.length; j++) {
            const a = layersNow[i];
            const b = layersNow[j];
            if (!a || !b || !a.geojson || !b.geojson) continue;
            if (!Array.isArray(a.geojson.features) || !Array.isArray(b.geojson.features)) continue;
            if (a.geojson.features.length === 0 || b.geojson.features.length === 0) continue;
            const ac = String(a.crs || 'EPSG:4326').toUpperCase();
            const bc = String(b.crs || 'EPSG:4326').toUpperCase();
            if (ac !== bc) continue;
            pair = [a, b];
            break;
          }
          if (pair) break;
        }
        if (pair) {
          const a = pair[0];
          const b = pair[1];
          const clipRes = mod.runBinaryPreview('clip', a.geojson, b.geojson, {});
          const joinRes = mod.runBinaryPreview('spatialjoin', a.geojson, b.geojson, { relation: 'intersects', prefix: 'b_', mode: 'first' });
          const joinCountRes = mod.runBinaryPreview('spatialjoin', a.geojson, b.geojson, { relation: 'intersects', mode: 'count' });
          const joinSumRes = mod.runBinaryPreview('spatialjoin', a.geojson, b.geojson, { relation: 'intersects', mode: 'sum', sumField: 'id' });
          const joinAllRes = mod.runBinaryPreview('spatialjoin', a.geojson, b.geojson, { relation: 'intersects', prefix: 'b_', mode: 'all' });
          const joinOnlyHitsRes = mod.runBinaryPreview('spatialjoin', a.geojson, b.geojson, { relation: 'intersects', prefix: 'b_', mode: 'first', onlyHits: true });
          const nearestRes = mod.runBinaryPreview('nearestneighbor', a.geojson, b.geojson, { prefix: 'b_' });
          const clipOk = !!(clipRes && clipRes.type === 'FeatureCollection' && Array.isArray(clipRes.features));
          const joinOk = !!(joinRes && joinRes.type === 'FeatureCollection' && Array.isArray(joinRes.features) && joinRes.features.length === a.geojson.features.length);
          const joinCountOk = !!(joinCountRes && Array.isArray(joinCountRes.features) && joinCountRes.features.length === a.geojson.features.length && joinCountRes.features.every((f) => f && f.properties && typeof f.properties.join_count !== 'undefined'));
          const joinSumOk = !!(joinSumRes && Array.isArray(joinSumRes.features) && joinSumRes.features.length === a.geojson.features.length && joinSumRes.features.every((f) => f && f.properties && typeof f.properties.join_sum !== 'undefined'));
          const joinAllOk = !!(joinAllRes && Array.isArray(joinAllRes.features) && joinAllRes.features.length >= a.geojson.features.length && joinAllRes.features.every((f) => f && f.properties && typeof f.properties.join_hit !== 'undefined'));
          const joinOnlyHitsOk = !!(joinOnlyHitsRes && Array.isArray(joinOnlyHitsRes.features) && joinOnlyHitsRes.features.every((f) => f && f.properties && Number(f.properties.join_hit) === 1));
          const nearestOk = !!(nearestRes && Array.isArray(nearestRes.features) && nearestRes.features.length === a.geojson.features.length && nearestRes.features.every((f) => f && f.properties && typeof f.properties.nn_hit !== 'undefined' && typeof f.properties.nn_dist_km !== 'undefined'));
          gisBinaryPreviewFlowOk = clipOk && joinOk && joinCountOk && joinSumOk && joinAllOk && joinOnlyHitsOk && nearestOk;
          gisBinaryPreviewFlowDetail = `clipOk=${clipOk} joinOk=${joinOk} joinCountOk=${joinCountOk} joinSumOk=${joinSumOk} joinAllOk=${joinAllOk} joinOnlyHitsOk=${joinOnlyHitsOk} nearestOk=${nearestOk} a=${a.name} b=${b.name}`;
        }
      }
    } catch (err) {
      gisBinaryPreviewFlowDetail = String((err && err.message) || err || 'error');
    }
    checks.push({ name: 'gis_binary_preview_flow', ok: gisBinaryPreviewFlowOk, detail: gisBinaryPreviewFlowDetail });

    let cadToggleBehavior = false;
    try {
      const cbOrtho = document.getElementById('digitize-ortho');
      const cbParallel = document.getElementById('digitize-parallel');
      const status = document.getElementById('digitize-cad-status');
      const mod = modules.digitizing;
      if (cbOrtho && cbParallel && status && mod && typeof mod.setOrthogonal === 'function' && typeof mod.setParallel === 'function') {
        const prevO = !!cbOrtho.checked;
        const prevP = !!cbParallel.checked;
        cbOrtho.checked = true;
        cbParallel.checked = true;
        mod.setOrthogonal();
        mod.setParallel();
        const s1 = (status.innerText || '').toLowerCase();
        cbOrtho.checked = false;
        cbParallel.checked = false;
        mod.setOrthogonal();
        mod.setParallel();
        const s2 = (status.innerText || '').toLowerCase();
        cbOrtho.checked = prevO;
        cbParallel.checked = prevP;
        mod.setOrthogonal();
        mod.setParallel();
        cadToggleBehavior = s1.includes('ortogonal on') && s1.includes('paralelo on') && s2.includes('ortogonal off') && s2.includes('paralelo off');
      }
    } catch (_) {}
    checks.push({ name: 'cad_toggle_behavior', ok: cadToggleBehavior });

    const inlineHandlers = document.querySelectorAll('[onclick],[onchange],[oninput],[onkeyup]').length;
    checks.push({ name: 'no_inline_handlers', ok: inlineHandlers === 0, detail: inlineHandlers });

    const app = window.HTMLGISApp;
    let jsonRoundtrip = false;
    try {
      if (app && typeof app.serializeProject === 'function') {
        const p = app.serializeProject();
        const txt = JSON.stringify(p);
        const parsed = JSON.parse(txt);
        jsonRoundtrip = !!(parsed && parsed.version && typeof parsed.projectCrs === 'string' && typeof parsed.multiCrsEditing === 'boolean' && Array.isArray(parsed.layers) && Array.isArray(parsed.editHistory) && Array.isArray(parsed.editUndoStack) && Array.isArray(parsed.editRedoStack));
      }
    } catch (_) {}
    checks.push({ name: 'project_json_roundtrip', ok: jsonRoundtrip });

    let projectCrsFlowOk = false;
    let projectCrsFlowDetail = 'missing_project_crs_api';
    try {
      if (app && typeof app.getProjectCrs === 'function' && typeof app.setProjectCrs === 'function') {
        const before = String(app.getProjectCrs() || '').toUpperCase() || 'EPSG:4326';
        const changed = app.setProjectCrs('EPSG:3857', { silent: true });
        const after = String(app.getProjectCrs() || '').toUpperCase();
        const restored = app.setProjectCrs(before, { silent: true });
        projectCrsFlowOk = !!changed && after === 'EPSG:3857' && restored === true;
        projectCrsFlowDetail = `before=${before} after=${after}`;
      }
    } catch (err) {
      projectCrsFlowDetail = String((err && err.message) || err || 'error');
    }
    checks.push({ name: 'project_crs_state_flow', ok: projectCrsFlowOk, detail: projectCrsFlowDetail });

    let projectMultiCrsFlowOk = false;
    let projectMultiCrsFlowDetail = 'missing_multi_crs_api';
    try {
      if (app && typeof app.isMultiCrsEditingEnabled === 'function' && typeof app.setMultiCrsEditing === 'function') {
        const before = !!app.isMultiCrsEditingEnabled();
        app.setMultiCrsEditing(!before, { silent: true, skipSave: true });
        const after = !!app.isMultiCrsEditingEnabled();
        app.setMultiCrsEditing(before, { silent: true, skipSave: true });
        projectMultiCrsFlowOk = after !== before;
        projectMultiCrsFlowDetail = `before=${before} after=${after}`;
      }
    } catch (err) {
      projectMultiCrsFlowDetail = String((err && err.message) || err || 'error');
    }
    checks.push({ name: 'project_multi_crs_state_flow', ok: projectMultiCrsFlowOk, detail: projectMultiCrsFlowDetail });

    let editPermissionsFlowOk = false;
    let editPermissionsFlowDetail = 'missing_permission_api';
    try {
      if (app
        && typeof app.getLayers === 'function'
        && typeof app.getActiveId === 'function'
        && typeof app.setActive === 'function'
        && typeof app.setLayerLocked === 'function'
        && typeof app.canEditActiveLayer === 'function'
        && typeof app.addFieldToActive === 'function'
        && typeof app.deleteSelectedOnActive === 'function'
        && typeof app.undoEdit === 'function') {
        const layersNow = app.getLayers() || [];
        const first = Array.isArray(layersNow) && layersNow.length > 0 ? layersNow[0] : null;
        if (first && first.id) {
          const prevActive = app.getActiveId();
          app.setActive(first.id);
          const layerRef = (app.getLayers() || []).find((x) => x && x.id === first.id) || first;
          const prevLocked = !!layerRef.locked;
          const firstUid = layerRef && layerRef.geojson && Array.isArray(layerRef.geojson.features) && layerRef.geojson.features[0] && layerRef.geojson.features[0].properties
            ? layerRef.geojson.features[0].properties._uid
            : null;

          app.setLayerLocked(first.id, true, { skipSave: true, skipUi: true });
          const blocked = app.canEditActiveLayer() === false;
          const addDenied = app.addFieldToActive('__smoke_lock_guard__', { silent: true, skipSave: true }) === false;
          let deleteDenied = true;
          if (firstUid) {
            layerRef.selectedIds = [firstUid];
            deleteDenied = app.deleteSelectedOnActive({ silent: true, skipSave: true, skipConfirm: true }) === false;
            layerRef.selectedIds = [];
          }

          app.setLayerLocked(first.id, prevLocked, { skipSave: true, skipUi: true });
          if (prevActive && prevActive !== first.id) app.setActive(prevActive);

          editPermissionsFlowOk = blocked && addDenied && deleteDenied;
          editPermissionsFlowDetail = `blocked=${blocked} addDenied=${addDenied} deleteDenied=${deleteDenied}`;
        } else {
          editPermissionsFlowDetail = 'skip_no_layers';
        }
      }
    } catch (err) {
      editPermissionsFlowDetail = String((err && err.message) || err || 'error');
    }
    checks.push({ name: 'edit_permissions_flow', ok: editPermissionsFlowOk, detail: editPermissionsFlowDetail });

    let editPermissionsCrsFlowOk = false;
    let editPermissionsCrsFlowDetail = 'missing_crs_permission_api';
    try {
      if (app
        && typeof app.getLayers === 'function'
        && typeof app.getActiveId === 'function'
        && typeof app.setActive === 'function'
        && typeof app.canEditActiveLayer === 'function'
        && typeof app.addFieldToActive === 'function'
        && typeof app.deleteSelectedOnActive === 'function'
        && typeof app.setLayerCrs === 'function'
        && typeof app.setMultiCrsEditing === 'function'
        && typeof app.isMultiCrsEditingEnabled === 'function'
        && typeof app.undoEdit === 'function') {
        const layersNow = app.getLayers() || [];
        const first = Array.isArray(layersNow) && layersNow.length > 0 ? layersNow[0] : null;
        if (first && first.id) {
          const prevActive = app.getActiveId();
          const prevMulti = !!app.isMultiCrsEditingEnabled();
          const prevCrs = String(first.crs || 'EPSG:4326').toUpperCase();
          const firstUid = first && first.geojson && Array.isArray(first.geojson.features) && first.geojson.features[0] && first.geojson.features[0].properties
            ? first.geojson.features[0].properties._uid
            : null;

          app.setActive(first.id);
          app.setLayerCrs(first.id, 'EPSG:3857');
          app.setMultiCrsEditing(false, { silent: true, skipSave: true });
          const blockedByCrs = app.canEditActiveLayer() === false;
          const opBlockedByCrs = app.addFieldToActive('__smoke_crs_guard_off__', { silent: true, skipSave: true }) === false;
          let deleteBlockedByCrs = true;
          if (firstUid) {
            const lyrOff = (app.getLayers() || []).find((x) => x && x.id === first.id) || first;
            lyrOff.selectedIds = [firstUid];
            deleteBlockedByCrs = app.deleteSelectedOnActive({ silent: true, skipSave: true, skipConfirm: true }) === false;
            lyrOff.selectedIds = [];
          }

          app.setMultiCrsEditing(true, { silent: true, skipSave: true });
          const enabledWithMulti = app.canEditActiveLayer() === true;
          const opEnabledWithMulti = app.addFieldToActive('__smoke_crs_guard_on__', { silent: true, skipSave: true }) === true;
          let deleteEnabledWithMulti = false;
          if (firstUid) {
            const lyrOn = (app.getLayers() || []).find((x) => x && x.id === first.id) || first;
            const exists = !!(lyrOn && lyrOn.geojson && Array.isArray(lyrOn.geojson.features) && lyrOn.geojson.features.find((f) => f && f.properties && f.properties._uid === firstUid));
            if (exists) {
              lyrOn.selectedIds = [firstUid];
              deleteEnabledWithMulti = app.deleteSelectedOnActive({ silent: true, skipSave: true, skipConfirm: true }) === true;
              if (deleteEnabledWithMulti) app.undoEdit();
            }
          }
          if (opEnabledWithMulti) {
            const lyr = (app.getLayers() || []).find((x) => x && x.id === first.id);
            if (lyr && lyr.geojson && Array.isArray(lyr.geojson.features)) {
              lyr.geojson.features.forEach((f) => { if (f && f.properties) delete f.properties.__smoke_crs_guard_on__; });
            }
          }

          app.setLayerCrs(first.id, prevCrs);
          app.setMultiCrsEditing(prevMulti, { silent: true, skipSave: true });
          if (prevActive && prevActive !== first.id) app.setActive(prevActive);

          editPermissionsCrsFlowOk = blockedByCrs && opBlockedByCrs && deleteBlockedByCrs && enabledWithMulti && opEnabledWithMulti && deleteEnabledWithMulti;
          editPermissionsCrsFlowDetail = `blockedByCrs=${blockedByCrs} opBlocked=${opBlockedByCrs} delBlocked=${deleteBlockedByCrs} enabledWithMulti=${enabledWithMulti} opEnabled=${opEnabledWithMulti} delEnabled=${deleteEnabledWithMulti}`;
        } else {
          editPermissionsCrsFlowDetail = 'skip_no_layers';
        }
      }
    } catch (err) {
      editPermissionsCrsFlowDetail = String((err && err.message) || err || 'error');
    }
    checks.push({ name: 'edit_permissions_crs_flow', ok: editPermissionsCrsFlowOk, detail: editPermissionsCrsFlowDetail });

    let cutReplaceFlowOk = false;
    let cutReplaceFlowDetail = 'skip_no_suitable_layer';
    try {
      if (app && typeof app.applyCutReplacement === 'function' && typeof app.undoEdit === 'function' && typeof app.redoEdit === 'function') {
        const layersNow = app.getLayers ? app.getLayers() : [];
        const layer = Array.isArray(layersNow)
          ? layersNow.find((l) => l && l.geojson && Array.isArray(l.geojson.features) && l.geojson.features.length > 0)
          : null;
        if (layer) {
          const original = layer.geojson.features.find((f) => f && f.properties && f.properties._uid && f.geometry);
          if (original) {
            const beforeCount = layer.geojson.features.length;
            const beforeMulti = typeof app.isMultiCrsEditingEnabled === 'function' ? !!app.isMultiCrsEditingEnabled() : false;
            const layerCrs = String(layer.crs || 'EPSG:4326').toUpperCase();
            if (!beforeMulti && layerCrs !== 'EPSG:4326' && typeof app.setMultiCrsEditing === 'function') {
              app.setMultiCrsEditing(true, { silent: true, skipSave: true });
            }

            const f1 = { type: 'Feature', properties: {}, geometry: JSON.parse(JSON.stringify(original.geometry)) };
            const f2 = { type: 'Feature', properties: {}, geometry: JSON.parse(JSON.stringify(original.geometry)) };
            const applied = app.applyCutReplacement(layer.id, original.properties._uid, [f1, f2], { silent: true });
            const afterApply = layer.geojson.features.length;
            app.undoEdit();
            const afterUndo = layer.geojson.features.length;
            app.redoEdit();
            const afterRedo = layer.geojson.features.length;
            app.undoEdit(); // restore pre-smoke state

            if (typeof app.setMultiCrsEditing === 'function') {
              app.setMultiCrsEditing(beforeMulti, { silent: true, skipSave: true });
            }

            cutReplaceFlowOk = !!(applied && applied.ok) && afterApply === (beforeCount + 1) && afterUndo === beforeCount && afterRedo === (beforeCount + 1);
            cutReplaceFlowDetail = `before=${beforeCount} apply=${afterApply} undo=${afterUndo} redo=${afterRedo}`;
          }
        }
      }
    } catch (err) {
      cutReplaceFlowDetail = String((err && err.message) || err || 'error');
    }
    checks.push({ name: 'cut_replace_undo_redo_flow', ok: cutReplaceFlowOk, detail: cutReplaceFlowDetail });

    let crsFlowOk = false;
    let crsFlowDetail = 'skip_no_layers';
    try {
      const layers = app && typeof app.getLayers === 'function' ? app.getLayers() : [];
      if (Array.isArray(layers) && layers.length > 0) {
        const activeId = app.getActiveId ? app.getActiveId() : null;
        const layerId = activeId || (layers[0] && layers[0].id);
        const crsInput = document.querySelector(`[data-action="layer-set-crs"][data-layer-id="${layerId}"]`);
        if (crsInput && typeof app.canEditActiveLayer === 'function' && typeof app.setLayerCrs === 'function' && typeof app.reprojectLayerToWgs84 === 'function') {
          const before = String(crsInput.value || '').toUpperCase() || 'EPSG:4326';
          app.setLayerCrs(layerId, 'EPSG:3857');
          await wait(20);
          const blocked = app.canEditActiveLayer() === false;

          app.reprojectLayerToWgs84(layerId, true);
          await wait(20);
          const enabled = app.canEditActiveLayer() === true;
          const current = String(crsInput.value || '').toUpperCase();

          crsFlowOk = blocked && enabled && current === 'EPSG:4326';
          crsFlowDetail = `blocked=${blocked} enabled=${enabled} current=${current}`;

          if (before !== 'EPSG:4326') {
            app.setLayerCrs(layerId, before);
          }
        } else {
          crsFlowDetail = 'missing_crs_api';
        }
      }
    } catch (err) {
      crsFlowDetail = String((err && err.message) || err || 'error');
    }
    checks.push({ name: 'crs_flow_edit_lock_reproject', ok: crsFlowOk, detail: crsFlowDetail });

    const summary = summarize([].concat(basic.checks || [], checks));
    return logSummary('extended', summary);
  }

  async function runGate(mode) {
    const m = String(mode || 'basic').toLowerCase();
    if (m === 'basic') return runBasic();
    if (m === 'stable') return runExtended();
    if (m === 'extended') return runExtended();
    throw new Error(`Modo de gate no soportado: ${mode}`);
  }

  window.HTMLGISSmoke = { runBasic, runExtended, runGate };
})();
