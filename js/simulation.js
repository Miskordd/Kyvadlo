const WS_BASE = 'ws://localhost:8000';

class SimulationConnection {
    constructor() {
        this.ws = null;
        this.simulationId = null;
        this._cbs = { setup: [], data: [], turning_point: [], completed: [], error: [], close: [], open: [] };
    }

    connect(simulationId) {
        this.disconnect();
        this.simulationId = simulationId;
        this.ws = new WebSocket(`${WS_BASE}/ws/${simulationId}`);

        this.ws.onopen = () => this._emit('open', {});
        this.ws.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                this._emit(msg.type, msg);
            } catch (_) {}
        };
        this.ws.onerror = (e) => this._emit('error', e);
        this.ws.onclose = () => this._emit('close', {});
    }

    disconnect() {
        if (this.ws && this.ws.readyState <= WebSocket.OPEN) {
            this.ws.close();
        }
        this.ws = null;
    }

    on(type, cb) {
        if (this._cbs[type]) this._cbs[type].push(cb);
        return this;
    }

    off(type, cb) {
        if (this._cbs[type]) this._cbs[type] = this._cbs[type].filter(c => c !== cb);
    }

    clearAll() {
        Object.keys(this._cbs).forEach(k => this._cbs[k] = []);
    }

    _emit(type, data) {
        (this._cbs[type] || []).forEach(cb => cb(data));
    }

    get isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }
}
