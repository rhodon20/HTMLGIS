const moduleMap = window.HTMLGISModules && window.HTMLGISModules.map ? window.HTMLGISModules.map : null;
        const mapInit = (moduleMap && typeof moduleMap.initMap === 'function')
            ? moduleMap.initMap({ mapId: 'map', center: [40.416, -3.703], zoom: 6 })
            : {
                map: L.map('map', { preferCanvas: true, maxZoom: 22 }).setView([40.416, -3.703], 6),
                bases: {}
            };
        const map = mapInit.map;
        const bases = mapInit.bases || {};
        if (!moduleMap) {
            L.control.scale({ imperial: false }).addTo(map);
            bases.OpenStreetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 22 });
            bases['Carto Dark'] = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 22 });
            bases['PNOA Sat'] = L.tileLayer.wms('http://www.ign.es/wms-inspire/pnoa-ma?', { layers: 'OI.OrthoimageCoverage', format: 'image/png', transparent: true });
            bases['Esri Sat'] = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');
            bases.OpenStreetMap.addTo(map);
            L.control.layers(bases, null, { position: 'topright' }).addTo(map);
            map.pm.addControls({ position: 'topleft', drawCircle:false, rotateMode:true, cutPolygon:true });
            map.pm.setGlobalOptions({ snappable:true, snapDistance:20 });
        }
        map.on('mousemove', (e) => {
            document.getElementById('coords-display').innerText = `Lat: ${e.latlng.lat.toFixed(5)} | Lon: ${e.latlng.lng.toFixed(5)}`;
            updateSelectionHoverPreview(e.latlng);
        });
        const CRS_DEFAULT = 'EPSG:4326';
        const CRS_SUPPORTED = ['EPSG:4326', 'EPSG:3857', 'EPSG:25830', 'EPSG:23030'];

        function normalizeCrs(code) {
            const c = String(code || '').trim().toUpperCase();
            return c || CRS_DEFAULT;
        }
        function ensureProjDefinitions() {
            if (typeof proj4 !== 'function' || !proj4.defs) return;
            try {
                if (!proj4.defs('EPSG:25830')) proj4.defs('EPSG:25830', '+proj=utm +zone=30 +ellps=GRS80 +units=m +no_defs +type=crs');
            } catch (_) {}
            try {
                if (!proj4.defs('EPSG:23030')) proj4.defs('EPSG:23030', '+proj=utm +zone=30 +ellps=intl +towgs84=-157.89,-17.16,-78.41,2.118,2.697,-1.434,-1.1097046576093785 +units=m +no_defs +type=crs');
            } catch (_) {}
        }
        ensureProjDefinitions();

        const state = window.HTMLGISState || (window.HTMLGISState = {});
        let layers = Array.isArray(state.layers) ? state.layers : [];
        let activeId = state.activeId || null;
        let projectCrs = normalizeCrs(state.projectCrs || CRS_DEFAULT);
        let multiCrsEditing = !!state.multiCrsEditing;
        let modes = state.modes || { select: false, identify: false, moveRotate: false };
        let currentProcess = state.currentProcess || { tool: null, options: {} };
        let editHistory = Array.isArray(state.editHistory) ? state.editHistory : [];
        let editUndoStack = Array.isArray(state.editUndoStack) ? state.editUndoStack : [];
        let editRedoStack = Array.isArray(state.editRedoStack) ? state.editRedoStack : [];
        const PROJECT_STORAGE_KEY = 'htmlgis_project_v1';
        const SHORTCUTS_STORAGE_KEY = 'htmlgis_shortcuts_v1';
        const DEFAULT_SHORTCUTS = {
            toggleSelect: 's',
            clearSelection: 'd',
            splitCut: 'c',
            selectArea: 'a',
            selectLasso: 'q',
            deleteSelected: 'delete'
        };
        let shortcuts = loadShortcuts();
        const selectionUiState = {
            hoverLayerId: null,
            hoverUid: null,
            tolerancePx: 12,
            areaPickPending: null
        };
        let saveTimer = null;

        const loader = (s) => document.getElementById('loader').style.display = s ? 'flex' : 'none';
        function syncState() {
            state.layers = layers;
            state.activeId = activeId;
            state.projectCrs = projectCrs;
            state.multiCrsEditing = multiCrsEditing;
            state.modes = modes;
            state.currentProcess = currentProcess;
            state.editHistory = editHistory;
            state.editUndoStack = editUndoStack;
            state.editRedoStack = editRedoStack;
        }
        function updateProjectCrsUI() {
            const select = document.getElementById('project-crs');
            if (select && String(select.value || '').toUpperCase() !== projectCrs) select.value = projectCrs;
            const badge = document.getElementById('project-crs-badge');
            if (badge) badge.innerText = `Proyecto CRS: ${projectCrs}`;
        }
        function setProjectCrs(crsValue, opts) {
            const crs = normalizeCrs(crsValue);
            if (CRS_SUPPORTED.indexOf(crs) < 0) {
                if (!(opts && opts.silent)) alert('CRS de proyecto no soportado en este MVP');
                return false;
            }
            projectCrs = crs;
            updateProjectCrsUI();
            syncState();
            scheduleProjectSave();
            return true;
        }
        function updateMultiCrsUI() {
            const cb = document.getElementById('project-multi-crs');
            if (cb) cb.checked = !!multiCrsEditing;
            const badge = document.getElementById('project-multi-crs-badge');
            if (badge) badge.innerText = `Multi-CRS: ${multiCrsEditing ? 'ON' : 'OFF'}`;
        }
        function setMultiCrsEditing(active, opts) {
            multiCrsEditing = !!active;
            updateMultiCrsUI();
            syncState();
            if (!(opts && opts.skipSave)) scheduleProjectSave();
            if (!(opts && opts.silent)) {
                alert(multiCrsEditing
                    ? 'Edición multi-CRS activada (experimental).'
                    : 'Edición multi-CRS desactivada (solo EPSG:4326).');
            }
            if (activeId) setActive(activeId);
            return true;
        }
        function scheduleProjectSave() {
            clearTimeout(saveTimer);
            saveTimer = setTimeout(saveProjectToStorage, 250);
        }
        function switchBasemapByTheme(isDarkMode) {
            const target = isDarkMode ? 'Carto Dark' : 'OpenStreetMap';
            const candidate = bases[target];
            if (!candidate) return;
            Object.keys(bases).forEach((k) => {
                const lyr = bases[k];
                if (lyr && map.hasLayer(lyr)) map.removeLayer(lyr);
            });
            candidate.addTo(map);
        }
        function toggleDarkMode() {
            document.body.classList.toggle('dark-mode');
            switchBasemapByTheme(document.body.classList.contains('dark-mode'));
        }

        // NEW: Enhanced Sidebar Toggle
        function toggleSidebar() {
             const sb = document.getElementById('sidebar');
            const body = document.body;
                       // Check current width for mobile behavior
            if (window.innerWidth < 768) {
                sb.classList.toggle('open');
            } else {
                // Desktop behavior: toggle class on body to shift layout
                body.classList.toggle('sidebar-open');
            }
            setTimeout(ensureHudLayout, 0);
        }

        function toggleMenu(id) {
             document.querySelectorAll('.tool-menu').forEach(el=>el.id!==id?el.classList.remove('show'):null);
            document.getElementById(id).classList.toggle('show');
            setTimeout(ensureHudLayout, 0);
        }
        function rectsOverlap(a, b) {
            if (!a || !b) return false;
            return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
        }
        function ensureHudLayout() {
            const panel = document.getElementById('menu-digitize');
            const tools = document.getElementById('floating-tools');
            const badges = document.getElementById('status-badges');
            const table = document.getElementById('table-panel');
            if (!panel || !panel.classList.contains('show')) return;

            const panelRect = panel.getBoundingClientRect();
            const toolsRect = tools ? tools.getBoundingClientRect() : null;
            const badgesRect = badges ? badges.getBoundingClientRect() : null;
            const tableRect = table ? table.getBoundingClientRect() : null;

            const overlapTools = toolsRect ? rectsOverlap(panelRect, toolsRect) : false;
            const overlapBadges = badgesRect ? rectsOverlap(panelRect, badgesRect) : false;
            const overlapTable = tableRect ? rectsOverlap(panelRect, tableRect) : false;

            if (overlapTools || overlapBadges || overlapTable) {
                panel.classList.remove('show');
            }
        }
        function toggleTable() {
             const p=document.getElementById('table-panel'); p.classList.toggle('open');
            document.getElementById('table-icon').className = p.classList.contains('open') ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
            setTimeout(ensureHudLayout, 0);
        }

        function cloneObj(v) {
            return v == null ? v : JSON.parse(JSON.stringify(v));
        }
        function normalizeShortcutKey(value) {
            const k = String(value || '').trim().toLowerCase();
            if (!k) return '';
            if (k === 'supr') return 'delete';
            if (k === 'esc') return 'escape';
            if (k === 'espacio') return ' ';
            return k;
        }
        function loadShortcuts() {
            try {
                const raw = localStorage.getItem(SHORTCUTS_STORAGE_KEY);
                if (!raw) return cloneObj(DEFAULT_SHORTCUTS);
                const parsed = JSON.parse(raw);
                const out = cloneObj(DEFAULT_SHORTCUTS);
                Object.keys(out).forEach((k) => {
                    const v = normalizeShortcutKey(parsed[k]);
                    if (v) out[k] = v;
                });
                return out;
            } catch (_) {
                return cloneObj(DEFAULT_SHORTCUTS);
            }
        }
        function saveShortcuts() {
            try {
                localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(shortcuts));
            } catch (_) {}
        }
        function shortcutFieldDefs() {
            return [
                { id: 'shortcut-select', key: 'toggleSelect', label: 'Seleccionar' },
                { id: 'shortcut-clear', key: 'clearSelection', label: 'Limpiar selección' },
                { id: 'shortcut-cut', key: 'splitCut', label: 'Partir/Cut' },
                { id: 'shortcut-area', key: 'selectArea', label: 'Selección área' },
                { id: 'shortcut-lasso', key: 'selectLasso', label: 'Selección lazo' },
                { id: 'shortcut-delete', key: 'deleteSelected', label: 'Borrar selección' }
            ];
        }
        function openShortcutsEditor() {
            const modal = document.getElementById('shortcuts-modal');
            const conflict = document.getElementById('shortcuts-conflict');
            if (!modal) return;
            const defs = shortcutFieldDefs();
            defs.forEach((d) => {
                const inp = document.getElementById(d.id);
                if (inp) inp.value = shortcuts[d.key] || '';
            });
            if (conflict) conflict.innerText = '';
            modal.style.display = 'flex';
        }
        function closeShortcutsEditor() {
            const modal = document.getElementById('shortcuts-modal');
            if (modal) modal.style.display = 'none';
        }
        function resetShortcutsToDefault() {
            shortcuts = cloneObj(DEFAULT_SHORTCUTS);
            saveShortcuts();
            openShortcutsEditor();
        }
        function saveShortcutsFromEditor() {
            const defs = shortcutFieldDefs();
            const next = {};
            defs.forEach((d) => {
                const inp = document.getElementById(d.id);
                const normalized = normalizeShortcutKey(inp ? inp.value : '');
                next[d.key] = normalized || DEFAULT_SHORTCUTS[d.key];
            });
            const seen = {};
            const duplicates = [];
            defs.forEach((d) => {
                const val = next[d.key];
                if (!val) return;
                if (seen[val]) duplicates.push(`${seen[val]} / ${d.label}`);
                else seen[val] = d.label;
            });
            const conflict = document.getElementById('shortcuts-conflict');
            if (duplicates.length > 0) {
                if (conflict) conflict.innerText = `Conflicto de atajos: ${duplicates.join(', ')}`;
                return;
            }
            shortcuts = next;
            saveShortcuts();
            if (conflict) conflict.innerText = '';
            closeShortcutsEditor();
        }

        function findLayerById(id) {
            return layers.find((l) => l.id === id);
        }
        function ensureLayerEditable(layerObj, actionLabel, opts) {
            if (!layerObj) return false;
            if (isLayerEditable(layerObj)) return true;
            const label = actionLabel ? String(actionLabel) : 'Operacion';
            if (!(opts && opts.silent)) {
                alert(`${label} no permitido: la capa esta bloqueada o su CRS no es editable con la configuracion actual.`);
            }
            return false;
        }
        function isLayerEditable(layerObj) {
            if (!layerObj) return false;
            const layerCrs = normalizeCrs(layerObj.crs);
            return !layerObj.locked && (layerCrs === CRS_DEFAULT || multiCrsEditing);
        }

        function findFeatureByUid(layerObj, uid) {
            if (!layerObj || !layerObj.geojson || !Array.isArray(layerObj.geojson.features)) return null;
            return layerObj.geojson.features.find((f) => f && f.properties && f.properties._uid === uid) || null;
        }
        function layerSnapshot(layerObj) {
            if (!layerObj) return null;
            return {
                id: layerObj.id,
                name: layerObj.name,
                geojson: cloneObj(layerObj.geojson),
                color: layerObj.color,
                opacity: layerObj.opacity,
                selectedIds: cloneObj(layerObj.selectedIds || []),
                symbology: cloneObj(layerObj.symbology || { field: null, map: {} }),
                labels: cloneObj(layerObj.labels || { field: null, active: false }),
                captureTemplate: cloneObj(layerObj.captureTemplate || null),
                group: String(layerObj.group || 'General'),
                crs: normalizeCrs(layerObj.crs),
                locked: !!layerObj.locked,
                visible: layerObj.visible !== false
            };
        }
        function geometryVertexCount(geometry) {
            if (!geometry || !geometry.type) return 0;
            const t = geometry.type;
            const c = geometry.coordinates;
            if (t === 'Point') return 1;
            if (t === 'MultiPoint' && Array.isArray(c)) return c.length;
            if (t === 'LineString' && Array.isArray(c)) return c.length;
            if (t === 'MultiLineString' && Array.isArray(c)) return c.reduce((acc, line) => acc + (Array.isArray(line) ? line.length : 0), 0);
            if (t === 'Polygon' && Array.isArray(c)) return c.reduce((acc, ring) => acc + (Array.isArray(ring) ? ring.length : 0), 0);
            if (t === 'MultiPolygon' && Array.isArray(c)) return c.reduce((acc, poly) => acc + (Array.isArray(poly) ? poly.reduce((a, ring) => a + (Array.isArray(ring) ? ring.length : 0), 0) : 0), 0);
            return 0;
        }
        function buildGeometryDiff(beforeGeometry, afterGeometry) {
            const vb = geometryVertexCount(beforeGeometry);
            const va = geometryVertexCount(afterGeometry);
            const tb = beforeGeometry && beforeGeometry.type ? beforeGeometry.type : '-';
            const ta = afterGeometry && afterGeometry.type ? afterGeometry.type : '-';
            return { beforeType: tb, afterType: ta, beforeVertices: vb, afterVertices: va };
        }
        function historyDetailText(detail) {
            if (!detail) return '';
            if (typeof detail === 'string') return detail;
            if (typeof detail === 'object') {
                const kind = detail.kind ? String(detail.kind) : 'detalle';
                if (detail.diff && typeof detail.diff === 'object') {
                    const d = detail.diff;
                    return `${kind} (${d.beforeType}:${d.beforeVertices} -> ${d.afterType}:${d.afterVertices})`;
                }
                try { return `${kind}: ${JSON.stringify(detail)}`; } catch (_) { return kind; }
            }
            return String(detail);
        }
        function focusHistoryEvent(index) {
            const i = Number(index);
            if (!Number.isInteger(i) || i < 0 || i >= editHistory.length) return;
            const ev = editHistory[i];
            if (!ev || !ev.layerId) return;
            const layerObj = findLayerById(ev.layerId);
            if (!layerObj) return;
            setActive(layerObj.id);
            if (!ev.featureUid) return;
            const f = findFeatureByUid(layerObj, ev.featureUid);
            if (!f) return;
            layerObj.selectedIds = [ev.featureUid];
            refreshLayerFeatures(layerObj);
            updateSelectionUI();
            try {
                const b = turf.bbox(f);
                if (b && b.length === 4) {
                    const sw = [b[1], b[0]];
                    const ne = [b[3], b[2]];
                    if (Math.abs(b[0] - b[2]) < 1e-9 && Math.abs(b[1] - b[3]) < 1e-9) map.setView(sw, Math.max(map.getZoom(), 18));
                    else map.fitBounds([sw, ne], { maxZoom: 20 });
                }
            } catch (_) {}
        }

        function renderUndoRedoState() {
            const el = document.getElementById('edit-undo-summary');
            if (!el) return;
            el.innerText = `Undo: ${editUndoStack.length} | Redo: ${editRedoStack.length}`;
        }

        function pushUndoOp(op) {
            if (!op) return;
            editUndoStack.unshift(op);
            if (editUndoStack.length > 300) editUndoStack.length = 300;
            editRedoStack = [];
            syncState();
            renderUndoRedoState();
            scheduleProjectSave();
        }

        function applyUndoRedoOp(op, direction) {
            const dir = direction === 'undo' ? 'undo' : 'redo';
            if (!op || !op.type) return false;

            if (op.type === 'layer_create') {
                const snap = op.layerSnapshot;
                if (!snap || !snap.id || !snap.geojson) return false;
                if (dir === 'undo') {
                    const l = findLayerById(snap.id);
                    if (!l) return false;
                    map.removeLayer(l.leafletL);
                    layers = layers.filter((x) => x.id !== snap.id);
                    if (activeId === snap.id) activeId = layers[0] ? layers[0].id : null;
                    updateLayerList();
                    renderTable();
                    updateSelectionUI();
                    syncState();
                    return true;
                }
                if (findLayerById(snap.id)) return false;
                registerLayer(cloneObj(snap.geojson), snap.name, snap);
                return true;
            }

            if (op.type === 'layer_delete') {
                const snap = op.layerSnapshot;
                if (!snap || !snap.id || !snap.geojson) return false;
                if (dir === 'undo') {
                    if (findLayerById(snap.id)) return false;
                    const beforeActive = activeId;
                    registerLayer(cloneObj(snap.geojson), snap.name, snap);
                    const restored = layers.find((x) => x.id === snap.id);
                    if (!restored) return false;
                    const curIdx = layers.findIndex((x) => x.id === snap.id);
                    const targetIdx = Number.isInteger(op.layerIndex) ? Math.max(0, Math.min(op.layerIndex, layers.length - 1)) : curIdx;
                    if (curIdx >= 0 && targetIdx >= 0 && curIdx !== targetIdx) {
                        layers.splice(curIdx, 1);
                        layers.splice(targetIdx, 0, restored);
                        updateLayerList();
                    }
                    if (op.prevActiveId) setActive(op.prevActiveId);
                    else if (beforeActive) setActive(beforeActive);
                    return true;
                }
                const l = findLayerById(snap.id);
                if (!l) return false;
                map.removeLayer(l.leafletL);
                layers = layers.filter((x) => x.id !== snap.id);
                if (activeId === snap.id) activeId = layers[0] ? layers[0].id : null;
                updateLayerList();
                renderTable();
                updateSelectionUI();
                syncState();
                return true;
            }

            const layerObj = findLayerById(op.layerId);
            if (!layerObj) return false;

            if (op.type === 'feature_create') {
                if (!op.feature || !op.feature.properties || !op.feature.properties._uid) return false;
                const uid = op.feature.properties._uid;
                if (dir === 'undo') {
                    const beforeLen = layerObj.geojson.features.length;
                    layerObj.geojson.features = layerObj.geojson.features.filter((f) => !(f && f.properties && f.properties._uid === uid));
                    layerObj.selectedIds = (layerObj.selectedIds || []).filter((x) => x !== uid);
                    return layerObj.geojson.features.length !== beforeLen;
                }
                if (!findFeatureByUid(layerObj, uid)) {
                    layerObj.geojson.features.push(cloneObj(op.feature));
                    return true;
                }
                return false;
            }

            if (op.type === 'feature_delete_batch') {
                const features = Array.isArray(op.features) ? op.features : [];
                if (features.length === 0) return false;
                if (dir === 'undo') {
                    let changed = false;
                    features.forEach((f) => {
                        const uid = f && f.properties ? f.properties._uid : null;
                        if (!uid) return;
                        if (!findFeatureByUid(layerObj, uid)) {
                            layerObj.geojson.features.push(cloneObj(f));
                            changed = true;
                        }
                    });
                    return changed;
                }
                const ids = new Set(features.map((f) => f && f.properties ? f.properties._uid : null).filter(Boolean));
                const beforeLen = layerObj.geojson.features.length;
                layerObj.geojson.features = layerObj.geojson.features.filter((f) => !(f && f.properties && ids.has(f.properties._uid)));
                layerObj.selectedIds = (layerObj.selectedIds || []).filter((uid) => !ids.has(uid));
                return layerObj.geojson.features.length !== beforeLen;
            }

            if (op.type === 'geometry_update') {
                const uid = op.featureUid;
                const target = findFeatureByUid(layerObj, uid);
                if (!target) return false;
                const geom = dir === 'undo' ? op.beforeGeometry : op.afterGeometry;
                if (!geom) return false;
                target.geometry = cloneObj(geom);
                return true;
            }

            if (op.type === 'feature_replace_batch') {
                const removeIds = new Set((op.removeIds || []).filter(Boolean));
                const addFeatures = Array.isArray(op.addFeatures) ? op.addFeatures : [];
                const undoRemoveIds = new Set((op.undoRemoveIds || []).filter(Boolean));
                const undoAddFeatures = Array.isArray(op.undoAddFeatures) ? op.undoAddFeatures : [];
                const rem = dir === 'undo' ? undoRemoveIds : removeIds;
                const add = dir === 'undo' ? undoAddFeatures : addFeatures;

                const beforeLen = layerObj.geojson.features.length;
                if (rem.size > 0) {
                    layerObj.geojson.features = layerObj.geojson.features.filter((f) => !(f && f.properties && rem.has(f.properties._uid)));
                }
                add.forEach((f) => {
                    const uid = f && f.properties ? f.properties._uid : null;
                    if (!uid) return;
                    if (!findFeatureByUid(layerObj, uid)) layerObj.geojson.features.push(cloneObj(f));
                });
                layerObj.selectedIds = dir === 'undo'
                    ? cloneObj(op.undoSelectedIds || [])
                    : cloneObj(op.nextSelectedIds || []);
                return layerObj.geojson.features.length !== beforeLen || (layerObj.selectedIds || []).length > 0;
            }

            return false;
        }

        function undoEdit() {
            if (editUndoStack.length === 0) return alert('Nada que deshacer');
            const op = editUndoStack.shift();
            const changed = applyUndoRedoOp(op, 'undo');
            if (!changed) return alert('No se pudo deshacer la operación');
            editRedoStack.unshift(op);
            const layerObj = findLayerById(op.layerId);
            if (layerObj) refreshLayerFeatures(layerObj);
            renderUndoRedoState();
            addEditHistory('undo', layerObj, null, op.type);
        }

        function redoEdit() {
            if (editRedoStack.length === 0) return alert('Nada que rehacer');
            const op = editRedoStack.shift();
            const changed = applyUndoRedoOp(op, 'redo');
            if (!changed) return alert('No se pudo rehacer la operación');
            editUndoStack.unshift(op);
            const layerObj = findLayerById(op.layerId);
            if (layerObj) refreshLayerFeatures(layerObj);
            renderUndoRedoState();
            addEditHistory('redo', layerObj, null, op.type);
        }

        function renderEditHistory() {
            const list = document.getElementById('edit-history-items');
            const summary = document.getElementById('edit-history-summary');
            if (!list || !summary) return;
            if (!Array.isArray(editHistory) || editHistory.length === 0) {
                summary.innerText = 'Historial: 0 eventos';
                list.innerHTML = '<div class="qa-item">Sin eventos.</div>';
                return;
            }
            summary.innerText = `Historial: ${editHistory.length} eventos`;
            list.innerHTML = editHistory
                .slice(0, 15)
                .map((e, idx) => {
                    const base = `[${e.action}] ${e.layerName} · ${e.featureUid || '-'} · ${e.geomType || '-'} · ${new Date(e.at).toLocaleTimeString()}`;
                    const go = e.featureUid ? ` <button class="btn-mini" data-action="edit-history-focus" data-history-index="${idx}">Ir</button>` : '';
                    const det = historyDetailText(e.detail);
                    return `<div class="qa-item">${base}${go}${det ? `<br><span>${det}</span>` : ''}</div>`;
                })
                .join('');
            setTimeout(ensureHudLayout, 0);
        }

        function addEditHistory(action, layerObj, feature, detail) {
            const item = {
                at: new Date().toISOString(),
                action: String(action || 'event'),
                layerId: layerObj && layerObj.id ? layerObj.id : null,
                layerName: layerObj && layerObj.name ? layerObj.name : 'Sin capa',
                featureUid: feature && feature.properties ? feature.properties._uid : null,
                geomType: feature && feature.geometry ? feature.geometry.type : null,
                detail: detail || null
            };
            editHistory.unshift(item);
            if (editHistory.length > 200) editHistory.length = 200;
            syncState();
            renderEditHistory();
            scheduleProjectSave();
        }

        function clearEditHistory() {
            editHistory = [];
            syncState();
            renderEditHistory();
            scheduleProjectSave();
        }

        function recordGeometryBatch(layerObj, changes, detail) {
            if (!layerObj || !Array.isArray(changes) || changes.length === 0) return;
            changes.forEach((c) => {
                if (!c || !c.uid || !c.beforeGeometry || !c.afterGeometry) return;
                pushUndoOp({
                    type: 'geometry_update',
                    layerId: layerObj.id,
                    featureUid: c.uid,
                    beforeGeometry: cloneObj(c.beforeGeometry),
                    afterGeometry: cloneObj(c.afterGeometry),
                    detail: detail || 'geometry-batch'
                });
            });
        }

        function recordGeometryUpdate(layerObj, featureUid, beforeGeometry, afterGeometry, detail) {
            if (!layerObj || !featureUid || !beforeGeometry || !afterGeometry) return false;
            const before = JSON.stringify(beforeGeometry);
            const after = JSON.stringify(afterGeometry);
            if (before === after) return false;
            pushUndoOp({
                type: 'geometry_update',
                layerId: layerObj.id,
                featureUid,
                beforeGeometry: cloneObj(beforeGeometry),
                afterGeometry: cloneObj(afterGeometry),
                detail: detail || 'geometry-update'
            });
            const feature = findFeatureByUid(layerObj, featureUid);
            addEditHistory('update', layerObj, feature, { kind: detail || 'geometry-update', diff: buildGeometryDiff(beforeGeometry, afterGeometry) });
            return true;
        }

        const moduleProject = window.HTMLGISModules && window.HTMLGISModules.project ? window.HTMLGISModules.project : null;
        const moduleGIS = window.HTMLGISModules && window.HTMLGISModules.gis ? window.HTMLGISModules.gis : null;
        const moduleEditing = window.HTMLGISModules && window.HTMLGISModules.editing ? window.HTMLGISModules.editing : null;
        const moduleDigitizing = window.HTMLGISModules && window.HTMLGISModules.digitizing ? window.HTMLGISModules.digitizing : null;
        const moduleCapture = window.HTMLGISModules && window.HTMLGISModules.capture ? window.HTMLGISModules.capture : null;
        const moduleLayers = window.HTMLGISModules && window.HTMLGISModules.layers ? window.HTMLGISModules.layers : null;
        const moduleTools = window.HTMLGISModules && window.HTMLGISModules.tools ? window.HTMLGISModules.tools : null;
        const moduleTable = window.HTMLGISModules && window.HTMLGISModules.table ? window.HTMLGISModules.table : null;
        function moduleCtx() {
            return {
                getMap: () => map,
                getLayers: () => layers,
                getLayerById: (id) => findLayerById(id),
                getProjectCrs: () => projectCrs,
                isMultiCrsEditingEnabled: () => multiCrsEditing,
                setMultiCrsEditing: (active, opts) => setMultiCrsEditing(active, opts),
                applyCutReplacement: (layerId, originalUid, cutFeatures, opts) => {
                    const layerObj = findLayerById(layerId);
                    return applyCutReplacementOnLayer(layerObj, originalUid, cutFeatures, opts);
                },
                setLayers: (next) => { layers = Array.isArray(next) ? next : []; },
                getActiveId: () => activeId,
                canEditLayer: (layerObj) => isLayerEditable(layerObj),
                canEditActiveLayer: () => isLayerEditable(findLayerById(activeId)),
                setActiveId: (id) => { activeId = id || null; },
                setLayerLocked: (id, lockedValue, opts) => setLayerLocked(id, lockedValue, opts),
                addFieldToActive: (name, opts) => addFieldToActive(name, opts),
                deleteSelectedOnActive: (opts) => deleteSelectedOnActive(opts),
                setProjectCrs: (crsValue, opts) => setProjectCrs(crsValue, opts),
                getCurrentProcess: () => currentProcess,
                setCurrentProcess: (cp) => { currentProcess = cp || { tool: null, options: {} }; },
                getModes: () => modes,
                setModes: (m) => { modes = m || modes; },
                getEditHistory: () => editHistory,
                setEditHistory: (h) => { editHistory = Array.isArray(h) ? h : []; renderEditHistory(); },
                getEditUndoStack: () => editUndoStack,
                setEditUndoStack: (s) => { editUndoStack = Array.isArray(s) ? s : []; renderUndoRedoState(); },
                getEditRedoStack: () => editRedoStack,
                setEditRedoStack: (s) => { editRedoStack = Array.isArray(s) ? s : []; renderUndoRedoState(); },
                addEditHistory,
                clearEditHistory,
                renderEditHistory,
                pushUndoOp,
                recordGeometryBatch,
                recordGeometryUpdate,
                undoEdit,
                redoEdit,
                setActive,
                registerLayer,
                updateLayerList,
                renderTable,
                syncState,
                toggleMenu,
                loader,
                updateSelectionUI,
                refreshLayerFeatures,
                scheduleProjectSave
            };
        }
        function serializeProject() {
            if (moduleProject && typeof moduleProject.serializeProject === 'function') {
                return moduleProject.serializeProject(moduleCtx());
            }
            return { version: 1, savedAt: new Date().toISOString(), view: { center: map.getCenter(), zoom: map.getZoom() }, layers: [] };
        }
        function clearAllLayers() {
            if (moduleProject && typeof moduleProject.clearAllLayers === 'function') {
                return moduleProject.clearAllLayers(moduleCtx());
            }
            layers = [];
            activeId = null;
            syncState();
            updateLayerList();
            renderTable();
        }
        function restoreProject(project) {
            if (moduleProject && typeof moduleProject.restoreProject === 'function') {
                return moduleProject.restoreProject(moduleCtx(), project);
            }
            return null;
        }
        function saveProjectToStorage() {
            if (moduleProject && typeof moduleProject.saveProjectToStorage === 'function') {
                return moduleProject.saveProjectToStorage(moduleCtx(), PROJECT_STORAGE_KEY);
            }
        }
        function loadProjectFromStorage() {
            if (moduleProject && typeof moduleProject.loadProjectFromStorage === 'function') {
                return moduleProject.loadProjectFromStorage(moduleCtx(), PROJECT_STORAGE_KEY);
            }
            return false;
        }
        function downloadProjectFile() {
            if (moduleProject && typeof moduleProject.downloadProjectFile === 'function') {
                return moduleProject.downloadProjectFile(moduleCtx());
            }
        }
        function safeEvalFormula(expression) {
            if (moduleTools && typeof moduleTools.safeEvalFormula === 'function') {
                return moduleTools.safeEvalFormula(expression);
            }
            const unsafe = /\b(?:window|document|globalThis|self|Function|eval)\b/i;
            if (unsafe.test(expression)) throw new Error('Formula bloqueada por seguridad');
            return Function('"use strict"; return (' + expression + ');')();
        }

        // MODIFIED: Integration with Geoman drawing
        map.on('pm:create', (e) => {
            if (selectionUiState.areaPickPending && e) {
                const mode = selectionUiState.areaPickPending;
                const shape = String(e.shape || '').toLowerCase();
                const isRectangle = mode === 'rectangle' && shape === 'rectangle';
                const isPolygon = mode === 'polygon' && shape === 'polygon';
                if (!isRectangle && !isPolygon) return;
                try { map.removeLayer(e.layer); } catch (_) {}
                if (isRectangle) map.pm.disableDraw('Rectangle');
                if (isPolygon) map.pm.disableDraw('Polygon');
                selectionUiState.areaPickPending = null;
                map.getContainer().style.cursor = modes.select ? 'crosshair' : '';
                if (isRectangle) {
                    const bounds = e.layer && typeof e.layer.getBounds === 'function' ? e.layer.getBounds() : null;
                    if (!bounds) return;
                    applySelectionByBounds(bounds, { append: false });
                    return;
                }
                applySelectionByPolygon(e.layer, { append: false });
                return;
            }
            const activeLayer = layers.find(x => x.id === activeId);
            if (!activeLayer) return;
            if (activeLayer.locked) {
                try { map.removeLayer(e.layer); } catch (_) {}
                map.pm.disableDraw(e.shape);
                return alert('La capa activa está bloqueada para edición');
            }
            if (normalizeCrs(activeLayer.crs) !== CRS_DEFAULT && !multiCrsEditing) {
                try { map.removeLayer(e.layer); } catch (_) {}
                map.pm.disableDraw(e.shape);
                return alert('Edicion deshabilitada para capas con CRS distinto a EPSG:4326. Reproyecta la capa para editar.');
            }
            if (moduleDigitizing && typeof moduleDigitizing.prepareCreatedLayer === 'function') {
                moduleDigitizing.prepareCreatedLayer(moduleCtx(), e.layer);
            }

            const newFeature = e.layer.toGeoJSON();
            if (newFeature && newFeature.geometry) {
                newFeature.geometry = mapGeometryToLayerGeometry(newFeature.geometry, activeLayer);
            }
            // 1. Unify feature properties
            if (!newFeature.properties) newFeature.properties = {};
            // 2. Assign unique ID
            newFeature.properties._uid = activeId + '_' + Date.now() + Math.floor(Math.random() * 1000);
            
            // 3. Set default properties based on the first feature of the layer
            const existingProps = activeLayer.geojson.features.length > 0 ? Object.keys(activeLayer.geojson.features[0].properties) : [];
            existingProps.filter(k => k !== '_uid').forEach(k => {
                if (newFeature.properties[k] === undefined) newFeature.properties[k] = null;
            });

            const finalizeCreate = () => {
                activeLayer.geojson.features.push(newFeature);
                pushUndoOp({ type: 'feature_create', layerId: activeLayer.id, feature: cloneObj(newFeature), detail: 'pm:create' });
                addEditHistory('create', activeLayer, newFeature, 'pm:create');
                refreshLayerFeatures(activeLayer);
                map.pm.disableDraw(e.shape);
            };
            const cancelCreate = () => {
                try { map.removeLayer(e.layer); } catch (_) {}
                map.pm.disableDraw(e.shape);
            };

            if (moduleCapture && typeof moduleCapture.openFeatureForm === 'function') {
                return moduleCapture.openFeatureForm(moduleCtx(), activeLayer, newFeature, finalizeCreate, cancelCreate);
            }
            finalizeCreate();
        });
        map.on('pm:cut', (e) => {
            const originalUid = e && e.originalLayer && e.originalLayer.feature && e.originalLayer.feature.properties
                ? e.originalLayer.feature.properties._uid
                : null;
            if (!originalUid) return;

            const ownerLayer = layers.find((ly) => findFeatureByUid(ly, originalUid));
            if (!ownerLayer) return;

            const cutFeatures = extractFeaturesFromLayerObject(e.layer);
            applyCutReplacementOnLayer(ownerLayer, originalUid, cutFeatures);
        });
        
        // NEW: Helper function to refresh leaflet layer data
        function refreshLayerFeatures(layerObj) {
            map.removeLayer(layerObj.leafletL);
            const newLeafletL = layerObj.createLayerFn(layerObj.geojson);
            if (layerObj.visible !== false) newLeafletL.addTo(map);
            layerObj.leafletL = newLeafletL;
            syncLayerOrder();
            renderTable(); // Refresh table to show new features
            scheduleProjectSave();
        }

        function syncLayerOrder() {
            layers.forEach((ly) => {
                if (ly.visible !== false && ly.leafletL && typeof ly.leafletL.bringToFront === 'function') ly.leafletL.bringToFront();
            });
        }
        function reprojectGeoJSONForDisplay(data, srcCrs) {
            const src = normalizeCrs(srcCrs);
            if (src === CRS_DEFAULT || typeof proj4 !== 'function' || !data || !Array.isArray(data.features)) return data;
            const out = cloneObj(data);
            out.features.forEach((f) => {
                if (!f || !f.geometry || !f.geometry.coordinates) return;
                f.geometry.coordinates = transformCoordsArray(f.geometry.coordinates, src, CRS_DEFAULT);
            });
            return out;
        }


        function registerLayer(geojson, name, opts = null) {
            const id = opts && opts.id ? opts.id : ('L' + Date.now() + Math.floor(Math.random()*1000));
            const color = (opts && opts.color) ? opts.color : ('#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0'));
            const layerCrs = normalizeCrs(opts && opts.crs ? opts.crs : CRS_DEFAULT);
            let i=0; geojson.features.forEach(f=>{ if(!f.properties)f.properties={}; if(!f.properties._uid) f.properties._uid=id+'_'+(i++); });

            const createLeafletLayer = (data) => {
                const layerObj = layers.find((x) => x.id === id);
                const sourceCrs = layerObj ? normalizeCrs(layerObj.crs) : layerCrs;
                const renderData = reprojectGeoJSONForDisplay(data, sourceCrs);
                return L.geoJSON(renderData, {
                    style: (f) => {
                        const l = layers.find(x => x.id === id);
                        return buildFeatureStyle(l, f);
                    },
                    pointToLayer: (f, latlng) => {
                        const l = layers.find(x => x.id === id);
                        const st = buildFeatureStyle(l, f);
                        return L.circleMarker(latlng, {
                            radius: 6,
                            fillColor: st.fillColor,
                            color: st.color,
                            weight: st.weight || 1,
                            dashArray: st.dashArray || null,
                            fillOpacity: l ? Math.max(0.3, l.opacity) : 0.8
                        });
                    },
                    onEachFeature: (f, l) => {
                        l.on('click', e => handleMapClick(e, id, f, l));
                        let fineBeforeGeometry = null;
                        const resolveLayerObj = () => layers.find((x) => x.id === id);
                        const resolveOriginal = () => {
                            const layerObj = resolveLayerObj();
                            if (!layerObj) return null;
                            return {
                                layerObj,
                                original: layerObj.geojson.features.find((feat) => feat.properties && feat.properties._uid === f.properties._uid) || null
                            };
                        };

                        const applyFineGeometryChange = (detail) => {
                            const found = resolveOriginal();
                            if (!found || !found.original) return;
                            const beforeGeom = cloneObj(found.original.geometry || null);
                            const mapGeom = cloneObj(l.toGeoJSON().geometry || null);
                            const afterGeom = mapGeometryToLayerGeometry(mapGeom, found.layerObj);
                            if (!recordGeometryUpdate(found.layerObj, f.properties._uid, beforeGeom, afterGeom, detail)) return;
                            found.original.geometry = afterGeom;
                        };

                        l.on('pm:markerdragstart', () => {
                            const found = resolveOriginal();
                            fineBeforeGeometry = found && found.original ? cloneObj(found.original.geometry || null) : null;
                        });
                        l.on('pm:markerdragend', () => {
                            const found = resolveOriginal();
                            if (!found || !found.original || !fineBeforeGeometry) return;
                            const mapGeom = cloneObj(l.toGeoJSON().geometry || null);
                            const afterGeom = mapGeometryToLayerGeometry(mapGeom, found.layerObj);
                            if (recordGeometryUpdate(found.layerObj, f.properties._uid, fineBeforeGeometry, afterGeom, 'pm:vertex-drag')) {
                                found.original.geometry = afterGeom;
                            }
                            fineBeforeGeometry = null;
                        });
                        l.on('pm:vertexadded', () => applyFineGeometryChange('pm:vertex-add'));
                        l.on('pm:vertexremoved', () => applyFineGeometryChange('pm:vertex-remove'));
                        
                        // MODIFIED: pm:edit handler to update GeoJSON features
                        l.on('pm:edit', (e) => {
                            const uid = f.properties._uid;
                            const layerObj = layers.find(x => x.id === id);
                            const original = layerObj ? layerObj.geojson.features.find(feat => feat.properties._uid === uid) : null;
                            if(original) {
                                const beforeGeom = cloneObj(original.geometry || null);
                                const before = JSON.stringify(beforeGeom);
                                const mapGeom = e.layer.toGeoJSON().geometry;
                                original.geometry = mapGeometryToLayerGeometry(mapGeom, layerObj);
                                const after = JSON.stringify(original.geometry || null);
                                if (before !== after) {
                                    recordGeometryUpdate(layerObj, uid, beforeGeom, original.geometry, 'pm:edit');
                                }
                            }
                            // NOTE: Table is not refreshed on edit to avoid performance hit. User should re-render it manually.
                        });
                        
                        const layerObj = layers.find(x => x.id === id);
                        if (layerObj && layerObj.labels && layerObj.labels.active && layerObj.labels.field) {
                             const txt = f.properties[layerObj.labels.field];
                             if(txt) l.bindTooltip(String(txt), {permanent: true, direction: "center"});
                        }
                    }
                });
            };

            const leafletL = createLeafletLayer(geojson);
            const visible = opts && opts.visible === false ? false : true;
            if (visible) leafletL.addTo(map);

            layers.push({
                id, name, geojson, leafletL, color, opacity: (opts && typeof opts.opacity === 'number') ? opts.opacity : 0.4,
                selectedIds: (opts && Array.isArray(opts.selectedIds)) ? opts.selectedIds : [],
                createLayerFn: createLeafletLayer,
                symbology: (opts && opts.symbology) ? opts.symbology : { field: null, map: {} },
                labels: (opts && opts.labels) ? opts.labels : { field: null, active: false },
                captureTemplate: (opts && opts.captureTemplate) ? opts.captureTemplate : null,
                group: (opts && opts.group) ? String(opts.group) : 'General',
                crs: layerCrs,
                locked: !!(opts && opts.locked),
                visible
            });
            if (moduleCapture && typeof moduleCapture.ensureTemplate === 'function') {
                moduleCapture.ensureTemplate(layers[layers.length - 1]);
            }
            updateLayerList(); setActive(id);
            try { map.fitBounds(leafletL.getBounds()); } catch(e){}
            syncState();
            scheduleProjectSave();
            return id;
        }

        function createEmptyLayer() {
            const name = prompt("Nombre de la nueva capa:", "Nueva Capa");
            if(!name) return;
            const empty = { type: "FeatureCollection", features: [] };
            registerLayer(empty, name, { crs: projectCrs });
        }

        function setActive(id) {
            setHoverFeature(null, null);
            if (selectionUiState.areaPickPending) {
                const mode = selectionUiState.areaPickPending;
                selectionUiState.areaPickPending = null;
                if (mode === 'rectangle') {
                    try { map.pm.disableDraw('Rectangle'); } catch (_) {}
                }
                if (mode === 'polygon') {
                    try { map.pm.disableDraw('Polygon'); } catch (_) {}
                }
            }
            activeId = id; updateLayerList(); renderTable();
            const l = layers.find(x => x.id === id);
            document.getElementById('active-layer-badge').innerHTML = `Capa: <b>${l ? l.name : 'Ninguna'}</b>`;
            document.getElementById('filter-container').style.display = l ? 'block' : 'none';
            if(l) filterActiveLayer(document.getElementById('layer-filter').value || '');
            if (modes.moveRotate && l && !isLayerEditable(l)) {
                modes.moveRotate = false;
                document.getElementById('tool-trigger-utils').classList.toggle('active-state', modes.select || modes.moveRotate);
            }
            
            // NEW: Disable edit/move on other layers, enable on active
            layers.forEach(ly => { 
                if(ly.id === id) {
                    if (isLayerEditable(ly)) {
                        ly.leafletL.pm.enable({ allowSelfIntersection: false, markerStyle: { draggable: true } });
                        ly.leafletL.pm.toggleLayerRotation(modes.moveRotate);
                        ly.leafletL.pm.toggleLayerDrag(modes.moveRotate);
                    } else {
                        ly.leafletL.pm.disable();
                    }
                } else {
                    ly.leafletL.pm.disable();
                }
            });
            
            updateSelectionUI();
            syncState();
        }

        function updateLayerList() {
            if (moduleLayers && typeof moduleLayers.renderLayerList === 'function') {
                return moduleLayers.renderLayerList(moduleCtx());
            }
            const list = document.getElementById('layer-list');
            document.getElementById('layer-count').innerText = layers.length;
            list.innerHTML = '';
            layers.forEach(l => {
                const active = l.id === activeId ? 'active' : '';
                const props = l.geojson.features.length > 0 ? Object.keys(l.geojson.features[0].properties).filter(k=>k!=='_uid') : [];
                let fieldOpts = `<option value="">Seleccionar campo...</option>`;
                props.forEach(p => fieldOpts += `<option value="${p}">${p}</option>`);

                list.innerHTML += `
                    <div class="layer-card ${active}">
                        <div class="layer-header">
                            <div class="layer-name" data-action="layer-set-active" data-layer-id="${l.id}">${l.name}</div>
                            <div class="layer-tools">
                                <i class="fas fa-arrow-up" data-action="layer-move-up" data-layer-id="${l.id}" title="Subir"></i>
                                <i class="fas fa-arrow-down" data-action="layer-move-down" data-layer-id="${l.id}" title="Bajar"></i>
                                <i class="fas ${l.locked?'fa-lock':'fa-lock-open'}" data-action="layer-toggle-lock" data-layer-id="${l.id}" title="Bloquear edición"></i>
                                <i class="fas fa-cog" data-action="layer-toggle-settings" data-layer-id="${l.id}" title="Ajustes"></i>
                                <input type="color" value="${l.color}" data-action="layer-change-color" data-layer-id="${l.id}" style="width:20px;border:none;background:none;cursor:pointer">
                                <i class="fas ${l.visible===false?'fa-eye-slash':'fa-eye'}" data-action="layer-toggle-vis" data-layer-id="${l.id}"></i>
                                <i class="fas fa-trash" style="color:#e74c3c" data-action="layer-delete" data-layer-id="${l.id}"></i>
                            </div>
                        </div>
                        <div class="layer-slider"><input type="range" min="0" max="1" step="0.1" value="${l.opacity}" data-action="layer-change-opacity" data-layer-id="${l.id}"></div>
                        <div id="settings-${l.id}" class="layer-settings">
                            <div class="setting-row"><label>Categorizar:</label><select data-action="layer-apply-symbology" data-layer-id="${l.id}">${fieldOpts}</select></div>
                            <div class="setting-row"><label>Etiquetas:</label><select data-action="layer-set-label-field" data-layer-id="${l.id}">${fieldOpts}</select></div>
                            <div class="setting-row" style="flex-direction:row;"><label>Activar:</label><input type="checkbox" ${l.labels.active?'checked':''} data-action="layer-toggle-labels" data-layer-id="${l.id}"></div>
                        </div>
                    </div>`;
            });
        }
        function toggleLayerSettings(id) { document.getElementById(`settings-${id}`).classList.toggle('show'); }
        function moveLayer(id, dir) {
            const idx = layers.findIndex((x) => x.id === id);
            if (idx < 0) return;
            const target = dir === 'up' ? idx - 1 : idx + 1;
            if (target < 0 || target >= layers.length) return;
            const cur = layers[idx];
            layers[idx] = layers[target];
            layers[target] = cur;
            syncLayerOrder();
            updateLayerList();
            scheduleProjectSave();
        }
        function toggleLayerLock(id) {
            return setLayerLocked(id, null, null);
        }
        function setLayerLocked(id, lockedValue, opts) {
            const l = layers.find((x) => x.id === id);
            if (!l) return false;
            if (typeof lockedValue === 'boolean') l.locked = !!lockedValue;
            else l.locked = !l.locked;
            if (l.locked && l.leafletL && l.leafletL.pm) l.leafletL.pm.disable();
            if (!l.locked && activeId === l.id && l.leafletL && l.leafletL.pm && isLayerEditable(l)) l.leafletL.pm.enable({ allowSelfIntersection: false, markerStyle: { draggable: true } });
            if (!(opts && opts.skipUi)) updateLayerList();
            if (!(opts && opts.skipSave)) scheduleProjectSave();
            return true;
        }
        function setLayerGroup(id, groupValue) {
            const l = layers.find((x) => x.id === id);
            if (!l) return;
            const g = String(groupValue || '').trim() || 'General';
            l.group = g;
            updateLayerList();
            scheduleProjectSave();
        }
        function setLayerCrs(id, crsValue) {
            const l = layers.find((x) => x.id === id);
            if (!l) return;
            const crs = normalizeCrs(crsValue);
            if (CRS_SUPPORTED.indexOf(crs) < 0) return alert('CRS no soportado en este MVP');
            l.crs = crs;
            refreshLayerFeatures(l);
            if (activeId === l.id) setActive(l.id);
            updateLayerList();
            scheduleProjectSave();
        }
        function transformCoordsArray(coords, src, dst) {
            if (!Array.isArray(coords)) return coords;
            if (coords.length === 0) return coords;
            if (typeof coords[0] === 'number') {
                try {
                    const p = proj4(src, dst, [coords[0], coords[1]]);
                    return [p[0], p[1]];
                } catch (_) {
                    return coords;
                }
            }
            return coords.map((x) => transformCoordsArray(x, src, dst));
        }
        function mapGeometryToLayerGeometry(geometry, layerObj) {
            if (!geometry || !layerObj) return cloneObj(geometry);
            const src = CRS_DEFAULT;
            const dst = normalizeCrs(layerObj.crs);
            const out = cloneObj(geometry);
            if (src === dst || !out || !out.coordinates) return out;
            out.coordinates = transformCoordsArray(out.coordinates, src, dst);
            return out;
        }
        function getFeatureBaseColor(layerObj, feature) {
            if (!layerObj) return '#3388ff';
            let c = layerObj.color;
            if (layerObj.symbology && layerObj.symbology.field && layerObj.symbology.map[feature.properties[layerObj.symbology.field]]) {
                c = layerObj.symbology.map[feature.properties[layerObj.symbology.field]];
            }
            return c;
        }
        function buildFeatureStyle(layerObj, feature) {
            const uid = feature && feature.properties ? feature.properties._uid : null;
            const isSel = !!(layerObj && uid && layerObj.selectedIds && layerObj.selectedIds.includes(uid));
            const isHover = !!(uid && selectionUiState.hoverLayerId === (layerObj ? layerObj.id : null) && selectionUiState.hoverUid === uid && !isSel);
            const base = getFeatureBaseColor(layerObj, feature);
            if (isSel) {
                return { color: '#ffc107', fillColor: '#ffc107', weight: 3, fillOpacity: layerObj ? layerObj.opacity : 0.4 };
            }
            if (isHover) {
                return { color: '#ff7f50', fillColor: '#ff7f50', weight: 3, dashArray: '6,4', fillOpacity: layerObj ? Math.min(0.7, (layerObj.opacity || 0.4) + 0.15) : 0.5 };
            }
            return { color: base, fillColor: base, weight: 2, fillOpacity: layerObj ? layerObj.opacity : 0.4 };
        }
        function applyFeatureVisualState(layerObj, uid) {
            if (!layerObj || !uid || !layerObj.leafletL || typeof layerObj.leafletL.eachLayer !== 'function') return;
            layerObj.leafletL.eachLayer((ly) => {
                if (!ly || !ly.feature || !ly.feature.properties || ly.feature.properties._uid !== uid || typeof ly.setStyle !== 'function') return;
                const st = buildFeatureStyle(layerObj, ly.feature);
                ly.setStyle(st);
            });
        }
        function setHoverFeature(layerId, uid) {
            const prevLayerId = selectionUiState.hoverLayerId;
            const prevUid = selectionUiState.hoverUid;
            if (prevLayerId === layerId && prevUid === uid) return;
            selectionUiState.hoverLayerId = layerId || null;
            selectionUiState.hoverUid = uid || null;
            if (prevLayerId && prevUid) {
                const prevLayer = findLayerById(prevLayerId);
                if (prevLayer) applyFeatureVisualState(prevLayer, prevUid);
            }
            if (selectionUiState.hoverLayerId && selectionUiState.hoverUid) {
                const curLayer = findLayerById(selectionUiState.hoverLayerId);
                if (curLayer) applyFeatureVisualState(curLayer, selectionUiState.hoverUid);
            }
        }
        function flattenLatLngChains(latlngs, out) {
            if (!Array.isArray(latlngs)) return;
            if (latlngs.length === 0) return;
            if (latlngs[0] && typeof latlngs[0].lat === 'number') {
                out.push(latlngs);
                return;
            }
            latlngs.forEach((x) => flattenLatLngChains(x, out));
        }
        function pointSegmentDistancePx(p, a, b) {
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
            const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
            const px = a.x + t * dx;
            const py = a.y + t * dy;
            return Math.hypot(p.x - px, p.y - py);
        }
        function layerDistancePx(leafletLayer, latlng) {
            if (!leafletLayer || !latlng) return Infinity;
            const p = map.latLngToContainerPoint(latlng);
            if (leafletLayer instanceof L.Marker || leafletLayer instanceof L.CircleMarker) {
                const lp = map.latLngToContainerPoint(leafletLayer.getLatLng());
                return Math.hypot(p.x - lp.x, p.y - lp.y);
            }
            if (leafletLayer instanceof L.Polygon && leafletLayer.getBounds && leafletLayer.getBounds().contains(latlng)) {
                return 0;
            }
            if (leafletLayer instanceof L.Polyline) {
                const chains = [];
                flattenLatLngChains(leafletLayer.getLatLngs(), chains);
                let minD = Infinity;
                chains.forEach((chain) => {
                    for (let i = 0; i < chain.length - 1; i++) {
                        const a = map.latLngToContainerPoint(chain[i]);
                        const b = map.latLngToContainerPoint(chain[i + 1]);
                        const d = pointSegmentDistancePx(p, a, b);
                        if (d < minD) minD = d;
                    }
                });
                return minD;
            }
            return Infinity;
        }
        function findNearestFeatureAt(latlng, tolerancePx) {
            if (!activeId) return null;
            const l = findLayerById(activeId);
            if (!l || !l.leafletL) return null;
            let best = null;
            l.leafletL.eachLayer((ly) => {
                if (!ly || !ly.feature || !ly.feature.properties) return;
                const uid = ly.feature.properties._uid;
                if (!uid) return;
                const d = layerDistancePx(ly, latlng);
                if (!Number.isFinite(d)) return;
                if (!best || d < best.distancePx) best = { uid, distancePx: d, layer: ly };
            });
            if (!best || best.distancePx > tolerancePx) return null;
            return best;
        }
        function updateSelectionHoverPreview(latlng) {
            if (!modes.select || !activeId || !latlng) {
                setHoverFeature(null, null);
                return;
            }
            const tolerancePx = Number(selectionUiState.tolerancePx) > 0 ? Number(selectionUiState.tolerancePx) : 12;
            const candidate = findNearestFeatureAt(latlng, tolerancePx + 8);
            if (!candidate) {
                setHoverFeature(null, null);
                return;
            }
            setHoverFeature(activeId, candidate.uid);
        }
        function applySelectionByBounds(bounds, opts) {
            if (!bounds || !activeId) return false;
            const append = !!(opts && opts.append);
            const l = findLayerById(activeId);
            if (!l || !l.leafletL) return false;
            const ids = [];
            l.leafletL.eachLayer((ly) => {
                if (!ly || !ly.feature || !ly.feature.properties || !ly.feature.properties._uid) return;
                let hit = false;
                if (typeof ly.getLatLng === 'function') hit = bounds.contains(ly.getLatLng());
                else if (typeof ly.getBounds === 'function') hit = bounds.intersects(ly.getBounds());
                if (hit) ids.push(ly.feature.properties._uid);
            });
            const next = append ? Array.from(new Set((l.selectedIds || []).concat(ids))) : ids;
            l.selectedIds = next;
            refreshLayerFeatures(l);
            updateSelectionUI();
            return true;
        }
        function applySelectionByPolygon(polygonLayer, opts) {
            if (!polygonLayer || !activeId) return false;
            const append = !!(opts && opts.append);
            const l = findLayerById(activeId);
            if (!l || !l.leafletL) return false;
            let polygonFeature = null;
            try {
                polygonFeature = polygonLayer.toGeoJSON();
            } catch (_) {
                return false;
            }
            if (!polygonFeature || !polygonFeature.geometry) return false;
            const ids = [];
            l.leafletL.eachLayer((ly) => {
                if (!ly || !ly.feature || !ly.feature.properties || !ly.feature.properties._uid) return;
                try {
                    const f = ly.toGeoJSON();
                    if (f && turf.booleanIntersects(f, polygonFeature)) ids.push(ly.feature.properties._uid);
                } catch (_) {}
            });
            const next = append ? Array.from(new Set((l.selectedIds || []).concat(ids))) : ids;
            l.selectedIds = next;
            refreshLayerFeatures(l);
            updateSelectionUI();
            return true;
        }
        function clearSelectionOnActive(opts) {
            if (!activeId) return false;
            const l = findLayerById(activeId);
            if (!l) return false;
            if (!Array.isArray(l.selectedIds) || l.selectedIds.length === 0) {
                if (!(opts && opts.silent)) alert('No hay selección activa');
                return false;
            }
            l.selectedIds = [];
            refreshLayerFeatures(l);
            updateSelectionUI();
            return true;
        }
        function startAreaSelection() {
            if (!activeId) return alert('Selecciona una capa activa');
            modes.identify = false;
            modes.select = true;
            selectionUiState.areaPickPending = 'rectangle';
            map.getContainer().style.cursor = 'crosshair';
            map.pm.enableDraw('Rectangle', {
                snappable: false,
                continueDrawing: false,
                pathOptions: { color: '#ff7f50', fillOpacity: 0.05, dashArray: '6,4', weight: 2 }
            });
            toggleMenu('menu-utils');
        }
        function startLassoSelection() {
            if (!activeId) return alert('Selecciona una capa activa');
            modes.identify = false;
            modes.select = true;
            selectionUiState.areaPickPending = 'polygon';
            map.getContainer().style.cursor = 'crosshair';
            map.pm.enableDraw('Polygon', {
                snappable: false,
                continueDrawing: false,
                pathOptions: { color: '#ff7f50', fillOpacity: 0.05, dashArray: '6,4', weight: 2 }
            });
            toggleMenu('menu-utils');
        }
        function enableCutShortcutMode() {
            if (!activeId) return alert('Selecciona una capa activa');
            if (typeof map.pm.enableGlobalCutMode === 'function') {
                map.pm.enableGlobalCutMode();
                return;
            }
            if (typeof map.pm.toggleGlobalCutMode === 'function') {
                map.pm.toggleGlobalCutMode();
                return;
            }
            alert('Modo cut no disponible en esta versión de Geoman');
        }
        function extractFeaturesFromLayerObject(layerObj) {
            if (!layerObj) return [];
            try {
                const gj = layerObj.toGeoJSON();
                if (!gj) return [];
                if (gj.type === 'FeatureCollection' && Array.isArray(gj.features)) return gj.features;
                if (gj.type === 'Feature') return [gj];
            } catch (_) {}
            const out = [];
            if (typeof layerObj.eachLayer === 'function') {
                layerObj.eachLayer((sub) => {
                    try {
                        const gj = sub.toGeoJSON();
                        if (gj && gj.type === 'Feature') out.push(gj);
                    } catch (_) {}
                });
            }
            return out;
        }
        function registerDerivedLayer(resultGeojson, name, sourceLayer) {
            if (!resultGeojson) return null;
            const srcCrs = sourceLayer ? normalizeCrs(sourceLayer.crs) : CRS_DEFAULT;
            return registerLayer(resultGeojson, name, { crs: srcCrs });
        }
        function applyCutReplacementOnLayer(ownerLayer, originalUid, cutFeatures, opts = null) {
            if (!ownerLayer || !originalUid) return { ok: false, reason: 'invalid-input' };
            if (!isLayerEditable(ownerLayer)) {
                if (!(opts && opts.silent)) alert('Corte no permitido: la capa está bloqueada o su CRS no es editable con la configuración actual.');
                return { ok: false, reason: 'not-editable' };
            }

            const originalFeature = findFeatureByUid(ownerLayer, originalUid);
            if (!originalFeature) return { ok: false, reason: 'original-not-found' };
            if (!Array.isArray(cutFeatures) || cutFeatures.length === 0) return { ok: false, reason: 'empty-cut-result' };

            const baseProps = cloneObj(originalFeature.properties || {});
            const beforeSelected = cloneObj(ownerLayer.selectedIds || []);
            const newFeatures = [];
            const newIds = [];
            const stamp = Date.now();

            cutFeatures.forEach((cf, idx) => {
                if (!cf || !cf.geometry) return;
                const next = cloneObj(cf);
                next.geometry = mapGeometryToLayerGeometry(next.geometry, ownerLayer);
                next.properties = { ...baseProps, ...(next.properties || {}) };
                next.properties._uid = `${ownerLayer.id}_${stamp}_${idx}`;
                newIds.push(next.properties._uid);
                newFeatures.push(next);
            });
            if (newFeatures.length === 0) return { ok: false, reason: 'empty-cut-result' };

            ownerLayer.geojson.features = ownerLayer.geojson.features.filter((f) => !(f && f.properties && f.properties._uid === originalUid));
            ownerLayer.geojson.features.push(...newFeatures);
            ownerLayer.selectedIds = cloneObj(newIds);

            pushUndoOp({
                type: 'feature_replace_batch',
                layerId: ownerLayer.id,
                removeIds: [originalUid],
                addFeatures: cloneObj(newFeatures),
                undoRemoveIds: cloneObj(newIds),
                undoAddFeatures: [cloneObj(originalFeature)],
                undoSelectedIds: beforeSelected,
                nextSelectedIds: cloneObj(newIds)
            });
            newFeatures.forEach((nf) => addEditHistory('update', ownerLayer, nf, { kind: 'pm:cut', splitFrom: originalUid }));

            refreshLayerFeatures(ownerLayer);
            updateSelectionUI();
            return { ok: true, newIds: cloneObj(newIds), created: newFeatures.length };
        }
        function reprojectLayerToWgs84(id, silent) {
            const l = layers.find((x) => x.id === id);
            if (!l) return;
            const src = normalizeCrs(l.crs);
            const dst = CRS_DEFAULT;
            if (src === dst) {
                if (!silent) alert('La capa ya está en EPSG:4326');
                return;
            }
            if (typeof proj4 !== 'function') {
                if (!silent) alert('proj4 no está disponible');
                return;
            }
            let changed = 0;
            l.geojson.features.forEach((f) => {
                if (!f || !f.geometry || !f.geometry.coordinates) return;
                const before = cloneObj(f.geometry);
                f.geometry.coordinates = transformCoordsArray(f.geometry.coordinates, src, dst);
                const after = cloneObj(f.geometry);
                if (JSON.stringify(before) !== JSON.stringify(after)) {
                    recordGeometryUpdate(l, f.properties && f.properties._uid ? f.properties._uid : null, before, after, `reproject ${src}->${dst}`);
                    changed++;
                }
            });
            l.crs = dst;
            refreshLayerFeatures(l);
            if (activeId === l.id) setActive(l.id);
            updateLayerList();
            if (!silent) alert(`Reproyección completada: ${changed} feature(s)`);
        }

        function addFieldToActive(name, opts) {
            if(!activeId) {
                if (!(opts && opts.silent)) alert("Selecciona una capa");
                return false;
            }
            const l = layers.find(x => x.id === activeId);
            if (!ensureLayerEditable(l, 'Alta de campo', opts)) return false;
            if(!name) return false;
            l.geojson.features.forEach(f => f.properties[name] = null);
            renderTable();
            if (!(opts && opts.skipSave)) scheduleProjectSave();
            return true;
        }
        function addNewField() {
            const name = prompt("Nombre del nuevo campo:");
            if(!name) return;
            addFieldToActive(name);
        }

        function openCalculator() {
            if(!activeId) return alert("Selecciona una capa");
            const l = layers.find(x => x.id === activeId);
            if (!ensureLayerEditable(l, 'Calculadora de campos')) return;
            const props = l.geojson.features.length > 0 ? Object.keys(l.geojson.features[0].properties).filter(k=>k!=='_uid') : [];
            if(props.length === 0) return alert("No hay campos para operar");
            const target = prompt("Escribe el nombre del CAMPO DESTINO (existente o nuevo):");
            if(!target) return;
            const formula = prompt(`Escribe la fórmula.\nUsa los nombres de los campos exactos.\nEjemplos: "AREA * 100", "POBLACION / SUPERFICIE"\nCampos disponibles: ${props.join(', ')}`);
            if(!formula) return;
            loader(true);
            setTimeout(() => {
                let count = 0;
                l.geojson.features.forEach(f => {
                    try {
                        let evalString = formula;
                        props.forEach(p => {
                            // IMPROVED: Handle string values in properties
                            const val = f.properties[p] !== undefined ? f.properties[p] : 0;
                            const reg = new RegExp(`\\b${p}\\b`, 'g');
                            
                            // Replace field name with its value (use quotes for strings)
                            if(typeof val === 'string') {
                                evalString = evalString.replace(reg, `'${val}'`);
                            } else {
                                evalString = evalString.replace(reg, val);
                            }
                        });
                        const result = safeEvalFormula(evalString);
                        f.properties[target] = result;

                        count++;
                    } catch(e) { /* silent fail for features with error */ }
                });
                renderTable(); loader(false);
                alert(`Cálculo finalizado en ${count} elementos.`);
                scheduleProjectSave();
            }, 100);
        }

        // NEW/MODIFIED: Configurable Geoprocessing via Modal
        function getFieldOptions(layerId) {
            const l = layers.find(x => x.id === layerId);
            if (!l || l.geojson.features.length === 0) return '';
            const props = Object.keys(l.geojson.features[0].properties).filter(k => k !== '_uid');
            let opts = '<option value="">(Seleccionar)</option>';
            props.forEach(p => opts += `<option value="${p}">${p}</option>`);
            return opts;
        }

        function openProcessModal(tool) {
            if (moduleGIS && typeof moduleGIS.openProcessModal === 'function') {
                return moduleGIS.openProcessModal(moduleCtx(), tool);
            }
            if(!activeId) return alert("Se requiere una Capa Activa.");
            toggleMenu('menu-gis'); // Close GIS menu
            currentProcess.tool = tool;
            currentProcess.options = {};
            const modalTitle = document.getElementById('modal-title');
            const modalForm = document.getElementById('modal-form');
            let formHTML = '';

            const activeLayerName = layers.find(x => x.id === activeId).name;
            const otherLayers = layers.filter(x => x.id !== activeId);
            const layerOptions = otherLayers.map(l => `<option value="${l.id}">${l.name}</option>`).join('');

            switch (tool) {
                case 'buffer':
                    modalTitle.innerText = `Buffer: ${activeLayerName}`;
                    const fieldOptionsBuffer = getFieldOptions(activeId);
                    formHTML = `
                        <div class="form-group">
                            <label>Distancia (Km):</label>
                            <input type="number" id="buffer-dist" placeholder="0.5" value="0.1" step="0.01">
                            <small class="text-muted">Si se usa campo, se ignora esta distancia.</small>
                        </div>
                        <div class="form-group">
                            <label>Campo Variable de Distancia:</label>
                            <select id="buffer-field">${fieldOptionsBuffer}</select>
                        </div>
                    `;
                    break;
                case 'union':
                    modalTitle.innerText = `Disolver (Union): ${activeLayerName}`;
                    const fieldOptionsUnion = getFieldOptions(activeId);
                    formHTML = `
                        <div class="form-group">
                            <label>Campo para Agrupar (Disolver):</label>
                            <select id="union-field">${fieldOptionsUnion}</select>
                            <small class="text-muted">Vacío: disolverá todas las geometrías en una sola.</small>
                        </div>
                    `;
                    break;
                case 'intersect':
                case 'difference':
                    modalTitle.innerText = `${tool === 'intersect' ? 'Intersección' : 'Diferencia'} (2 Capas)`;
                    if(otherLayers.length === 0) {
                        modalForm.innerHTML = `<p style="color:#e74c3c;">Se requiere otra capa para esta operación.</p>`;
                        document.querySelector('#process-modal .btn-block').style.display = 'none';
                        document.getElementById('process-modal').style.display = 'flex';
                        return;
                    }
                    formHTML = `
                        <div class="form-group">
                            <label>Capa de Entrada (A):</label>
                            <input type="text" value="${activeLayerName}" readonly>
                        </div>
                        <div class="form-group">
                            <label>Capa de Referencia (B):</label>
                            <select id="target-layer-id">
                                ${layerOptions}
                            </select>
                        </div>
                        <p class="text-muted" style="font-size:0.8rem;">Operación: ${tool === 'intersect' ? 'A intersect B' : 'A - B'}</p>
                    `;
                    break;
                default:
                    return;
            }

            modalForm.innerHTML = formHTML;
            document.querySelector('#process-modal .btn-block').style.display = 'block'; // Ensure execute button is visible
            document.getElementById('process-modal').style.display = 'flex';
        }

        function closeProcessModal() {
            if (moduleGIS && typeof moduleGIS.closeProcessModal === 'function') {
                return moduleGIS.closeProcessModal(moduleCtx());
            }
            document.getElementById('process-modal').style.display = 'none';
            currentProcess.tool = null;
        }

        async function executeProcess() {
            if (moduleGIS && typeof moduleGIS.executeProcess === 'function') {
                return moduleGIS.executeProcess(moduleCtx());
            }
            const tool = currentProcess.tool;
            const l = layers.find(x => x.id === activeId);
            let src = l.geojson;
            let suffix = "";
            let options = {};
            closeProcessModal(); // Close modal immediately

            // Get source GeoJSON (Selection or Full)
            if(l.selectedIds.length > 0) {
                src = { type:"FeatureCollection", features: l.geojson.features.filter(f=>l.selectedIds.includes(f.properties._uid)) };
                suffix="_Sel";
            }

            // Get options from modal inputs
            switch (tool) {
                case 'buffer':
                    const dist = document.getElementById('buffer-dist').value;
                    const field = document.getElementById('buffer-field').value;
                    if (!dist && !field) { alert("Se requiere distancia o campo."); return; }

                    if (field) {
                        options = field; suffix += `_Var`;
                    } else if (!isNaN(parseFloat(dist))) {
                        options = parseFloat(dist); suffix += `_${options}km`;
                    } else {
                        alert("Distancia no valida."); return;
                    }
                    break;
                case 'union':
                    const unionField = document.getElementById('union-field').value;
                    if(unionField) {
                        options = { propertyName: unionField };
                        suffix += `_${unionField}`;
                    } else {
                        // Dissolve all (no options needed for turf.dissolve)
                        suffix += "_All";
                    }
                    break;
                case 'intersect':
                case 'difference':
                    const targetLayerId = document.getElementById('target-layer-id').value;
                    if(!targetLayerId) { alert("Selecciona la capa de referencia."); return; }
                    currentProcess.options.targetId = targetLayerId;
                    const o = layers.find(x => x.id === targetLayerId);
                    if (!o) { alert("Capa de referencia no encontrada."); return; }
                    if (normalizeCrs(o.crs) !== normalizeCrs(l.crs)) {
                        alert("Las operaciones entre 2 capas requieren el mismo CRS. Reproyecta una de las capas.");
                        return;
                    }
                    // Store the target layer GeoJSON in options
                    options = { targetGeoJSON: o.geojson };
                    suffix += `_${o.name}`;
                    break;
            }

            loader(true);

            setTimeout(() => {
                try {
                    let res = null;
                    if (tool === 'buffer') {
                        if (typeof options === 'number') {
                            res = turf.buffer(src, options, { units: 'kilometers' });
                        } else {
                            const buffed = src.features.map(f => {
                                const distVal = parseFloat(f.properties[options]);
                                if (isNaN(distVal) || distVal <= 0) return null;
                                return turf.buffer(f, distVal, { units: 'kilometers' });
                            }).filter(f => f !== null);
                            res = turf.featureCollection(buffed);
                        }
                    } else if (tool === 'union') {
                        res = turf.dissolve(src, options);
                    } else if (tool === 'intersect') {
                        // Perform the intersection between the active layer and the target layer
                        // NOTE: Intersect in turf only works between two single features or two feature collections.
                        // To intersect two collections, we need an approach like a spatial join or iterating features.
                        // For simplicity, we'll use a basic approach that works for single features or small collections.
                        const targetGeoJSON = options.targetGeoJSON;
                        const intersections = [];
                        src.features.forEach(fA => {
                            targetGeoJSON.features.forEach(fB => {
                                const intersection = turf.intersect(fA, fB);
                                if (intersection) {
                                    // Combine properties from both features
                                    intersection.properties = { ...fA.properties, ...fB.properties };
                                    intersections.push(intersection);
                                }
                            });
                        });
                        res = turf.featureCollection(intersections);
                        if (res.features.length === 0) throw "No se encontraron intersecciones.";

                    } else if (tool === 'difference') {
                        const targetGeoJSON = options.targetGeoJSON;
                        const differences = [];
                        src.features.forEach(fA => {
                            let currentFeature = fA;
                            targetGeoJSON.features.forEach(fB => {
                                const diff = turf.difference(currentFeature, fB);
                                if (diff) {
                                    currentFeature = diff;
                                } else {
                                    // If difference is null, means B fully contains A, so A is removed
                                    currentFeature = null;
                                    return;
                                }
                            });
                            if (currentFeature) {
                                // Preserve properties of the original feature A
                                currentFeature.properties = fA.properties;
                                differences.push(currentFeature);
                            }
                        });
                        res = turf.featureCollection(differences);
                        if (res.features.length === 0) throw "La diferencia resulto en un conjunto vacío.";
                    }

                    if (res) registerDerivedLayer(res, l.name + "_" + tool + suffix, l);
                    else alert("Sin resultado");
                } catch (e) {
                    alert("Error durante el geoproceso: " + e);
                }
                loader(false);
            }, 50);
        }

        async function runGIS(tool) {
            if (moduleGIS && typeof moduleGIS.runGIS === 'function') {
                return moduleGIS.runGIS(moduleCtx(), tool);
            }
            if(!activeId) return alert("Capa activa requerida");
            const l = layers.find(x=>x.id===activeId);
            let src = l.geojson;
            let suffix = "";
            if(l.selectedIds.length>0) {
                src = { type:"FeatureCollection", features: l.geojson.features.filter(f=>l.selectedIds.includes(f.properties._uid)) };
                suffix="_Sel";
            }
            if(!src.features.length) return alert("No hay geometrías para procesar (vacío o selección vacía)");

            let options = {}; // options are now mostly handled in executeProcess for the configurable tools

            loader(true); toggleMenu('menu-gis');
            setTimeout(()=>{
                try {
                    let res=null;
                    // Simplified tools (non-configurable)
                    if(tool==='centroid') { res=turf.featureCollection(src.features.map(f=>turf.centroid(f))); suffix+="_Cent"; }
                    else if(tool==='centerofmass') { res=turf.featureCollection(src.features.map(f=>turf.centerOfMass(f))); suffix+="_CM"; } // NEW TOOL
                    else if(tool==='hull') { res=turf.convex(src); suffix+="_Hull"; }
                    else if(tool==='tin') {
                        const pts=[]; turf.flatten(src).features.forEach(f=>pts.push(turf.centroid(f)));
                        // NOTE: tin requires at least 3 points
                        if(pts.length < 3) throw "TIN requiere al menos 3 puntos.";
                        res=turf.tin(turf.featureCollection(pts)); suffix+="_Tin";
                    }
                    else if(tool==='kmeans') {
                        const pts=[]; turf.flatten(src).features.forEach(f=>pts.push(turf.centroid(f)));
                        if(pts.length < 5) throw "K-Means requiere al menos 5 puntos.";
                        res = turf.clustersKmeans(turf.featureCollection(pts), {numberOfClusters: 5}); suffix+="_Kmeans";
                    }
                    else if(tool==='voronoi') {
                        const pts=[]; turf.flatten(src).features.forEach(f=>pts.push(turf.centroid(f)));
                        if(pts.length < 1) throw "Voronoi requiere al menos 1 punto.";
                        res = turf.voronoi(turf.featureCollection(pts), {bbox: turf.bbox(src)}); suffix+="_Vor";
                    }
                    // The configurable tools (buffer, union, intersect, difference) are now handled by openProcessModal/executeProcess

                    if(res) registerDerivedLayer(res, l.name+suffix, l); else alert("Sin resultado");
                } catch(e){ alert("Error: "+e); }
                loader(false);
            },50);
        }

        function applySymbology(id, field) {
            const l = layers.find(x => x.id === id);
            if (!field) { l.symbology.field = null; l.symbology.map = {}; }
            else {
                l.symbology.field = field;
                const uniqueVals = [...new Set(l.geojson.features.map(f => f.properties[field]))];
                l.symbology.map = {}; // Clear old map
                uniqueVals.forEach(val => l.symbology.map[val] = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'));
            }
            // MODIFIED: Use refreshLayerFeatures to redraw layer with new symbology
            refreshLayerFeatures(l);
            scheduleProjectSave();
        }

        function toggleMoveRotate() {
            if (moduleEditing && typeof moduleEditing.toggleMoveRotate === 'function') {
                return moduleEditing.toggleMoveRotate(moduleCtx());
            }
            if(!activeId) return alert("Selecciona la capa a Mover/Rotar");
            const l = layers.find(x=>x.id===activeId);
            if (!isLayerEditable(l)) return alert('La capa activa no es editable (bloqueada o CRS no compatible con el modo actual)');
            modes.moveRotate = !modes.moveRotate;
            l.leafletL.pm.toggleLayerRotation(modes.moveRotate);
            l.leafletL.pm.toggleLayerDrag(modes.moveRotate);
            document.getElementById('tool-trigger-utils').classList.toggle('active-state', modes.select || modes.moveRotate);

            if(!modes.moveRotate) {
                // When disabling, update the source GeoJSON
                l.leafletL.eachLayer(layer => {
                    if (layer.feature && layer.feature.properties._uid) {
                        const uid = layer.feature.properties._uid;
                        const original = l.geojson.features.find(feat => feat.properties._uid === uid);
                        if(original) original.geometry = mapGeometryToLayerGeometry(layer.toGeoJSON().geometry, l);
                    }
                });
            }
            toggleMenu('menu-utils');
            alert(modes.moveRotate?"Modo Mover/Rotar ON":"Modo Mover/Rotar OFF. Geometrías actualizadas.");
        }

        function setLabelField(id, field) {
            if (moduleEditing && typeof moduleEditing.setLabelField === 'function') {
                return moduleEditing.setLabelField(moduleCtx(), id, field);
            }
            const l=layers.find(x=>x.id===id); l.labels.field=field; if(l.labels.active) refreshLabels(l); scheduleProjectSave();
        }
        function toggleLabels(id, active) {
            if (moduleEditing && typeof moduleEditing.toggleLabels === 'function') {
                return moduleEditing.toggleLabels(moduleCtx(), id, active);
            }
            const l=layers.find(x=>x.id===id); l.labels.active=active; refreshLabels(l); scheduleProjectSave();
        }
        function refreshLabels(l) {
            if (moduleEditing && typeof moduleEditing.refreshLabels === 'function') {
                return moduleEditing.refreshLabels(moduleCtx(), l);
            }
            l.leafletL.eachLayer(layer => {
                layer.unbindTooltip();
                if(l.labels.active && l.labels.field) {
                    const txt = layer.feature.properties[l.labels.field];
                    if(txt) layer.bindTooltip(String(txt), {permanent: true, direction: "center"});
                }
            });
        }
        function filterActiveLayer(text) {
            if (moduleEditing && typeof moduleEditing.filterActiveLayer === 'function') {
                return moduleEditing.filterActiveLayer(moduleCtx(), text);
            }
            if(!activeId) return; const l=layers.find(x=>x.id===activeId); const term=text.toLowerCase();
            const filtered=l.geojson.features.filter(f=>{ if(!term)return true; for(const k in f.properties)if(k!=='_uid'&&String(f.properties[k]).toLowerCase().includes(term))return true; return false;});
            // MODIFIED: Use existing feature data to redraw
            l.leafletL.clearLayers(); l.leafletL.addData({type:"FeatureCollection", features: filtered});
        }
        function handleMapClick(e, layerId, feature, leafletLayer) {
            if (moduleEditing && typeof moduleEditing.handleMapClick === 'function') {
                return moduleEditing.handleMapClick(moduleCtx(), e, layerId, feature, leafletLayer);
            }
            if(modes.identify) { L.DomEvent.stopPropagation(e); let h="<b>Info:</b><br>"; for(let k in feature.properties)if(k!=='_uid')h+=`<b>${k}:</b> ${feature.properties[k]}<br>`; leafletLayer.bindPopup(h).openPopup(); }
            else if(modes.select) {
                L.DomEvent.stopPropagation(e); if(layerId!==activeId) return alert("Selecciona en capa activa");
                const l=layers.find(x=>x.id===layerId); const uid=feature.properties._uid;
                if(l.selectedIds.includes(uid)) l.selectedIds=l.selectedIds.filter(x=>x!==uid); else l.selectedIds.push(uid);
                applyFeatureVisualState(l, uid);
                updateSelectionUI();
            }
        }
        function updateSelectionUI() {
            if (moduleEditing && typeof moduleEditing.updateSelectionUI === 'function') {
                return moduleEditing.updateSelectionUI(moduleCtx());
            }
            const l=layers.find(x=>x.id===activeId); const b=document.getElementById('selection-badge'); if(l&&l.selectedIds.length>0){b.style.display='block';b.innerText=`Sel: ${l.selectedIds.length}`;}else b.style.display='none';
        }
        function toggleSelectMode() {
            if (moduleEditing && typeof moduleEditing.toggleSelectMode === 'function') {
                return moduleEditing.toggleSelectMode(moduleCtx());
            }
            modes.select=!modes.select;
            modes.identify=false;
            if (!modes.select) setHoverFeature(null, null);
            document.getElementById('tool-trigger-utils').classList.toggle('active-state', modes.select || modes.moveRotate);
            map.getContainer().style.cursor=modes.select?'crosshair':'';
            toggleMenu('menu-utils');
        }
        function toggleIdentify() {
            if (moduleEditing && typeof moduleEditing.toggleIdentify === 'function') {
                return moduleEditing.toggleIdentify(moduleCtx());
            }
            modes.identify=!modes.identify;
            modes.select=false;
            setHoverFeature(null, null);
            map.getContainer().style.cursor='';
            toggleMenu('menu-utils');
            alert(modes.identify?"Modo Info ON":"Modo Info OFF");
        }
        function changeColor(id, c) { const l=layers.find(x=>x.id===id); l.color=c; applySymbology(id, l.symbology.field); scheduleProjectSave(); }
        function changeOpacity(id, o) { const l=layers.find(x=>x.id===id); l.opacity=parseFloat(o); l.leafletL.invoke('setStyle', {fillOpacity: l.opacity}); scheduleProjectSave(); }
        function toggleVis(id, icon) { const l=layers.find(x=>x.id===id); if(map.hasLayer(l.leafletL)){map.removeLayer(l.leafletL); icon.className="fas fa-eye-slash"; l.visible=false;}else{map.addLayer(l.leafletL); icon.className="fas fa-eye"; l.visible=true;} scheduleProjectSave(); }
        function deleteSelectedFeatures() {
            return deleteSelectedOnActive(null);
        }
        function setSelectionTolerance(value) {
            const n = Number(value);
            if (!Number.isFinite(n) || n < 2) return;
            selectionUiState.tolerancePx = Math.max(2, Math.min(40, Math.round(n)));
            const inp = document.getElementById('selection-tolerance');
            if (inp && Number(inp.value) !== selectionUiState.tolerancePx) inp.value = String(selectionUiState.tolerancePx);
        }
        function deleteSelectedOnActive(opts) {
            if(!activeId) {
                if (!(opts && opts.silent)) alert("Selecciona una capa");
                return false;
            }
            const l = layers.find(x=>x.id===activeId);
            if(!l || !l.selectedIds || l.selectedIds.length===0) {
                if (!(opts && opts.silent)) alert("No hay seleccion activa");
                return false;
            }
            if (!ensureLayerEditable(l, 'Borrado de seleccion', opts)) return false;
            if(!(opts && opts.skipConfirm) && !confirm(`Borrar ${l.selectedIds.length} feature(s) seleccionadas?`)) return false;
            const toDelete = l.geojson.features.filter(f => l.selectedIds.includes(f.properties._uid));
            pushUndoOp({ type: 'feature_delete_batch', layerId: l.id, features: cloneObj(toDelete), detail: 'delete-selected' });
            toDelete.forEach((f) => addEditHistory('delete', l, f, 'delete-selected'));
            l.geojson.features = l.geojson.features.filter(f => !l.selectedIds.includes(f.properties._uid));
            l.selectedIds = [];
            refreshLayerFeatures(l);
            updateSelectionUI();
            return true;
        }
        function delLayer(id) {
            if(!confirm("¿Borrar?")) return;
            const l = layers.find(x=>x.id===id);
            if (!l) return;
            const layerIndex = layers.findIndex((x) => x.id === id);
            pushUndoOp({
                type: 'layer_delete',
                layerId: id,
                layerSnapshot: layerSnapshot(l),
                layerIndex,
                prevActiveId: activeId || null,
                detail: 'layer-delete'
            });
            addEditHistory('layer_delete', l, null, 'layer-delete');
            map.removeLayer(l.leafletL);
            layers = layers.filter(x=>x.id!==id);
            syncState();
            scheduleProjectSave();
            if(activeId===id)setActive(layers[0]?layers[0].id:null);else updateLayerList();
        }
        function saveActiveLayer() {
            if(!activeId)return alert("Sin capa"); const l=layers.find(x=>x.id===activeId); let d=l.geojson;
            if(l.selectedIds.length>0 && confirm("¿Guardar SOLO selección?")) d={type:"FeatureCollection",features:l.geojson.features.filter(f=>l.selectedIds.includes(f.properties._uid))};
            const s=JSON.stringify(d); const a=document.createElement('a'); a.href="data:text/json;charset=utf-8,"+encodeURIComponent(s); a.download=l.name+".geojson"; document.body.appendChild(a); a.click(); a.remove();
        }
        function calcMetrics(t) {
            const activeLayer = activeId ? layers.find((x) => x.id === activeId) : null;
            if (activeLayer && !ensureLayerEditable(activeLayer, 'Calculo de metricas')) return;
            if (moduleGIS && typeof moduleGIS.calcMetrics === 'function') {
                return moduleGIS.calcMetrics(moduleCtx(), t);
            }
            if(!activeId)return; const l=layers.find(x=>x.id===activeId); const tg=l.selectedIds.length>0?l.geojson.features.filter(f=>l.selectedIds.includes(f.properties._uid)):l.geojson.features;
            if(!tg.length)return alert("Nada que medir"); loader(true);
            setTimeout(()=>{
                let tot=0; tg.forEach(f=>{ try{ if(t==='area'){const a=turf.area(f);f.properties['AREA_M2']=a.toFixed(2);f.properties['AREA_HA']=(a/10000).toFixed(4);tot+=a;}else{const n=turf.length(f,{units:'kilometers'});f.properties['LEN_KM']=n.toFixed(3);tot+=n;} }catch(e){} });
                renderTable(); loader(false); alert(`Total: ${t==='area'?(tot/10000).toFixed(4)+' ha':tot.toFixed(3)+' km'}`); toggleMenu('menu-gis');
            },50);
        }
        async function runAdvanced(t) {
            const activeLayer = activeId ? layers.find((x) => x.id === activeId) : null;
            if (activeLayer && (t === 'merge') && !ensureLayerEditable(activeLayer, 'Merge')) return;
            if (moduleGIS && typeof moduleGIS.runAdvanced === 'function') {
                return moduleGIS.runAdvanced(moduleCtx(), t);
            }
            if(!activeId)return; const l=layers.find(x=>x.id===activeId); toggleMenu('menu-edit');
            if(t==='clean'){clearSelectionOnActive({ silent: true });}
            else if(t==='explode'){
                loader(true);
                setTimeout(()=>{
                    const g = turf.flatten(l.geojson);
                    const newId = registerDerivedLayer(g, l.name+"_Exp", l);
                    const created = findLayerById(newId);
                    if (created) {
                        pushUndoOp({ type: 'layer_create', layerSnapshot: layerSnapshot(created), layerId: created.id, detail: 'explode' });
                        addEditHistory('create', created, null, 'explode-layer');
                    }
                    loader(false);
                },50);
            }
            else if(t==='merge'){
                if(l.selectedIds.length<2)return alert("Selecciona 2 o más geometrías para unir."); loader(true); setTimeout(()=>{
                    const s=l.geojson.features.filter(f=>l.selectedIds.includes(f.properties._uid));
                    const remaining = l.geojson.features.filter(f=>!l.selectedIds.includes(f.properties._uid));

                    // Use the first selected feature as the base for the union and properties
                    let mergedFeature = s[0];
                    for(let i=1;i<s.length;i++) mergedFeature=turf.union(mergedFeature,s[i]);

                    // Assign properties of the first feature to the merged one
                    // NOTE: This logic assumes property retention of the *first* feature.
                    mergedFeature.properties = s[0].properties;
                    mergedFeature.properties._uid = activeId + '_' + Date.now(); // New UID for the merged feature

                    const beforeSelected = cloneObj(l.selectedIds || []);
                    const removedIds = s.map((f) => f && f.properties ? f.properties._uid : null).filter(Boolean);
                    l.geojson.features=remaining;
                    l.geojson.features.push(mergedFeature);
                    l.selectedIds = []; // Clear selection after merge
                    pushUndoOp({
                        type: 'feature_replace_batch',
                        layerId: l.id,
                        removeIds: removedIds,
                        addFeatures: [cloneObj(mergedFeature)],
                        undoRemoveIds: [mergedFeature.properties._uid],
                        undoAddFeatures: cloneObj(s),
                        undoSelectedIds: beforeSelected,
                        nextSelectedIds: []
                    });
                    addEditHistory('update', l, mergedFeature, { kind: 'merge', removed: removedIds.length, added: 1 });

                    refreshLayerFeatures(l); // Refresh the map layer
                    updateSelectionUI();
                    loader(false);
                },50);
            }
        }
        function renderTable() {
            if (moduleTable && typeof moduleTable.renderTable === 'function') {
                return moduleTable.renderTable(moduleCtx());
            }
            const b=document.querySelector('#attr-table tbody'); b.innerHTML=''; const h=document.querySelector('#attr-table thead'); h.innerHTML='';
            if(!activeId)return; const l=layers.find(x=>x.id===activeId); const fs=l.geojson.features; if(!fs.length)return;
            const p=Object.keys(fs[0].properties).filter(k=>k!=='_uid');
            let hr='<tr>'; p.forEach(k=>hr+=`<th>${k}</th>`); hr+='</tr>'; h.innerHTML=hr;
        }
        async function fetchOSM(t) {
            const b=map.getBounds(); if(map.distance(b.getSouthWest(),b.getNorthEast())>15000)return alert("Área muy grande para consulta OSM"); loader(true);
            const q=t==='building'?`[out:json];(way["building"](${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}););out geom;`:`[out:json];(way["highway"](${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}););out geom;`;
            try{const r=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',body:q});const d=await r.json();const g=osmtogeojson(d);if(g.features.length)registerLayer(g,`OSM ${t}`);else alert("Sin datos");}catch(e){alert("Error OSM");}loader(false);
        }
        document.getElementById('fileInput').addEventListener('change', async e=>{
            const f=e.target.files[0]; if(!f)return; loader(true);
            try{
                const n=f.name;const x=await f.arrayBuffer();
                if(n.endsWith('zip')){const d=await shp(x);Array.isArray(d)?d.forEach(l=>registerLayer(l,l.fileName)):registerLayer(d,n);}
                else{const t=new TextDecoder().decode(x);if(n.includes('json')||n.endsWith('geojson'))registerLayer(JSON.parse(t),n);else if(n.endsWith('kml'))registerLayer(omnivore.kml.parse(t).toGeoJSON(),n);else if(n.endsWith('gpx'))registerLayer(omnivore.gpx.parse(t).toGeoJSON(),n);}
            }catch(e){alert("Error archivo");}loader(false);e.target.value='';
        });
        function locateUser(){map.locate({setView:true,maxZoom:18});map.once('locationfound',e=>L.marker(e.latlng).addTo(map).bindPopup("Tú").openPopup());}
        map.on('click', (e) => {
            if (!modes.select || !activeId || !e || !e.latlng) return;
            const l = findLayerById(activeId);
            if (!l) return;
            const candidate = findNearestFeatureAt(e.latlng, selectionUiState.tolerancePx);
            if (!candidate || !candidate.uid) return;
            if (l.selectedIds.includes(candidate.uid)) l.selectedIds = l.selectedIds.filter((x) => x !== candidate.uid);
            else l.selectedIds.push(candidate.uid);
            applyFeatureVisualState(l, candidate.uid);
            updateSelectionUI();
        });
    



        function handleUiAction(action, el, evt) {
            if (!action) return;
            const id = el.dataset.layerId;
            const tool = el.dataset.tool;
            switch (action) {
                case 'toggle-dark-mode': return toggleDarkMode();
                case 'toggle-sidebar': return toggleSidebar();
                case 'open-file-input': return document.getElementById('fileInput').click();
                case 'project-set-crs': return setProjectCrs(el.value);
                case 'project-toggle-multi-crs': return setMultiCrsEditing(!!el.checked);
                case 'create-empty-layer': return createEmptyLayer();
                case 'fetch-osm': return fetchOSM(el.dataset.osm);
                case 'toggle-menu': return toggleMenu(el.dataset.menu);
                case 'save-active-layer': return saveActiveLayer();
                case 'toggle-identify': return toggleIdentify();
                case 'toggle-select': return toggleSelectMode();
                case 'select-area': return startAreaSelection();
                case 'select-lasso': return startLassoSelection();
                case 'set-selection-tolerance': return setSelectionTolerance(el.value);
                case 'configure-shortcuts': return openShortcutsEditor();
                case 'shortcuts-save': return saveShortcutsFromEditor();
                case 'shortcuts-close': return closeShortcutsEditor();
                case 'shortcuts-reset': return resetShortcutsToDefault();
                case 'locate-user': return locateUser();
                case 'toggle-move-rotate': return toggleMoveRotate();
                case 'run-advanced': return runAdvanced(tool);
                case 'delete-selected': return deleteSelectedFeatures();
                case 'calc-metrics': return calcMetrics(tool);
                case 'open-process': return openProcessModal(tool);
                case 'run-gis': return runGIS(tool);
                case 'toggle-table': return toggleTable();
                case 'add-new-field': return addNewField();
                case 'open-calculator': return openCalculator();
                case 'table-filter-apply': return moduleTable && moduleTable.applyTableFilter ? moduleTable.applyTableFilter(moduleCtx()) : null;
                case 'table-filter-clear': return moduleTable && moduleTable.clearTableFilter ? moduleTable.clearTableFilter(moduleCtx()) : null;
                case 'execute-process': return executeProcess();
                case 'close-process-modal': return closeProcessModal();
                case 'save-project': return downloadProjectFile();
                case 'open-project-file': return document.getElementById('projectFileInput').click();
                case 'digitize-start': return moduleDigitizing && moduleDigitizing.start ? moduleDigitizing.start(moduleCtx(), el.dataset.mode) : null;
                case 'digitize-stop': return moduleDigitizing && moduleDigitizing.stop ? moduleDigitizing.stop(moduleCtx()) : null;
                case 'digitize-snap': return moduleDigitizing && moduleDigitizing.setSnap ? moduleDigitizing.setSnap(moduleCtx()) : null;
                case 'digitize-tolerance': return moduleDigitizing && moduleDigitizing.setTolerance ? moduleDigitizing.setTolerance(moduleCtx()) : null;
                case 'digitize-ortho': return moduleDigitizing && moduleDigitizing.setOrthogonal ? moduleDigitizing.setOrthogonal(moduleCtx()) : null;
                case 'digitize-parallel': return moduleDigitizing && moduleDigitizing.setParallel ? moduleDigitizing.setParallel(moduleCtx()) : null;
                case 'cad-trim': return moduleDigitizing && moduleDigitizing.adjustSelectedLines ? moduleDigitizing.adjustSelectedLines(moduleCtx(), 'trim') : null;
                case 'cad-extend': return moduleDigitizing && moduleDigitizing.adjustSelectedLines ? moduleDigitizing.adjustSelectedLines(moduleCtx(), 'extend') : null;
                case 'qa-clear': return moduleCapture && moduleCapture.clearQA ? moduleCapture.clearQA() : null;
                case 'edit-history-clear': return clearEditHistory();
                case 'edit-history-focus': return focusHistoryEvent(el.dataset.historyIndex);
                case 'edit-undo': return undoEdit();
                case 'edit-redo': return redoEdit();
                case 'layer-set-active': return setActive(id);
                case 'layer-move-up': return moveLayer(id, 'up');
                case 'layer-move-down': return moveLayer(id, 'down');
                case 'layer-toggle-lock': return toggleLayerLock(id);
                case 'layer-toggle-settings': return toggleLayerSettings(id);
                case 'layer-set-group': return setLayerGroup(id, el.value);
                case 'layer-set-crs': return setLayerCrs(id, el.value);
                case 'layer-reproject': return reprojectLayerToWgs84(id);
                case 'layer-toggle-vis': return toggleVis(id, el);
                case 'layer-delete': return delLayer(id);
                case 'layer-change-color': return changeColor(id, el.value);
                case 'layer-change-opacity': return changeOpacity(id, el.value);
                case 'layer-apply-symbology': return applySymbology(id, el.value);
                case 'layer-set-label-field': return setLabelField(id, el.value);
                case 'layer-toggle-labels': return toggleLabels(id, !!el.checked);
                case 'layer-edit-template': return moduleCapture && moduleCapture.editTemplate ? moduleCapture.editTemplate(moduleCtx(), id) : null;
                default: return;
            }
        }

        document.addEventListener('click', (e) => {
            const actionEl = e.target.closest('[data-action]');
            if (!actionEl) return;
            if (actionEl.matches('input,select')) return;
            handleUiAction(actionEl.dataset.action, actionEl, e);
        });
        document.addEventListener('input', (e) => {
            const actionEl = e.target.closest('[data-action]');
            if (!actionEl) return;
            if (!actionEl.matches('input,select')) return;
            handleUiAction(actionEl.dataset.action, actionEl, e);
        });
        document.addEventListener('keydown', (e) => {
            const tag = e.target && e.target.tagName ? String(e.target.tagName).toLowerCase() : '';
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable)) return;
            const key = (e.key || '').toLowerCase();
            if (e.ctrlKey && key === 'z') {
                e.preventDefault();
                undoEdit();
                return;
            }
            if (e.ctrlKey && key === 'y') {
                e.preventDefault();
                redoEdit();
                return;
            }
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            if (key === normalizeShortcutKey(shortcuts.toggleSelect)) {
                e.preventDefault();
                toggleSelectMode();
                return;
            }
            if (key === normalizeShortcutKey(shortcuts.clearSelection)) {
                e.preventDefault();
                clearSelectionOnActive({ silent: true });
                return;
            }
            if (key === normalizeShortcutKey(shortcuts.splitCut)) {
                e.preventDefault();
                enableCutShortcutMode();
                return;
            }
            if (key === normalizeShortcutKey(shortcuts.selectArea)) {
                e.preventDefault();
                startAreaSelection();
                return;
            }
            if (key === normalizeShortcutKey(shortcuts.selectLasso)) {
                e.preventDefault();
                startLassoSelection();
                return;
            }
            if (key === normalizeShortcutKey(shortcuts.deleteSelected)) {
                e.preventDefault();
                deleteSelectedOnActive({ skipConfirm: true, silent: true });
                return;
            }
        });
        window.addEventListener('resize', () => setTimeout(ensureHudLayout, 0));
        document.getElementById('btn-save-project').addEventListener('click', downloadProjectFile);
        document.getElementById('btn-open-project').addEventListener('click', () => document.getElementById('projectFileInput').click());
        document.getElementById('layer-filter').addEventListener('input', (e) => filterActiveLayer(e.target.value || ''));
        document.getElementById('projectFileInput').addEventListener('change', async (e) => {
            const f = e.target.files[0];
            if (!f) return;
            try {
                const txt = await f.text();
                restoreProject(JSON.parse(txt));
                saveProjectToStorage();
            } catch (_) {
                alert('Proyecto invalido');
            }
            e.target.value = '';
        });
        document.getElementById('process-modal').addEventListener('click', (e) => {
            if (e.target.id === 'process-modal') closeProcessModal();
        });
        document.getElementById('shortcuts-modal').addEventListener('click', (e) => {
            if (e.target.id === 'shortcuts-modal') closeShortcutsEditor();
        });
        renderEditHistory();
        renderUndoRedoState();
        setSelectionTolerance(selectionUiState.tolerancePx);
        updateProjectCrsUI();
        updateMultiCrsUI();
        ensureHudLayout();
        loadProjectFromStorage();
        updateProjectCrsUI();
        updateMultiCrsUI();
        syncState();
        if (moduleCapture && typeof moduleCapture.init === 'function') {
            moduleCapture.init(moduleCtx());
        }
        if (moduleDigitizing && typeof moduleDigitizing.init === 'function') {
            moduleDigitizing.init(moduleCtx());
        }
        window.HTMLGISApp = {
            getMap: () => map,
            getLayers: () => layers,
            getActiveId: () => activeId,
            setActive,
            getProjectCrs: () => projectCrs,
            isMultiCrsEditingEnabled: () => multiCrsEditing,
            setProjectCrs: (crsValue, opts) => setProjectCrs(crsValue, opts),
            setMultiCrsEditing: (active, opts) => setMultiCrsEditing(active, opts),
            setLayerLocked: (id, lockedValue, opts) => setLayerLocked(id, lockedValue, opts),
            canEditActiveLayer: () => isLayerEditable(findLayerById(activeId)),
            addFieldToActive: (name, opts) => addFieldToActive(name, opts),
            deleteSelectedOnActive: (opts) => deleteSelectedOnActive(opts),
            applyCutReplacement: (layerId, originalUid, cutFeatures, opts) => {
                const layerObj = findLayerById(layerId);
                return applyCutReplacementOnLayer(layerObj, originalUid, cutFeatures, opts);
            },
            getEditHistory: () => editHistory,
            getEditUndoStack: () => editUndoStack,
            getEditRedoStack: () => editRedoStack,
            undoEdit,
            redoEdit,
            serializeProject,
            saveProjectToStorage,
            loadProjectFromStorage,
            updateLayerList,
            setLayerCrs,
            reprojectLayerToWgs84,
            renderTable
        };




