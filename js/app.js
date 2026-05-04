/* =====================================================================
   Main Application
   ===================================================================== */

let pendulumRenderer = null;
let chartManager = null;
let compareChartMgr = null;
let simConnection = new SimulationConnection();
let activeSimId = null;
let activeConfigId = null;
let editingConfigId = null;
let configList = [];
let validationTimer = null;
let pendingAngleUpdateTimer = null;

// ── Startup ──────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    initCanvas();
    initCharts();
    initForm();
    initTabs();
    initFilterButtons();
    initEventListeners();
    checkBackendStatus();
    loadConfigurations();
    loadHistory();
    initEducationTab();
    initDualAnimation();
    initCompareTab();
});

// ── Backend status ────────────────────────────────────────────────────

async function checkBackendStatus() {
    try {
        await api.getInfo();
        setStatusIndicator(true);
    } catch (_) {
        setStatusIndicator(false);
    }
}

function setStatusIndicator(online) {
    const dot = document.getElementById('status-dot');
    const label = document.getElementById('status-label');
    if (!dot || !label) return;
    dot.className = 'status-dot ' + (online ? 'online' : 'offline');
    label.textContent = online ? 'Backend online' : 'Backend offline';
}

// ── Tabs ─────────────────────────────────────────────────────────────

function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    document.querySelectorAll('.tab-content').forEach(s => s.classList.toggle('active', s.id === `tab-${tabId}`));
    if (tabId === 'configurations') loadConfigurations();
    if (tabId === 'history') loadHistory();
    if (tabId === 'compare') populateCompareSelect();
    if (tabId === 'simulation') {
        setTimeout(() => {
            if (chartManager) Object.values(chartManager.charts).forEach(c => c.resize());
            // Restart static animation so canvas picks up new dimensions
            if (pendulumRenderer && !activeSimId) {
                pendulumRenderer.stopStatic();
                pendulumRenderer.startStatic(32);
            }
        }, 80);
    }
}

// ── Canvas ────────────────────────────────────────────────────────────

function initCanvas() {
    const canvas = document.getElementById('pendulum-canvas');
    if (!canvas) return;
    pendulumRenderer = new PendulumRenderer(canvas);
    pendulumRenderer.render();
    pendulumRenderer.startStatic(20);
}

// ── Charts ────────────────────────────────────────────────────────────

function initCharts() {
    chartManager = new ChartManager();
    chartManager.init();
}

// ── Configuration Form ────────────────────────────────────────────────

function initForm() {
    const sliders = ['length', 'mass', 'damping', 'initial-angle', 'ang-velocity', 'time-step'];
    sliders.forEach(id => {
        const slider = document.getElementById(`slider-${id}`);
        const num = document.getElementById(`input-${id}`);
        if (!slider || !num) return;
        slider.addEventListener('input', () => { num.value = slider.value; onFormChange(); });
        num.addEventListener('input', () => {
            const v = parseFloat(num.value);
            if (!isNaN(v)) { slider.value = v; onFormChange(); }
        });
    });

    document.getElementById('method-select')?.addEventListener('change', onFormChange);

    // Load presets
    document.getElementById('btn-load-presets')?.addEventListener('click', showPresetsModal);
    document.getElementById('btn-save-config')?.addEventListener('click', saveConfiguration);
    document.getElementById('btn-cancel-edit')?.addEventListener('click', cancelEdit);
    document.getElementById('btn-suggest-rk4')?.addEventListener('click', () => {
        document.getElementById('method-select').value = 'runge_kutta_4';
        onFormChange();
    });
}

function onFormChange() {
    updateAngleZone();
    updateMethodWarning();
    clearTimeout(validationTimer);
    validationTimer = setTimeout(runValidation, 400);
}

function getFormData() {
    return {
        name: document.getElementById('config-name')?.value?.trim() || '',
        description: document.getElementById('config-desc')?.value?.trim() || '',
        length: parseFloat(document.getElementById('slider-length')?.value || 1),
        mass: parseFloat(document.getElementById('slider-mass')?.value || 1),
        damping: parseFloat(document.getElementById('slider-damping')?.value || 0),
        initial_angle: parseFloat(document.getElementById('slider-initial-angle')?.value || 10),
        initial_angular_velocity: parseFloat(document.getElementById('slider-ang-velocity')?.value || 0),
        time_step: parseFloat(document.getElementById('slider-time-step')?.value || 0.01),
        numerical_method: document.getElementById('method-select')?.value || 'runge_kutta_4',
    };
}

function updateAngleZone() {
    const angle = Math.abs(parseFloat(document.getElementById('slider-initial-angle')?.value || 0));
    const bar = document.getElementById('angle-zone-bar');
    const label = document.getElementById('angle-zone-label');
    if (!bar || !label) return;

    bar.style.width = `${Math.min(100, (angle / 180) * 100)}%`;

    if (angle < 5) {
        bar.className = 'zone-fill green';
        label.textContent = `${angle.toFixed(1)}° — Malý uhol: analytické riešenie platné`;
        label.className = 'zone-label green';
    } else if (angle < 30) {
        bar.className = 'zone-fill yellow';
        label.textContent = `${angle.toFixed(1)}° — Stredný uhol: mierne nelineárne`;
        label.className = 'zone-label yellow';
    } else if (angle < 90) {
        bar.className = 'zone-fill orange';
        label.textContent = `${angle.toFixed(1)}° — Veľký uhol: výrazne nelineárne`;
        label.className = 'zone-label orange';
    } else {
        bar.className = 'zone-fill red';
        label.textContent = `${angle.toFixed(1)}° — Extrémna výchylka!`;
        label.className = 'zone-label red';
    }
}

function updateMethodWarning() {
    const angle = Math.abs(parseFloat(document.getElementById('slider-initial-angle')?.value || 0));
    const method = document.getElementById('method-select')?.value;
    const warn = document.getElementById('method-warning');
    if (!warn) return;
    if (angle >= 5 && method === 'analytical') {
        warn.style.display = 'block';
        warn.innerHTML = `⚠️ Analytické riešenie nie je presné pre θ ≥ 5°. <button id="btn-suggest-rk4" class="btn-inline">Zmeniť na RK4</button>`;
        document.getElementById('btn-suggest-rk4')?.addEventListener('click', () => {
            document.getElementById('method-select').value = 'runge_kutta_4';
            onFormChange();
        });
    } else {
        warn.style.display = 'none';
    }
}

async function runValidation() {
    const data = getFormData();
    if (!data.name) return;
    try {
        const result = await api.configurations.validate(data);
        displayCharacteristics(result.characteristics || result);
    } catch (_) {}
}

async function saveConfiguration() {
    const data = getFormData();
    if (!data.name) { showToast('Zadaj názov konfigurácie.', 'error'); return; }

    const btn = document.getElementById('btn-save-config');
    btn.disabled = true; btn.textContent = 'Ukladám...';

    try {
        let result;
        if (editingConfigId) {
            result = await api.configurations.update(editingConfigId, data);
            showToast('Konfigurácia aktualizovaná.', 'success');
            cancelEdit();
        } else {
            result = await api.configurations.create(data);
            showToast('Konfigurácia uložená.', 'success');
        }

        displayBackendWarnings(result.warnings || [], result.info || []);
        displayCharacteristics(result.characteristics);
        loadConfigurations();
        clearFormAfterSave();
    } catch (err) {
        showToast(`Chyba: ${err.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = editingConfigId ? 'Aktualizovať' : 'Uložiť konfiguráciu';
    }
}

function clearFormAfterSave() {
    document.getElementById('config-name').value = '';
    document.getElementById('config-desc').value = '';
}

function cancelEdit() {
    editingConfigId = null;
    const btn = document.getElementById('btn-save-config');
    if (btn) btn.textContent = 'Uložiť konfiguráciu';
    document.getElementById('btn-cancel-edit').style.display = 'none';
    document.getElementById('form-title').textContent = 'Nová konfigurácia';
    clearFormAfterSave();
}

function displayCharacteristics(chars) {
    if (!chars) return;
    const el = document.getElementById('characteristics-panel');
    if (!el) return;
    el.style.display = 'block';
    const fmt = (v) => v != null ? (typeof v === 'number' ? v.toFixed(4) : v) : '—';
    el.innerHTML = `
        <div class="chars-grid">
            <div class="char-item"><span class="char-label">Perióda T₀</span><span class="char-val">${fmt(chars.small_angle_period)} s</span></div>
            <div class="char-item"><span class="char-label">Frekvencia f₀</span><span class="char-val">${fmt(chars.small_angle_frequency)} Hz</span></div>
            <div class="char-item"><span class="char-label">Typ oscilácií</span><span class="char-val type-badge ${chars.oscillation_type}">${chars.oscillation_type === 'small_angle' ? 'Malý uhol' : 'Veľký uhol'}</span></div>
            <div class="char-item"><span class="char-label">Typ tlmenia</span><span class="char-val">${fmt(chars.damping_type)}</span></div>
            <div class="char-item"><span class="char-label">Koef. útlmu γ</span><span class="char-val">${fmt(chars.damping_coefficient)}</span></div>
            <div class="char-item"><span class="char-label">Prirodz. freq. ω₀</span><span class="char-val">${fmt(chars.natural_frequency)} rad/s</span></div>
            <div class="char-item"><span class="char-label">Počiat. energia</span><span class="char-val">${fmt(chars.initial_energy)} J</span></div>
            ${chars.approximate_period ? `<div class="char-item"><span class="char-label">Aprox. perióda</span><span class="char-val">${fmt(chars.approximate_period)} s</span></div>` : ''}
        </div>`;
}

function displayBackendWarnings(warnings, info) {
    const warnEl = document.getElementById('backend-warnings');
    const infoEl = document.getElementById('backend-info');
    if (warnEl) {
        warnEl.style.display = warnings.length ? 'block' : 'none';
        warnEl.innerHTML = warnings.map(w => `<div class="warn-item">⚠️ ${w}</div>`).join('');
    }
    if (infoEl) {
        infoEl.style.display = info.length ? 'block' : 'none';
        infoEl.innerHTML = info.map(i => `<div class="info-item">ℹ️ ${i}</div>`).join('');
    }
}

function populateFormForEdit(cfg) {
    editingConfigId = cfg.config_id;
    const p = cfg.parameters;
    document.getElementById('config-name').value = cfg.name || '';
    document.getElementById('config-desc').value = cfg.description || '';
    setSlider('length', p.length);
    setSlider('mass', p.mass);
    setSlider('damping', p.damping);
    setSlider('initial-angle', p.initial_angle);
    setSlider('ang-velocity', p.initial_angular_velocity);
    setSlider('time-step', p.time_step);
    document.getElementById('method-select').value = p.numerical_method;
    document.getElementById('form-title').textContent = 'Upraviť konfiguráciu';
    document.getElementById('btn-save-config').textContent = 'Aktualizovať';
    document.getElementById('btn-cancel-edit').style.display = 'inline-flex';
    onFormChange();
    switchTab('configurations');
    document.getElementById('tab-configurations').scrollIntoView({ behavior: 'smooth' });
}

function setSlider(id, value) {
    const s = document.getElementById(`slider-${id}`);
    const n = document.getElementById(`input-${id}`);
    if (s) s.value = value;
    if (n) n.value = value;
}

// ── Presets ───────────────────────────────────────────────────────────

let _loadedPresets = [];

async function showPresetsModal() {
    try {
        const res = await api.getPresets();
        // backend returns { presets: [...] }
        _loadedPresets = res.presets || res;
        const modal = document.getElementById('presets-modal');
        const list = document.getElementById('presets-list');
        list.innerHTML = _loadedPresets.map((p, i) => {
            // params are top-level on preset objects (no nested .parameters)
            const params = p.parameters || p;
            return `
            <div class="preset-card" onclick="loadPresetByIndex(${i})">
                <div class="preset-name">${escHtml(p.name)}</div>
                <div class="preset-desc">${escHtml(p.description || '')}</div>
                <div class="preset-params">θ₀=${params.initial_angle}° | L=${params.length}m | ${params.numerical_method}</div>
            </div>`;
        }).join('');
        modal.style.display = 'flex';
    } catch (err) {
        showToast(`Chyba načítavania presetov: ${err.message}`, 'error');
    }
}

function loadPresetByIndex(i) {
    const p = _loadedPresets[i];
    if (!p) return;
    loadPreset(p.config_id || '', p.parameters || p);
}

function loadPreset(id, params) {
    setSlider('length', params.length);
    setSlider('mass', params.mass);
    setSlider('damping', params.damping);
    setSlider('initial-angle', params.initial_angle);
    setSlider('ang-velocity', params.initial_angular_velocity || 0);
    setSlider('time-step', params.time_step || 0.01);
    document.getElementById('method-select').value = params.numerical_method;
    closeModal('presets-modal');
    onFormChange();
}

// ── Configuration List ────────────────────────────────────────────────

function initFilterButtons() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderConfigList(btn.dataset.filter);
        });
    });
}

async function loadConfigurations() {
    try {
        const res = await api.configurations.getAll();
        configList = res.configurations || res;
        renderConfigList(getActiveFilter());
    } catch (err) {
        document.getElementById('config-list').innerHTML = `<div class="empty-state">Backend nedostupný: ${err.message}</div>`;
    }
}

function getActiveFilter() {
    return document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
}

function renderConfigList(filter = 'all') {
    const list = document.getElementById('config-list');
    if (!list) return;
    let items = configList;
    if (filter === 'small') items = items.filter(c => c.characteristics?.oscillation_type === 'small_angle');
    if (filter === 'large') items = items.filter(c => c.characteristics?.oscillation_type === 'large_angle');

    if (!items.length) {
        list.innerHTML = '<div class="empty-state">Žiadne konfigurácie. Vytvor prvú!</div>';
        return;
    }

    list.innerHTML = items.map(cfg => {
        const type = cfg.characteristics?.oscillation_type || '';
        const p = cfg.parameters || {};
        const chars = cfg.characteristics || {};
        const badge = type === 'small_angle' ? '<span class="badge green">Malý uhol</span>' :
                      type === 'large_angle' ? '<span class="badge red">Veľký uhol</span>' : '';
        return `
            <div class="config-card ${type}" data-id="${cfg.config_id}">
                <div class="config-card-header">
                    <span class="config-name">${escHtml(cfg.name)}</span>
                    ${badge}
                </div>
                ${cfg.description ? `<div class="config-desc-text">${escHtml(cfg.description)}</div>` : ''}
                <div class="config-params">
                    <span>L=${p.length ?? '?'}m</span>
                    <span>m=${p.mass ?? '?'}kg</span>
                    <span>θ₀=${p.initial_angle ?? '?'}°</span>
                    <span>c=${p.damping ?? '?'}</span>
                    <span>${p.numerical_method ?? '?'}</span>
                </div>
                <div class="config-chars">
                    <span>T₀=${(chars.small_angle_period ?? 0).toFixed(3)}s</span>
                    ${chars.approximate_period ? `<span>T≈${chars.approximate_period.toFixed(3)}s</span>` : ''}
                    <span>E₀=${(chars.initial_energy ?? 0).toFixed(3)}J</span>
                    <span>Spustení: ${cfg.times_simulated ?? 0}</span>
                </div>
                <div class="config-actions">
                    <button class="btn-small btn-primary" onclick="openSimulationPanel('${cfg.config_id}')">▶ Spustiť</button>
                    <button class="btn-small btn-secondary" onclick="editConfig('${cfg.config_id}')">✏️ Upraviť</button>
                    <button class="btn-small btn-secondary" onclick="duplicateConfig('${cfg.config_id}')">📋 Duplikovať</button>
                    <button class="btn-small btn-secondary" onclick="compareConfig('${cfg.config_id}')">⚖️ Porovnať</button>
                    <button class="btn-small btn-danger" onclick="deleteConfig('${cfg.config_id}')">🗑️ Zmazať</button>
                </div>
            </div>`;
    }).join('');
}

async function deleteConfig(id) {
    if (!confirm('Naozaj zmazať túto konfiguráciu?')) return;
    try {
        await api.configurations.delete(id);
        showToast('Konfigurácia zmazaná.', 'success');
        loadConfigurations();
    } catch (err) { showToast(`Chyba: ${err.message}`, 'error'); }
}

async function editConfig(id) {
    try {
        const cfg = await api.configurations.getOne(id);
        populateFormForEdit(cfg);
    } catch (err) { showToast(`Chyba: ${err.message}`, 'error'); }
}

async function duplicateConfig(id) {
    try {
        await api.configurations.duplicate(id);
        showToast('Konfigurácia duplikovaná.', 'success');
        loadConfigurations();
    } catch (err) { showToast(`Chyba: ${err.message}`, 'error'); }
}

// ── Simulation Panel ──────────────────────────────────────────────────

function openSimulationPanel(configId) {
    activeConfigId = configId;
    const cfg = configList.find(c => c.config_id === configId);
    if (cfg) {
        const el = document.getElementById('sim-config-name');
        if (el) el.textContent = cfg.name;
    }
    document.getElementById('selected-config-id').value = configId;
    switchTab('simulation');
}

function initEventListeners() {
    document.getElementById('btn-start-sim')?.addEventListener('click', startSimulation);
    document.getElementById('btn-stop-sim')?.addEventListener('click', stopSimulation);
    document.getElementById('btn-reset-sim')?.addEventListener('click', resetSimulation);
    document.getElementById('btn-compare-analytical')?.addEventListener('click', () => {
        if (activeConfigId) compareConfig(activeConfigId);
    });
    document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target === el) el.closest('.modal')?.style && (el.closest('.modal').style.display = 'none');
            const modal = el.closest('.modal');
            if (modal) modal.style.display = 'none';
        });
    });
}

async function startSimulation() {
    const configId = document.getElementById('selected-config-id')?.value || activeConfigId;
    const duration = parseFloat(document.getElementById('sim-duration')?.value || 20);

    if (!configId) { showToast('Vyber konfiguráciu.', 'error'); return; }
    if (activeSimId) { stopSimulation(); }

    try {
        const result = await api.simulations.start(configId, duration);
        activeSimId = result.simulation_id;
        connectWebSocket(result.simulation_id);
        setSimControls('running');
        showToast(`Simulácia spustená: ${result.config_name}`, 'success');
        chartManager.clear();
        pendulumRenderer?.clearTrail();
        pendulumRenderer?.stopStatic();
    } catch (err) {
        showToast(`Chyba spustenia: ${err.message}`, 'error');
    }
}

async function stopSimulation() {
    if (!activeSimId) return;
    try {
        await api.simulations.stop(activeSimId);
    } catch (_) {}
    simConnection.disconnect();
    activeSimId = null;
    setSimControls('idle');
    showToast('Simulácia zastavená.', 'info');
}

function resetSimulation() {
    stopSimulation();
    chartManager?.clear();
    pendulumRenderer?.clearTrail();
    pendulumRenderer?.stopStatic();
    pendulumRenderer?.startStatic(20);
    clearLiveValues();
}

function connectWebSocket(simId) {
    simConnection.clearAll();
    simConnection.connect(simId);

    simConnection.on('setup', (msg) => {
        updateSimInfo(msg);
    });

    simConnection.on('data', (msg) => {
        pendulumRenderer?.stopStatic();
        pendulumRenderer?.setAngle(msg.angle);
        pendulumRenderer?.render();
        chartManager?.push(msg.time, msg.angle, msg.angular_velocity, msg.kinetic_energy, msg.potential_energy, msg.total_energy);
        updateLiveValues(msg);
    });

    simConnection.on('turning_point', (msg) => {
        const el = document.getElementById('val-turning');
        if (el) el.textContent = `${msg.time.toFixed(3)}s (${msg.side}, max: ${msg.max_angle?.toFixed(2)}°)`;
        chartManager?.pushTurningPoint(msg.time);
    });

    simConnection.on('completed', (msg) => {
        setSimControls('idle');
        activeSimId = null;
        displayCompletedStats(msg);
        showToast('Simulácia dokončená.', 'success');
        loadHistory();
    });

    simConnection.on('error', () => {
        setSimControls('idle');
        showToast('Chyba WebSocket spojenia.', 'error');
    });
}

function updateSimInfo(setup) {
    const el = document.getElementById('sim-info-panel');
    if (!el) return;
    const p = setup.parameters || {};
    const c = setup.characteristics || {};
    el.innerHTML = `
        <span>Metóda: <b>${p.method}</b></span>
        <span>Trvanie: <b>${setup.duration}s</b></span>
        <span>Typ: <b>${c.oscillation_type === 'small_angle' ? 'Malý uhol' : 'Veľký uhol'}</b></span>
        <span>T₀: <b>${(c.small_angle_period || 0).toFixed(3)}s</b></span>
    `;
}

function updateLiveValues(msg) {
    const set = (id, val, unit = '') => {
        const el = document.getElementById(id);
        if (el) el.textContent = (typeof val === 'number' ? val.toFixed(4) : val) + unit;
    };
    set('val-time', msg.time, 's');
    set('val-angle', msg.angle, '°');
    set('val-omega', msg.angular_velocity, ' rad/s');
    set('val-alpha', msg.angular_acceleration, ' rad/s²');
    set('val-ek', msg.kinetic_energy, ' J');
    set('val-ep', msg.potential_energy, ' J');
    set('val-et', msg.total_energy, ' J');
    set('val-loss', msg.damping_loss, ' J');
}

function clearLiveValues() {
    ['val-time','val-angle','val-omega','val-alpha','val-ek','val-ep','val-et','val-loss','val-turning'].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = '—';
    });
}

function displayCompletedStats(msg) {
    const el = document.getElementById('completed-stats');
    if (!el) return;
    el.style.display = 'block';
    el.innerHTML = `
        <div class="stats-row">
            <span>Celkový čas: <b>${msg.total_time?.toFixed(2)}s</b></span>
            <span>Kroky: <b>${msg.total_steps}</b></span>
            <span>Oscilácie: <b>${msg.oscillations_count}</b></span>
            <span>Priemerná perióda: <b>${msg.average_period?.toFixed(4)}s</b></span>
            <span>Strata energie: <b>${msg.energy_loss?.toFixed(4)}J</b></span>
            <span>Záverečný uhol: <b>${msg.final_angle?.toFixed(3)}°</b></span>
        </div>`;
}

function setSimControls(state) {
    const startBtn = document.getElementById('btn-start-sim');
    const stopBtn = document.getElementById('btn-stop-sim');
    const statusEl = document.getElementById('sim-status');
    if (state === 'running') {
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
        if (statusEl) { statusEl.textContent = 'Beží'; statusEl.className = 'sim-status running'; }
    } else {
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        if (statusEl) { statusEl.textContent = 'Pripravená'; statusEl.className = 'sim-status idle'; }
    }
}

// ── Compare Methods ───────────────────────────────────────────────────

function initCompareTab() {
    compareChartMgr = new CompareChartManager();
    compareChartMgr.init('chart-compare');
    document.getElementById('btn-start-compare')?.addEventListener('click', runComparison);
    document.getElementById('compare-config-select')?.addEventListener('change', (e) => {
        activeConfigId = e.target.value || activeConfigId;
    });
}

async function compareConfig(configId) {
    switchTab('compare');
    const sel = document.getElementById('compare-config-select');
    if (sel) {
        await populateCompareSelect();
        sel.value = configId;
    }
    activeConfigId = configId;
}

async function populateCompareSelect() {
    const sel = document.getElementById('compare-config-select');
    if (!sel) return;
    try {
        const res = await api.configurations.getAll();
        const list = res.configurations || res;
        sel.innerHTML = '<option value="">— Vyber konfiguráciu —</option>' +
            list.map(c => `<option value="${c.config_id}">${escHtml(c.name)} (θ₀=${c.parameters?.initial_angle}°)</option>`).join('');
    } catch (_) {}
}

async function runComparison() {
    const configId = document.getElementById('compare-config-select')?.value || activeConfigId;
    const duration = parseFloat(document.getElementById('compare-duration')?.value || 15);
    if (!configId) { showToast('Vyber konfiguráciu.', 'error'); return; }

    const btn = document.getElementById('btn-start-compare');
    if (btn) { btn.disabled = true; btn.textContent = 'Načítavam...'; }

    try {
        const compareData = await api.configurations.compare(configId);
        compareChartMgr.clear();

        const colors = { euler: '#f87171', runge_kutta_2: '#fb923c', runge_kutta_4: '#4a9eff', analytical: '#4ade80' };
        const methodNames = { euler: 'Euler', runge_kutta_2: 'RK2', runge_kutta_4: 'RK4', analytical: 'Analytická' };

        const resultsEl = document.getElementById('compare-results');
        if (resultsEl) {
            resultsEl.style.display = 'block';
            resultsEl.innerHTML = '<div class="compare-info">Porovnanie vygenerované backendom.</div>';
        }

        if (compareData.comparisons) {
            for (const [method, data] of Object.entries(compareData.comparisons)) {
                if (data.time_series && data.time_series.length) {
                    compareChartMgr.addSeries(method, methodNames[method] || method, colors[method] || '#c9a84c');
                    data.time_series.forEach(pt => compareChartMgr.pushPoint(method, pt.time, pt.angle));
                }
            }
        } else {
            await runComparisonLive(configId, duration, colors, methodNames);
        }
    } catch (err) {
        await runComparisonLive(configId, duration,
            { euler: '#f87171', runge_kutta_4: '#4a9eff', analytical: '#4ade80' },
            { euler: 'Euler', runge_kutta_4: 'RK4', analytical: 'Analytická' });
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Spustiť porovnanie'; }
    }
}

async function runComparisonLive(configId, duration, colors, names) {
    const cfg = await api.configurations.getOne(configId);
    compareChartMgr.clear();

    const methods = ['euler', 'runge_kutta_4', 'analytical'];
    const connections = [];

    for (const method of methods) {
        try {
            const modifiedCfg = {
                ...cfg.parameters,
                name: `${cfg.name} [${method}]`,
                numerical_method: method
            };
            const newCfg = await api.configurations.create(modifiedCfg);
            const simRes = await api.simulations.start(newCfg.config_id, duration);
            compareChartMgr.addSeries(simRes.simulation_id, names[method] || method, colors[method] || '#c9a84c');

            const conn = new SimulationConnection();
            connections.push(conn);
            conn.connect(simRes.simulation_id);
            conn.on('data', (msg) => compareChartMgr.pushPoint(simRes.simulation_id, msg.time, msg.angle));
        } catch (_) {}
    }

    const infoEl = document.getElementById('compare-results');
    if (infoEl) {
        infoEl.style.display = 'block';
        infoEl.innerHTML = `<div class="compare-info">Spustené ${methods.length} simulácií paralelne. Grafy sa aktualizujú v reálnom čase.</div>`;
    }
}

// ── Education Tab ─────────────────────────────────────────────────────

function initEducationTab() {
    initSineChart('chart-sine-approx');
    initIsochronismChart('chart-isochronism');

    const slider = document.getElementById('edu-angle-slider');
    const display = document.getElementById('edu-angle-display');
    const errorEl = document.getElementById('edu-approx-error');
    if (slider) {
        slider.addEventListener('input', () => {
            const deg = parseFloat(slider.value);
            const rad = deg * Math.PI / 180;
            const err = Math.abs(Math.sin(rad) - rad) / (Math.abs(Math.sin(rad)) || 1) * 100;
            if (display) display.textContent = `θ = ${deg}°`;
            if (errorEl) {
                errorEl.textContent = `Chyba aproximácie sin(θ) ≈ θ: ${err.toFixed(3)}%`;
                errorEl.className = 'approx-error ' + (deg < 5 ? 'green' : deg < 30 ? 'yellow' : 'red');
            }
        });
        slider.dispatchEvent(new Event('input'));
    }

    document.querySelectorAll('.edu-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const angle = parseFloat(btn.dataset.angle);
            if (!isNaN(angle)) {
                setSlider('initial-angle', angle);
                if (btn.classList.contains('looping-btn')) {
                    document.getElementById('method-select').value = 'runge_kutta_4';
                    setSlider('time-step', 0.005);
                }
                onFormChange();
                switchTab('configurations');
            }
        });
    });
}

// ── Dual-pendulum animation (education tab) ───────────────────────────

const _dualAnim = {
    animId: null,
    running: false,
    t: 0,
    theta0: 30 * Math.PI / 180,
    // state: exact (RK4 full nonlinear), linear (analytical linearized)
    exactTheta: 0,
    exactOmega: 0,
    linearTheta: 0,
    linearOmega: 0,
};

const G_ANIM = 9.81;
const L_ANIM = 1.0;
const DT_ANIM = 0.008; // simulation step
const SEND_EVERY = 2;   // render every N sim steps

function _dualRK4Step(theta, omega) {
    function deriv(th, om) {
        return [om, -(G_ANIM / L_ANIM) * Math.sin(th)];
    }
    const [k1t, k1w] = deriv(theta, omega);
    const [k2t, k2w] = deriv(theta + k1t * DT_ANIM / 2, omega + k1w * DT_ANIM / 2);
    const [k3t, k3w] = deriv(theta + k2t * DT_ANIM / 2, omega + k2w * DT_ANIM / 2);
    const [k4t, k4w] = deriv(theta + k3t * DT_ANIM, omega + k3w * DT_ANIM);
    return [
        theta + DT_ANIM * (k1t + 2*k2t + 2*k3t + k4t) / 6,
        omega + DT_ANIM * (k1w + 2*k2w + 2*k3w + k4w) / 6,
    ];
}

function _dualLinearStep(theta0, t) {
    const omega0 = Math.sqrt(G_ANIM / L_ANIM);
    const theta = theta0 * Math.cos(omega0 * t);
    const omega = -theta0 * omega0 * Math.sin(omega0 * t);
    return [theta, omega];
}

function _drawDualCanvas() {
    const canvas = document.getElementById('canvas-compare-anim');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const half = W / 2;
    const pivotY = 40;
    const rodLen = H - 70;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, W, H);

    // divider
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(half, 0); ctx.lineTo(half, H); ctx.stroke();
    ctx.setLineDash([]);

    // labels
    ctx.font = '11px Raleway, sans-serif';
    ctx.fillStyle = '#c9a84c';
    ctx.textAlign = 'center';
    ctx.fillText('Presné (sin θ)', half / 2, 14);
    ctx.fillStyle = '#4a9eff';
    ctx.fillText('Linearizované (θ)', half + half / 2, 14);

    function drawPendulum(cx, theta, color) {
        const bx = cx + rodLen * Math.sin(theta);
        const by = pivotY + rodLen * Math.cos(theta);
        // rod
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx, pivotY); ctx.lineTo(bx, by); ctx.stroke();
        // bob
        ctx.shadowColor = color; ctx.shadowBlur = 12;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(bx, by, 12, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        // pivot
        ctx.fillStyle = '#888'; ctx.beginPath(); ctx.arc(cx, pivotY, 5, 0, Math.PI * 2); ctx.fill();
        // equilibrium line
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.moveTo(cx, pivotY); ctx.lineTo(cx, pivotY + rodLen + 10); ctx.stroke();
        ctx.setLineDash([]);
    }

    drawPendulum(half / 2, _dualAnim.exactTheta, '#c9a84c');
    drawPendulum(half + half / 2, _dualAnim.linearTheta, '#4a9eff');

    // live stats
    const exactDeg = (_dualAnim.exactTheta * 180 / Math.PI).toFixed(2);
    const linearDeg = (_dualAnim.linearTheta * 180 / Math.PI).toFixed(2);
    const diffDeg = Math.abs(_dualAnim.exactTheta - _dualAnim.linearTheta) * 180 / Math.PI;
    const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setEl('anim-exact-angle', `${exactDeg}°`);
    setEl('anim-linear-angle', `${linearDeg}°`);
    setEl('anim-diff-angle', `${diffDeg.toFixed(2)}°`);
    setEl('anim-time-display', `${_dualAnim.t.toFixed(2)} s`);
}

function initDualAnimation() {
    const slider = document.getElementById('anim-angle-slider');
    const display = document.getElementById('anim-angle-display');
    const errEl = document.getElementById('anim-phase-error');

    function resetState() {
        _dualAnim.t = 0;
        _dualAnim.exactTheta = _dualAnim.theta0;
        _dualAnim.exactOmega = 0;
        [_dualAnim.linearTheta, _dualAnim.linearOmega] = _dualLinearStep(_dualAnim.theta0, 0);
        _drawDualCanvas();
    }

    function updateAngle() {
        const deg = parseFloat(slider.value);
        _dualAnim.theta0 = deg * Math.PI / 180;
        if (display) display.textContent = `${deg}°`;
        const sinVal = Math.sin(_dualAnim.theta0);
        const linVal = _dualAnim.theta0;
        const errPct = Math.abs(sinVal - linVal) / (Math.abs(sinVal) || 1) * 100;
        if (errEl) {
            errEl.textContent = `Chyba linearizácie sin(θ) ≈ θ: ${errPct.toFixed(2)}%`;
            errEl.className = 'approx-error ' + (deg < 5 ? 'green' : deg < 30 ? 'yellow' : 'red');
        }
        resetState();
    }

    if (slider) { slider.addEventListener('input', updateAngle); updateAngle(); }

    function loop() {
        if (!_dualAnim.running) return;
        for (let i = 0; i < SEND_EVERY; i++) {
            [_dualAnim.exactTheta, _dualAnim.exactOmega] = _dualRK4Step(_dualAnim.exactTheta, _dualAnim.exactOmega);
            _dualAnim.t += DT_ANIM;
            [_dualAnim.linearTheta, _dualAnim.linearOmega] = _dualLinearStep(_dualAnim.theta0, _dualAnim.t);
        }
        _drawDualCanvas();
        _dualAnim.animId = requestAnimationFrame(loop);
    }

    document.getElementById('btn-anim-play')?.addEventListener('click', () => {
        if (_dualAnim.running) return;
        _dualAnim.running = true;
        loop();
    });
    document.getElementById('btn-anim-pause')?.addEventListener('click', () => {
        _dualAnim.running = false;
        cancelAnimationFrame(_dualAnim.animId);
    });
    document.getElementById('btn-anim-reset')?.addEventListener('click', () => {
        _dualAnim.running = false;
        cancelAnimationFrame(_dualAnim.animId);
        resetState();
    });

    resetState();
}

// ── History ───────────────────────────────────────────────────────────

async function loadHistory() {
    const el = document.getElementById('history-list');
    if (!el) return;
    try {
        const res = await api.simulations.getAll({ limit: 50 });
        const sims = res.simulations || res;
        if (!sims.length) {
            el.innerHTML = '<div class="empty-state">Zatiaľ žiadne simulácie.</div>';
            return;
        }
        el.innerHTML = sims.map(s => `
            <div class="history-item ${s.status}">
                <div class="history-main">
                    <span class="history-id">${s.simulation_id}</span>
                    <span class="history-config">${escHtml(s.config_name || s.config_id)}</span>
                    <span class="history-status ${s.status}">${s.status}</span>
                </div>
                <div class="history-details">
                    <span>Trvanie: ${s.duration}s</span>
                    <span>Oscilácie: ${s.oscillations_count ?? '—'}</span>
                    <span>Priemerná perióda: ${s.average_period ? s.average_period.toFixed(4) + 's' : '—'}</span>
                    <span>Strata energie: ${s.energy_loss ? s.energy_loss.toFixed(4) + 'J' : '—'}</span>
                    <span>Spustená: ${formatDate(s.started_at)}</span>
                </div>
            </div>`).join('');
    } catch (err) {
        el.innerHTML = `<div class="empty-state">Chyba: ${err.message}</div>`;
    }
}

// ── Export ────────────────────────────────────────────────────────────

function exportCSV() {
    if (!chartManager || !chartManager.buf.time.length) {
        showToast('Žiadne dáta na export. Najprv spusti simuláciu.', 'error');
        return;
    }
    const b = chartManager.buf;
    const rows = ['time,angle_deg,omega_rad_s,Ek_J,Ep_J,Et_J'];
    for (let i = 0; i < b.time.length; i++) {
        rows.push(`${b.time[i]},${b.angle[i]},${b.omega[i]},${b.Ek[i]},${b.Ep[i]},${b.Et[i]}`);
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pendulum_${Date.now()}.csv`;
    a.click();
    showToast('CSV exportované.', 'success');
}

// ── Utilities ─────────────────────────────────────────────────────────

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3500);
}

function closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.style.display = 'none';
}

function escHtml(str) {
    return (str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function formatDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('sk-SK'); } catch (_) { return iso; }
}
