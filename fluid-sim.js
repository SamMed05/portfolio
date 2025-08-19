(function () {
    // Minimal fluid simulation extracted from script.js
    // Exposes window.FluidSim with functions used by the main script.
    const FluidSim = {
        fluidRunning: false,
        fluidId: null,
        fluidImg: null,
        fluidVx: null,
        fluidVy: null,
        fluidCols: 0,
        fluidRows: 0,
        offscreen: null,
        offctx: null,
        prevMX: 0,
        prevMY: 0,
        lastFluidTime: performance.now(),
        fluidConfig: {
            detail: Number(localStorage.getItem('fluid-detail') ?? 3),
            inertia: Number(localStorage.getItem('fluid-inertia') ?? 70),
            swirl: Number(localStorage.getItem('fluid-swirl') ?? 60),
            flow: Number(localStorage.getItem('fluid-flow') ?? 50)
        }
    };

    function cssToRgb(col) {
        const tmp = document.createElement('canvas').getContext('2d');
        tmp.fillStyle = col; tmp.fillRect(0, 0, 1, 1);
        const d = tmp.getImageData(0, 0, 1, 1).data;
        return [d[0], d[1], d[2]];
    }
    function getActiveColorRgb() {
        const active = getComputedStyle(document.documentElement).getPropertyValue('--cursor-color').trim()
            || getComputedStyle(document.body).getPropertyValue('--primary').trim()
            || '#60a5fa';
        return cssToRgb(active);
    }
    function detailToCell(px) {
        if (px <= 1) return 26;
        if (px === 2) return 20;
        if (px === 3) return 16;
        return 12;
    }

    FluidSim.setupFluid = function setupFluid() {
        const div = detailToCell(FluidSim.fluidConfig.detail);
        const w = Math.max(40, Math.min(260, Math.floor(window.innerWidth / div)));
        const h = Math.max(30, Math.min(220, Math.floor(window.innerHeight / div)));
        FluidSim.fluidCols = w; FluidSim.fluidRows = h;
        FluidSim.fluidImg = new ImageData(w, h);
        FluidSim.fluidVx = new Float32Array(w * h);
        FluidSim.fluidVy = new Float32Array(w * h);
        if (!FluidSim.offscreen) {
            FluidSim.offscreen = document.createElement('canvas');
            FluidSim.offctx = FluidSim.offscreen.getContext('2d');
        }
        FluidSim.offscreen.width = w; FluidSim.offscreen.height = h;
        const [rr, gg, bb] = getActiveColorRgb();
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const dx = (x + 0.5) / w - 0.5;
                const dy = (y + 0.5) / h - 0.5;
                const d = Math.hypot(dx, dy);
                const a = Math.max(0, 1 - d * 2.4);
                const idx = (y * w + x) * 4;
                FluidSim.fluidImg.data[idx + 0] = rr;
                FluidSim.fluidImg.data[idx + 1] = gg;
                FluidSim.fluidImg.data[idx + 2] = bb;
                FluidSim.fluidImg.data[idx + 3] = Math.floor(140 * a);
            }
        }
    };

    FluidSim.addFluidForce = function addFluidForce(mx, my) {
        if (!FluidSim.fluidVx || !FluidSim.fluidVy) return;
        const w = FluidSim.fluidCols, h = FluidSim.fluidRows;
        const x = Math.floor(mx / window.innerWidth * w);
        const y = Math.floor(my / window.innerHeight * h);
        const dx = (mx - FluidSim.prevMX);
        const dy = (my - FluidSim.prevMY);
        const r = 3;
        const [rr, gg, bb] = getActiveColorRgb();
        for (let j = -r; j <= r; j++) {
            for (let i = -r; i <= r; i++) {
                const xx = x + i, yy = y + j;
                if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
                const k = yy * w + xx;
                const fall = 1 - Math.min(1, Math.hypot(i, j) / (r + 0.001));
                if (fall > 0) {
                    const flow = (FluidSim.fluidConfig.flow / 100) * 0.18;
                    FluidSim.fluidVx[k] += dx * flow * fall;
                    FluidSim.fluidVy[k] += dy * flow * fall;
                    const di = k * 4;
                    const mix = 0.35 * fall;
                    const use = [rr, gg, bb];
                    FluidSim.fluidImg.data[di + 0] = Math.min(255, FluidSim.fluidImg.data[di + 0] * (1 - mix) + use[0] * mix);
                    FluidSim.fluidImg.data[di + 1] = Math.min(255, FluidSim.fluidImg.data[di + 1] * (1 - mix) + use[1] * mix);
                    FluidSim.fluidImg.data[di + 2] = Math.min(255, FluidSim.fluidImg.data[di + 2] * (1 - mix) + use[2] * mix);
                    FluidSim.fluidImg.data[di + 3] = Math.min(255, FluidSim.fluidImg.data[di + 3] + Math.floor(34 * fall));
                }
            }
        }
        FluidSim.prevMX = mx; FluidSim.prevMY = my;
    };

    FluidSim.fluidStep = function fluidStep() {
        const fluidCanvas = document.getElementById('fluidCanvas');
        const fctx = fluidCanvas ? fluidCanvas.getContext('2d') : null;
        if (!FluidSim.fluidRunning || !fctx) return;
        const now = performance.now();
        const dt = Math.min((now - FluidSim.lastFluidTime) / 1000, 0.05);
        FluidSim.lastFluidTime = now;
        const w = FluidSim.fluidCols, h = FluidSim.fluidRows;
        const next = new ImageData(w, h);
        const vx2 = new Float32Array(w * h);
        const vy2 = new Float32Array(w * h);
        const omega = new Float32Array(w * h);
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const k = y * w + x;
                const dvx_dy = (FluidSim.fluidVx[(y + 1) * w + x] - FluidSim.fluidVx[(y - 1) * w + x]) * 0.5;
                const dvy_dx = (FluidSim.fluidVy[y * w + (x + 1)] - FluidSim.fluidVy[y * w + (x - 1)]) * 0.5;
                omega[k] = dvy_dx - dvx_dy;
            }
        }
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const k = y * w + x;
                const u = FluidSim.fluidVx[k];
                const v = FluidSim.fluidVy[k];
                let px = x - u * 0.5;
                let py = y - v * 0.5;
                px = Math.max(0, Math.min(w - 1.001, px));
                py = Math.max(0, Math.min(h - 1.001, py));
                const x0 = Math.floor(px), y0 = Math.floor(py);
                const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
                const sx = px - x0, sy = py - y0;
                const i00 = (y0 * w + x0) * 4;
                const i10 = (y0 * w + x1) * 4;
                const i01 = (y1 * w + x0) * 4;
                const i11 = (y1 * w + x1) * 4;
                const di = k * 4;
                for (let c = 0; c < 4; c++) {
                    const v00 = FluidSim.fluidImg.data[i00 + c];
                    const v10 = FluidSim.fluidImg.data[i10 + c];
                    const v01 = FluidSim.fluidImg.data[i01 + c];
                    const v11 = FluidSim.fluidImg.data[i11 + c];
                    const v0 = v00 * (1 - sx) + v10 * sx;
                    const v1 = v01 * (1 - sx) + v11 * sx;
                    next.data[di + c] = v0 * (1 - sy) + v1 * sy;
                }
                let sumx = 0, sumy = 0, cnt = 0;
                for (let jj = -1; jj <= 1; jj++) {
                    for (let ii = -1; ii <= 1; ii++) {
                        const xx = x + ii, yy = y + jj;
                        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
                        const kk = yy * w + xx;
                        sumx += FluidSim.fluidVx[kk];
                        sumy += FluidSim.fluidVy[kk];
                        cnt++;
                    }
                }
                const damp = 0.96 + (FluidSim.fluidConfig.inertia / 100) * 0.04;
                vx2[k] = (sumx / Math.max(1, cnt)) * damp;
                vy2[k] = (sumy / Math.max(1, cnt)) * damp;
            }
        }
        const epsV = (10 + FluidSim.fluidConfig.swirl * 0.25) / Math.max(40, Math.max(w, h));
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const k = y * w + x;
                const dw_dx = (Math.abs(omega[k + 1]) - Math.abs(omega[k - 1])) * 0.5;
                const dw_dy = (Math.abs(omega[(y + 1) * w + x]) - Math.abs(omega[(y - 1) * w + x])) * 0.5;
                const mag = Math.hypot(dw_dx, dw_dy) + 1e-6;
                const Nx = dw_dx / mag;
                const Ny = dw_dy / mag;
                const wv = omega[k];
                const Fx = Ny * wv * epsV;
                const Fy = -Nx * wv * epsV;
                vx2[k] += Fx * dt * 60;
                vy2[k] += Fy * dt * 60;
            }
        }
        for (let i = 3; i < next.data.length; i += 4) {
            next.data[i] = Math.max(0, next.data[i] - 1);
        }
        FluidSim.fluidImg = next;
        FluidSim.fluidVx = vx2; FluidSim.fluidVy = vy2;

        FluidSim.offctx.putImageData(FluidSim.fluidImg, 0, 0);
        fctx.save(); fctx.setTransform(1, 0, 0, 1, 0, 0); fctx.clearRect(0, 0, fluidCanvas.width, fluidCanvas.height); fctx.restore();
        fctx.imageSmoothingEnabled = true; fctx.imageSmoothingQuality = 'high';
        fctx.drawImage(FluidSim.offscreen, 0, 0, window.innerWidth, window.innerHeight);

        FluidSim.fluidId = requestAnimationFrame(FluidSim.fluidStep);
    };

    FluidSim.startFluid = function startFluid() {
        const fluidCanvas = document.getElementById('fluidCanvas');
        const fctx = fluidCanvas ? fluidCanvas.getContext('2d') : null;
        if (!fctx || !fluidCanvas) return;
        if (FluidSim.fluidRunning) return;
        FluidSim.fluidRunning = true;
        try { if (window.FluidSim) FluidSim.setupFluid(); } catch { }
        FluidSim.prevMX = window.innerWidth / 2; FluidSim.prevMY = window.innerHeight / 2;
        FluidSim.lastFluidTime = performance.now();
        FluidSim.fluidStep();
    };

    FluidSim.stopFluid = function stopFluid() {
        const fluidCanvas = document.getElementById('fluidCanvas');
        const fctx = fluidCanvas ? fluidCanvas.getContext('2d') : null;
        if (!fctx || !fluidCanvas) return;
        FluidSim.fluidRunning = false;
        if (FluidSim.fluidId) cancelAnimationFrame(FluidSim.fluidId);
        FluidSim.fluidId = null;
        fctx.save(); fctx.setTransform(1, 0, 0, 1, 0, 0); fctx.clearRect(0, 0, fluidCanvas.width, fluidCanvas.height); fctx.restore();
    };

    // Pointer hook for main script
    document.addEventListener('pointermove', (e) => {
        if (document.body.classList.contains('bg-mode-fluid')) {
            FluidSim.addFluidForce(e.clientX, e.clientY);
        }
    });

    // Expose API
    window.FluidSim = FluidSim;

})();
