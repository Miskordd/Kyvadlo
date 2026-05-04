class PendulumRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.angleDeg = 0;
        this.trail = [];
        this.maxTrail = 120;
        this.pivotX = canvas.width / 2;
        this.pivotY = 80;
        this.rodPx = 340;
        this.bobR = 24;
        this.animId = null;
        this._staticT = 0;
        this.staticMode = false;
    }

    resize() {
        // Use offsetWidth/offsetHeight — more reliable than clientWidth in hidden tabs
        const w = this.canvas.offsetWidth || this.canvas.width || 420;
        const h = this.canvas.offsetHeight || this.canvas.height || 620;
        if (w < 10 || h < 10) return; // still hidden, skip
        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w;
            this.canvas.height = h;
        }
        this.pivotX = w / 2;
        this.pivotY = 75;
        this.rodPx = Math.min(w * 0.80, h * 0.80);
        this.bobR = Math.max(22, Math.min(34, this.rodPx * 0.08));
    }

    setAngle(deg) {
        this.angleDeg = deg;
        const rad = deg * Math.PI / 180;
        const bx = this.pivotX + this.rodPx * Math.sin(rad);
        const by = this.pivotY + this.rodPx * Math.cos(rad);
        this.trail.push({ x: bx, y: by });
        if (this.trail.length > this.maxTrail) this.trail.shift();
    }

    clearTrail() { this.trail = []; }

    render() {
        this.resize();
        const ctx = this.ctx;
        const { canvas, pivotX, pivotY, rodPx, bobR, angleDeg } = this;
        const rad = angleDeg * Math.PI / 180;
        const bx = pivotX + rodPx * Math.sin(rad);
        const by = pivotY + rodPx * Math.cos(rad);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        this._drawBg();
        this._drawGrid();
        this._drawEquilibrium();
        this._drawTrail();
        this._drawRod(pivotX, pivotY, bx, by);
        this._drawBob(bx, by);
        this._drawPivot(pivotX, pivotY);
    }

    _drawBg() {
        const { ctx, canvas } = this;
        const grad = ctx.createRadialGradient(canvas.width / 2, 0, 0, canvas.width / 2, 0, canvas.height);
        grad.addColorStop(0, '#0f0f1e');
        grad.addColorStop(1, '#0a0a0f');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    _drawGrid() {
        const { ctx, pivotX, pivotY, rodPx } = this;
        const zones = [
            { angles: [-5, 5], color: 'rgba(74,222,128,0.18)' },
            { angles: [-30, -5, 5, 30].filter((_, i) => i % 2 === 0 ? true : true), color: 'rgba(251,191,36,0.12)' },
        ];
        const allAngles = [-180, -150, -120, -90, -60, -45, -30, -15, -5, 5, 15, 30, 45, 60, 90, 120, 150, 180];
        ctx.save();
        allAngles.forEach(deg => {
            const r = deg * Math.PI / 180;
            const x = pivotX + rodPx * Math.sin(r);
            const y = pivotY + rodPx * Math.cos(r);
            const abs = Math.abs(deg);
            let alpha = 0.1;
            if (abs <= 5) ctx.strokeStyle = `rgba(74,222,128,${alpha + 0.08})`;
            else if (abs <= 30) ctx.strokeStyle = `rgba(251,191,36,${alpha + 0.03})`;
            else if (abs <= 90) ctx.strokeStyle = `rgba(251,146,60,${alpha})`;
            else ctx.strokeStyle = `rgba(248,113,113,${alpha})`;
            ctx.setLineDash([2, 6]);
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(pivotX, pivotY);
            ctx.lineTo(x, y);
            ctx.stroke();

            if (abs % 30 === 0 || abs === 5 || abs === 15) {
                ctx.setLineDash([]);
                ctx.fillStyle = 'rgba(201,168,76,0.35)';
                ctx.font = '10px Raleway, sans-serif';
                ctx.textAlign = deg > 0 ? 'left' : deg < 0 ? 'right' : 'center';
                const lx = pivotX + (rodPx + 18) * Math.sin(r);
                const ly = pivotY + (rodPx + 8) * Math.cos(r);
                ctx.fillText(`${deg}°`, lx, ly);
            }
        });
        ctx.restore();
    }

    _drawEquilibrium() {
        const { ctx, pivotX, pivotY, rodPx } = this;
        ctx.save();
        ctx.setLineDash([5, 6]);
        ctx.strokeStyle = 'rgba(201,168,76,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pivotX, pivotY);
        ctx.lineTo(pivotX, pivotY + rodPx + 28);
        ctx.stroke();
        ctx.restore();
    }

    _drawTrail() {
        if (this.trail.length < 2) return;
        const { ctx, trail } = this;
        ctx.save();
        for (let i = 1; i < trail.length; i++) {
            const alpha = (i / trail.length) * 0.55;
            ctx.strokeStyle = `rgba(201,168,76,${alpha})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
            ctx.lineTo(trail[i].x, trail[i].y);
            ctx.stroke();
        }
        ctx.restore();
    }

    _drawRod(x1, y1, x2, y2) {
        const { ctx } = this;
        ctx.save();
        const grad = ctx.createLinearGradient(x1, y1, x2, y2);
        grad.addColorStop(0, '#8a6820');
        grad.addColorStop(0.5, '#e8c97a');
        grad.addColorStop(1, '#8a6820');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(201,168,76,0.3)';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();
    }

    _drawBob(bx, by) {
        const { ctx, bobR } = this;
        ctx.save();
        ctx.shadowColor = 'rgba(201,168,76,0.7)';
        ctx.shadowBlur = 18;
        const grad = ctx.createRadialGradient(bx - bobR * 0.3, by - bobR * 0.3, 1, bx, by, bobR);
        grad.addColorStop(0, '#f5e199');
        grad.addColorStop(0.4, '#c9a84c');
        grad.addColorStop(1, '#5a3c0a');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(bx, by, bobR, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,220,0.35)';
        ctx.beginPath();
        ctx.ellipse(bx - bobR * 0.35, by - bobR * 0.4, bobR * 0.4, bobR * 0.22, -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,240,180,0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(bx, by, bobR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    _drawPivot(px, py) {
        const { ctx } = this;
        ctx.save();
        ctx.shadowColor = 'rgba(201,168,76,0.9)';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#c9a84c';
        ctx.beginPath();
        ctx.arc(px, py, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#f5e199';
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    startStatic(initAngle = 32) {
        this.staticMode = true;
        const step = () => {
            if (!this.staticMode) return;
            this._staticT += 0.018;
            this.angleDeg = initAngle * Math.cos(this._staticT / 1.4);
            this.render();
            this.animId = requestAnimationFrame(step);
        };
        step();
    }

    stopStatic() {
        this.staticMode = false;
        if (this.animId) { cancelAnimationFrame(this.animId); this.animId = null; }
    }
}
