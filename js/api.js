const API_BASE = 'http://82.25.97.52:8000';

const api = {
    async request(method, endpoint, body = null) {
        const options = { method, headers: { 'Content-Type': 'application/json' } };
        if (body) options.body = JSON.stringify(body);
        const res = await fetch(`${API_BASE}${endpoint}`, options);
        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error(err.detail || 'Request failed');
        }
        if (res.status === 204 || res.headers.get('content-length') === '0') return null;
        return res.json();
    },

    configurations: {
        create: (data) => api.request('POST', '/api/pendulum/configurations', data),
        getAll: (filters = {}) => {
            const p = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '')));
            return api.request('GET', `/api/pendulum/configurations?${p}`);
        },
        getOne: (id) => api.request('GET', `/api/pendulum/configurations/${id}`),
        update: (id, data) => api.request('PUT', `/api/pendulum/configurations/${id}`, data),
        delete: (id) => api.request('DELETE', `/api/pendulum/configurations/${id}`),
        validate: (data) => api.request('POST', '/api/pendulum/configurations/validate', data),
        getHistory: (id) => api.request('GET', `/api/pendulum/configurations/${id}/history`),
        compare: (id) => api.request('GET', `/api/pendulum/configurations/${id}/compare`),
        duplicate: (id) => api.request('POST', `/api/pendulum/configurations/${id}/duplicate`),
    },

    simulations: {
        start: (configId, duration) => api.request('POST', '/api/pendulum/simulations/start', { config_id: configId, duration }),
        getAll: (filters = {}) => {
            const p = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '')));
            return api.request('GET', `/api/pendulum/simulations?${p}`);
        },
        getOne: (id) => api.request('GET', `/api/pendulum/simulations/${id}`),
        stop: (id) => api.request('DELETE', `/api/pendulum/simulations/${id}`),
    },

    getPresets: () => api.request('GET', '/api/pendulum/presets'),
    getInfo: () => api.request('GET', '/api/info'),
};
