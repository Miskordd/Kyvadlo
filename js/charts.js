const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
        legend: { labels: { color: '#b0a88a', font: { size: 11 } } },
        tooltip: { mode: 'index', intersect: false }
    },
    scales: {
        x: {
            type: 'linear',
            ticks: { color: '#7a7060', maxTicksLimit: 8 },
            grid: { color: 'rgba(255,255,255,0.04)' }
        },
        y: {
            ticks: { color: '#7a7060', maxTicksLimit: 6 },
            grid: { color: 'rgba(255,255,255,0.04)' }
        }
    }
};

function makeChartOpts(xLabel, yLabel, extra = {}) {
    return {
        ...CHART_DEFAULTS,
        ...extra,
        plugins: { ...CHART_DEFAULTS.plugins, ...(extra.plugins || {}) },
        scales: {
            x: { ...CHART_DEFAULTS.scales.x, title: { display: true, text: xLabel, color: '#b0a88a', font: { size: 11 } } },
            y: { ...CHART_DEFAULTS.scales.y, title: { display: true, text: yLabel, color: '#b0a88a', font: { size: 11 } } }
        }
    };
}

class ChartManager {
    constructor() {
        this.charts = {};
        this.buf = { time: [], angle: [], omega: [], Ek: [], Ep: [], Et: [] };
        this.MAX = 600;
    }

    init() {
        Chart.defaults.color = '#b0a88a';
        this._initAngle();
        this._initVelocity();
        this._initPhase();
        this._initEnergy();
    }

    _initAngle() {
        const ctx = document.getElementById('chart-angle')?.getContext('2d');
        if (!ctx) return;
        this.charts.angle = new Chart(ctx, {
            type: 'line',
            data: { datasets: [{ label: 'Uhol θ (°)', data: [], borderColor: '#c9a84c', borderWidth: 1.5, pointRadius: 0, tension: 0.3 }] },
            options: makeChartOpts('Čas (s)', 'Uhol (°)')
        });
    }

    _initVelocity() {
        const ctx = document.getElementById('chart-velocity')?.getContext('2d');
        if (!ctx) return;
        this.charts.velocity = new Chart(ctx, {
            type: 'line',
            data: { datasets: [{ label: 'ω (rad/s)', data: [], borderColor: '#4a9eff', borderWidth: 1.5, pointRadius: 0, tension: 0.3 }] },
            options: makeChartOpts('Čas (s)', 'ω (rad/s)')
        });
    }

    _initPhase() {
        const ctx = document.getElementById('chart-phase')?.getContext('2d');
        if (!ctx) return;
        this.charts.phase = new Chart(ctx, {
            type: 'scatter',
            data: { datasets: [{ label: 'θ vs ω', data: [], borderColor: '#ff6b9d', backgroundColor: 'rgba(255,107,157,0.2)', pointRadius: 1, showLine: true, tension: 0 }] },
            options: makeChartOpts('θ (°)', 'ω (rad/s)')
        });
    }

    _initEnergy() {
        const ctx = document.getElementById('chart-energy')?.getContext('2d');
        if (!ctx) return;
        this.charts.energy = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    { label: 'Ek (J)', data: [], borderColor: '#ff6b9d', borderWidth: 1.5, pointRadius: 0, tension: 0.3 },
                    { label: 'Ep (J)', data: [], borderColor: '#4a9eff', borderWidth: 1.5, pointRadius: 0, tension: 0.3 },
                    { label: 'E total (J)', data: [], borderColor: '#c9a84c', borderWidth: 2, pointRadius: 0, tension: 0.3, borderDash: [4, 3] }
                ]
            },
            options: makeChartOpts('Čas (s)', 'Energia (J)')
        });
    }

    push(time, angle, omega, Ek, Ep, Et) {
        const b = this.buf;
        b.time.push(time); b.angle.push(angle); b.omega.push(omega);
        b.Ek.push(Ek); b.Ep.push(Ep); b.Et.push(Et);
        if (b.time.length > this.MAX) {
            const trim = b.time.length - this.MAX;
            ['time','angle','omega','Ek','Ep','Et'].forEach(k => b[k].splice(0, trim));
        }
        this._updateAll();
    }

    _updateAll() {
        const b = this.buf;
        const xy = (yKey) => b.time.map((t, i) => ({ x: t, y: b[yKey][i] }));

        if (this.charts.angle) {
            this.charts.angle.data.datasets[0].data = xy('angle');
            this.charts.angle.update('none');
        }
        if (this.charts.velocity) {
            this.charts.velocity.data.datasets[0].data = xy('omega');
            this.charts.velocity.update('none');
        }
        if (this.charts.phase) {
            this.charts.phase.data.datasets[0].data = b.angle.map((a, i) => ({ x: a, y: b.omega[i] }));
            this.charts.phase.update('none');
        }
        if (this.charts.energy) {
            this.charts.energy.data.datasets[0].data = xy('Ek');
            this.charts.energy.data.datasets[1].data = xy('Ep');
            this.charts.energy.data.datasets[2].data = xy('Et');
            this.charts.energy.update('none');
        }
    }

    clear() {
        ['time','angle','omega','Ek','Ep','Et'].forEach(k => this.buf[k] = []);
        Object.values(this.charts).forEach(c => {
            c.data.datasets.forEach(ds => ds.data = []);
            c.update('none');
        });
    }

    destroy() {
        Object.values(this.charts).forEach(c => c.destroy());
        this.charts = {};
    }
}

class CompareChartManager {
    constructor() {
        this.chart = null;
        this.series = {};
    }

    init(canvasId) {
        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (!ctx) return;
        this.chart = new Chart(ctx, {
            type: 'line',
            data: { datasets: [] },
            options: {
                ...makeChartOpts('Čas (s)', 'Uhol (°)'),
                plugins: {
                    ...CHART_DEFAULTS.plugins,
                    title: { display: true, text: 'Porovnanie metód — Uhol vs. Čas', color: '#c9a84c' }
                }
            }
        });
    }

    addSeries(id, label, color) {
        if (!this.chart) return;
        this.series[id] = { time: [], angle: [] };
        this.chart.data.datasets.push({
            label, data: [], borderColor: color, borderWidth: 2, pointRadius: 0, tension: 0.3
        });
        this.chart.update('none');
    }

    pushPoint(id, time, angle) {
        if (!this.series[id] || !this.chart) return;
        const s = this.series[id];
        s.time.push(time); s.angle.push(angle);
        const idx = Object.keys(this.series).indexOf(id);
        if (idx >= 0 && this.chart.data.datasets[idx]) {
            this.chart.data.datasets[idx].data = s.time.map((t, i) => ({ x: t, y: s.angle[i] }));
            this.chart.update('none');
        }
    }

    clear() {
        this.series = {};
        if (this.chart) { this.chart.data.datasets = []; this.chart.update('none'); }
    }

    destroy() {
        if (this.chart) { this.chart.destroy(); this.chart = null; }
    }
}

// Education: sin vs theta chart
function initSineChart(canvasId) {
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return null;
    const thetaDeg = Array.from({ length: 181 }, (_, i) => i);
    const sinData = thetaDeg.map(d => ({ x: d, y: Math.sin(d * Math.PI / 180) }));
    const linData = thetaDeg.map(d => ({ x: d, y: d * Math.PI / 180 }));
    return new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [
                { label: 'sin(θ) — presná', data: sinData, borderColor: '#4a9eff', borderWidth: 2, pointRadius: 0, tension: 0 },
                { label: 'θ [rad] — aproximácia', data: linData, borderColor: '#f87171', borderWidth: 2, pointRadius: 0, tension: 0, borderDash: [5, 4] }
            ]
        },
        options: {
            ...makeChartOpts('θ (°)', 'Hodnota'),
            plugins: {
                ...CHART_DEFAULTS.plugins,
                title: { display: true, text: 'sin(θ) vs. θ — platnosť linearizácie', color: '#c9a84c' },
                annotation: {}
            }
        }
    });
}

function initIsochronismChart(canvasId) {
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return null;
    const g = 9.81, L = 1.0;
    const T0 = 2 * Math.PI * Math.sqrt(L / g);
    const angles = Array.from({ length: 89 }, (_, i) => i + 1);
    const periods = angles.map(deg => {
        const r = deg * Math.PI / 180;
        const k = Math.sin(r / 2) ** 2;
        return { x: deg, y: T0 * (1 + 0.25 * k + (9 / 64) * k * k) };
    });
    const baseLine = angles.map(d => ({ x: d, y: T0 }));
    return new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [
                { label: `Skutočná perióda (L=${L}m)`, data: periods, borderColor: '#c9a84c', borderWidth: 2, pointRadius: 0, tension: 0 },
                { label: `T₀ = ${T0.toFixed(3)}s (malé uhly)`, data: baseLine, borderColor: '#4ade80', borderWidth: 1.5, pointRadius: 0, tension: 0, borderDash: [5, 4] }
            ]
        },
        options: {
            ...makeChartOpts('Počiatočný uhol θ₀ (°)', 'Perióda T (s)'),
            plugins: {
                ...CHART_DEFAULTS.plugins,
                title: { display: true, text: 'Neizochronizmus — závislosť periódy od amplitúdy', color: '#c9a84c' }
            }
        }
    });
}
