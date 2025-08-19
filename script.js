document.addEventListener("DOMContentLoaded", () => {
    const universe = document.getElementById("universe");
    const navBubbles = document.querySelectorAll(".nav-bubble");
    const sections = document.querySelectorAll(".content-section");
    const backButtons = document.querySelectorAll(".back-btn");
    const backButtonsMobile = document.querySelectorAll(".back-btn-mobile");
    const themeToggle = document.getElementById("theme-toggle");
    const themeIcon = document.getElementById("theme-icon");
    const cursor = document.getElementById("custom-cursor");
    const trailCanvas = document.getElementById("trailCanvas");
    const trailCtx = trailCanvas.getContext("2d");
    const canvas = document.getElementById("particleCanvas");
    const ctx = canvas.getContext("2d");
    const fluidCanvas = document.getElementById("fluidCanvas");
    const fctx = fluidCanvas ? fluidCanvas.getContext("2d") : null;
    const orbitsCanvas = document.getElementById("orbitsCanvas");
    const orbitsCtx = orbitsCanvas.getContext("2d");
    // Particle color (used by drawParticles); must be defined before animate() starts
    const particleColor = "#7dd4fc49";

    // Mouse coordinates (declare early so any early users are safe)
    let mouseX = window.innerWidth / 2,
        mouseY = window.innerHeight / 2;

    // ========== Theme (light/dark) ==========
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") document.body.classList.add("light");
    function syncThemeIcon() {
        const isLight = document.body.classList.contains("light");
        themeIcon.classList.toggle("fa-sun", !isLight);
        themeIcon.classList.toggle("fa-moon", isLight);
    }
    syncThemeIcon();
    themeToggle?.addEventListener("click", () => {
        document.body.classList.toggle("light");
        localStorage.setItem(
            "theme",
            document.body.classList.contains("light") ? "light" : "dark"
        );
        syncThemeIcon();
    });

    // Background particles state (declare early so pauseParticles can access it)
    let particles = [];
    let animationId = null;
    let paused = false;

    // ========== Background mode toggle (particles ↔ fluid) ==========
    const bgToggle = document.getElementById("bg-toggle");
    const bgIcon = document.getElementById("bg-icon");
    const settingsBtn = document.getElementById("bg-settings");
    const settingsPopover = document.getElementById("settings-popover");

    function updateBgIcon() {
        if (!bgIcon) return;
        const fluid = document.body.classList.contains("bg-mode-fluid");
        bgIcon.classList.toggle("fa-water", fluid);
        bgIcon.classList.toggle("fa-braille", !fluid);
        bgToggle?.setAttribute(
            "title",
            fluid ? "Fluid background" : "Particles background"
        );
        bgToggle?.setAttribute(
            "aria-label",
            fluid ? "Fluid background" : "Particles background"
        );
    }
    function setBgMode(mode) {
        document.body.classList.remove("bg-mode-particles", "bg-mode-fluid");
        if (mode === "fluid") {
            document.body.classList.add("bg-mode-fluid");
            localStorage.setItem("bg-mode", "fluid");
            pauseParticles(true);
            if (window.FluidSim && window.FluidSim.startFluid)
                window.FluidSim.startFluid();
        } else {
            document.body.classList.add("bg-mode-particles");
            localStorage.setItem("bg-mode", "particles");
            if (window.FluidSim && window.FluidSim.stopFluid)
                window.FluidSim.stopFluid();
            // re-init to apply latest density
            try {
                initParticles();
            } catch { }
            pauseParticles(false);
        }
        updateBgIcon();
        const isFluid = document.body.classList.contains("bg-mode-fluid");
        document.querySelectorAll("#settings-popover .group").forEach((g) => {
            const forMode = g.getAttribute("data-for");
            g.style.display =
                forMode === (isFluid ? "fluid" : "particles") ? "block" : "none";
        });
    }
    // Persisted configs for particles (fluid config moved to `fluid-sim.js`)
    const particlesDefaults = {
        density: 100, // 50..150
        speed: 100, // 50..150
        link: 100, // 0..150
        mouseRadius: 160, // 40..320
        mouseForce: 100, // percentage 50..200
    };

    const particlesStorageKeys = {
        density: "particles-density",
        speed: "particles-speed",
        link: "particles-link",
        mouseRadius: "particles-mouse-radius",
        mouseForce: "particles-mouse-force",
    };

    function readParticlesConfig() {
        return {
            density: Number(localStorage.getItem(particlesStorageKeys.density) ?? particlesDefaults.density),
            speed: Number(localStorage.getItem(particlesStorageKeys.speed) ?? particlesDefaults.speed),
            link: Number(localStorage.getItem(particlesStorageKeys.link) ?? particlesDefaults.link),
            mouseRadius: Number(localStorage.getItem(particlesStorageKeys.mouseRadius) ?? particlesDefaults.mouseRadius),
            mouseForce: Number(localStorage.getItem(particlesStorageKeys.mouseForce) ?? particlesDefaults.mouseForce),
        };
    }

    function saveParticlesConfig(cfg) {
        localStorage.setItem(particlesStorageKeys.density, String(cfg.density));
        localStorage.setItem(particlesStorageKeys.speed, String(cfg.speed));
        localStorage.setItem(particlesStorageKeys.link, String(cfg.link));
        localStorage.setItem(particlesStorageKeys.mouseRadius, String(cfg.mouseRadius));
        localStorage.setItem(particlesStorageKeys.mouseForce, String(cfg.mouseForce));
    }

    function resetParticlesConfig(cfg) {
        cfg.density = particlesDefaults.density;
        cfg.speed = particlesDefaults.speed;
        cfg.link = particlesDefaults.link;
        cfg.mouseRadius = particlesDefaults.mouseRadius;
        cfg.mouseForce = particlesDefaults.mouseForce;
        saveParticlesConfig(cfg);
    }

    const particlesConfig = readParticlesConfig();

    const savedBg = localStorage.getItem("bg-mode");
    setBgMode(savedBg || "fluid");
    updateBgIcon();
    bgToggle?.addEventListener("click", () => {
        const next = document.body.classList.contains("bg-mode-fluid")
            ? "particles"
            : "fluid";
        setBgMode(next);
    });
    settingsBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!settingsPopover) return;
        const visible = settingsPopover.style.display === "block";
        settingsPopover.style.display = visible ? "none" : "block";
        // Switch visible group based on mode
        const isFluid = document.body.classList.contains("bg-mode-fluid");
        document.querySelectorAll("#settings-popover .group").forEach((g) => {
            const forMode = g.getAttribute("data-for");
            g.style.display =
                forMode === (isFluid ? "fluid" : "particles") ? "block" : "none";
        });
    });
    document.addEventListener("click", (e) => {
        if (!settingsPopover) return;
        if (settingsPopover.style.display !== "block") return;
        if (settingsPopover.contains(e.target)) return;
        if (
            settingsBtn &&
            (e.target === settingsBtn || settingsBtn.contains(e.target))
        )
            return;
        settingsPopover.style.display = "none";
    });

    // ========== Navigation ==========
    function openSection(id) {
        const target = document.getElementById(id);
        if (!target) return;
        sections.forEach((s) => s.classList.remove("active"));
        universe.classList.add("section-active");
        target.classList.add("active");
        pauseParticles(true);
        drawOrbits(); // keep orbits visible behind
        // push a history state so the browser back button returns to the hub (mobile-friendly)
        try {
            history.pushState({ sectionId: id }, "", `#${id}`);
        } catch (e) {
            // ignore if history API unavailable
        }
        // lock cursor color to this section
        const secColor = getComputedStyle(target)
            .getPropertyValue("--primary")
            .trim();
        if (secColor)
            document.documentElement.style.setProperty("--cursor-color", secColor);
        // brief hide of the circle when exit affordance appears
        cursor.classList.add("hide-circle");
        setTimeout(() => cursor.classList.remove("hide-circle"), 220);
    }
    function backToHub() {
        // If there's a pushed section state, prefer letting the browser pop it so popstate handler runs.
        if (history.state && history.state.sectionId) {
            try {
                history.back();
                return; // wait for popstate to call backToHub (which will now run without history.state)
            } catch (e) {
                // fallback to immediate UI update
            }
        }
        universe.classList.remove("section-active");
        sections.forEach((s) => s.classList.remove("active"));
        // Resume particles only when particle mode is active
        if (document.body.classList.contains("bg-mode-particles"))
            pauseParticles(false);
        // reset cursor color back to theme primary
        document.documentElement.style.removeProperty("--cursor-color");
    }
    // Click/drag separation
    const DRAG_THRESHOLD = 6; // px
    navBubbles.forEach((b) => {
        let down = { x: 0, y: 0, drag: false };
        b.addEventListener("pointerdown", (e) => {
            down = { x: e.clientX, y: e.clientY, drag: false };
        });
        b.addEventListener("click", (e) => {
            if (down.drag) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            openSection(b.dataset.target);
        });
        b.addEventListener("pointermove", (e) => {
            if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_THRESHOLD)
                down.drag = true;
        });
    });
    backButtons.forEach((btn) => btn.addEventListener("click", backToHub));
    backButtonsMobile.forEach((btn) => btn.addEventListener("click", backToHub));

    // Close sections with Escape
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") backToHub();
    });

    // ========== Custom cursor + canvas trail ==========
    // mouseX/mouseY declared earlier to avoid TDZ
    let cursorX = mouseX,
        cursorY = mouseY;
    const tail = []; // {x,y,alpha}
    const maxTail = 28; // shorter tail

    function resizeTrailCanvas() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const vw = window.visualViewport?.width ?? window.innerWidth;
        const vh = window.visualViewport?.height ?? window.innerHeight;
        trailCanvas.width = Math.floor(vw * dpr);
        trailCanvas.height = Math.floor(vh * dpr);
        trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resizeTrailCanvas();

    const hoverables = [
        "a",
        "button",
        ".nav-bubble",
        ".back-btn",
        ".back-overlay",
        ".back-btn-mobile",
    ];
    document.addEventListener("mousemove", (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        cursor.style.left = mouseX + "px";
        cursor.style.top = mouseY + "px";
    });

    document.addEventListener("pointerover", (e) => {
        if (hoverables.some((sel) => e.target.closest(sel)))
            cursor.classList.add("cursor-hover");
        // hide the circle when hovering explicit exit zones
        if (e.target.closest(".back-overlay, .back-btn-mobile"))
            cursor.classList.add("hide-circle");
    });
    document.addEventListener("pointerout", (e) => {
        if (hoverables.some((sel) => e.target.closest(sel)))
            cursor.classList.remove("cursor-hover");
        if (e.target.closest(".back-overlay, .back-btn-mobile"))
            cursor.classList.remove("hide-circle");
    });

    // Color the cursor based on hovered bubble
    navBubbles.forEach((b) => {
        b.addEventListener("pointerenter", () => {
            const c = getComputedStyle(b).getPropertyValue("--primary").trim();
            if (c) document.documentElement.style.setProperty("--cursor-color", c);
        });
        b.addEventListener("pointerleave", () => {
            // if a section is open, keep its color; otherwise reset
            if (!universe.classList.contains("section-active")) {
                document.documentElement.style.removeProperty("--cursor-color");
            }
        });
    });

    // utility
    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    // convert hex like #abc, #aabbcc, or #aabbccdd to rgba string (alpha multiplied)
    function hexToRgba(hex, alpha) {
        let h = String(hex || "")
            .replace("#", "")
            .trim();
        if (!h) h = "60a5fa"; // fallback blue
        if (h.length === 3)
            h = h
                .split("")
                .map((c) => c + c)
                .join("");
        // if 8-char hex (r g b a)
        if (h.length === 8) {
            const rgb = h.slice(0, 6);
            const aHex = h.slice(6, 8);
            const bigint = parseInt(rgb, 16);
            const r = (bigint >> 16) & 255;
            const g = (bigint >> 8) & 255;
            const b = bigint & 255;
            const baseA = parseInt(aHex, 16) / 255;
            const outA = Math.max(
                0,
                Math.min(1, baseA * (alpha === undefined ? 1 : alpha))
            );
            return `rgba(${r},${g},${b},${Number(outA.toFixed(3))})`;
        }
        // assume 6-char
        const bigint = parseInt(h.slice(0, 6), 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        const outA = alpha === undefined ? 1 : alpha;
        return `rgba(${r},${g},${b},${outA})`;
    }

    // normalize a color string into an rgba(...) with supplied alpha
    function rgba(color, a) {
        color = (color || "").trim();
        if (!color) return hexToRgba("#60a5fa", a);
        // hex formats
        if (color.startsWith("#")) return hexToRgba(color, a);
        // rgb/rgba -- replace alpha with requested one
        const m = color.match(/rgba?\(([^)]+)\)/i);
        if (m) {
            const parts = m[1].split(",").map((p) => p.trim());
            const r = parts[0] || "0";
            const g = parts[1] || "0";
            const b = parts[2] || "0";
            return `rgba(${r},${g},${b},${a})`;
        }
        // unknown format (named color) — try to use it as-is with canvas by returning rgba fallback
        return hexToRgba("#60a5fa", a);
    }

    function drawTrail() {
        // smooth cursor follow
        cursorX += (mouseX - cursorX) * 0.3;
        cursorY += (mouseY - cursorY) * 0.3;

        // add new point
        tail.unshift({ x: cursorX, y: cursorY, alpha: 1 });
        if (tail.length > maxTail) tail.pop();

        // clear frame (device-pixel safe)
        trailCtx.save();
        trailCtx.setTransform(1, 0, 0, 1, 0, 0);
        trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
        trailCtx.restore();

        // color for trail (prefer locked/hover color)
        const cursorColor = getComputedStyle(document.documentElement)
            .getPropertyValue("--cursor-color")
            .trim();
        const color =
            cursorColor ||
            getComputedStyle(document.body).getPropertyValue("--primary").trim() ||
            "#60a5fa";

        // nicer styling
        trailCtx.globalCompositeOperation = "lighter";
        trailCtx.lineCap = "round";
        trailCtx.lineJoin = "round";

        // draw smooth stroked path with variable width + sprinkled glow dots
        for (let i = 0; i < tail.length - 1; i++) {
            const p = tail[i];
            const n = tail[i + 1];
            const t = i / Math.max(1, maxTail - 1); // 0..1 along tail (head=0)
            // speed-ish measure (pixel distance between last two points)
            const speed = Math.hypot(p.x - n.x, p.y - n.y);

            // width tapers from head -> tail, slightly increases with speed
            const baseWidth = lerp(6.5, 1.2, t);
            const speedBoost = lerp(1, 1.8, Math.min(speed / 18, 1));
            const lineW = baseWidth * speedBoost;

            // alpha falls off faster for a cleaner look
            const segAlpha = Math.pow(1 - t, 1.8) * 0.75;

            // stroke
            trailCtx.lineWidth = lineW;
            trailCtx.shadowColor = rgba(color, Math.min(segAlpha * 1.1, 0.9));
            trailCtx.shadowBlur = Math.max(0, lineW * 1.6);
            trailCtx.strokeStyle = rgba(color, segAlpha * 0.95);
            trailCtx.beginPath();
            trailCtx.moveTo(p.x, p.y);
            trailCtx.lineTo(n.x, n.y);
            trailCtx.stroke();

            // small glowing dot at head-ish positions for sparkle
            if (i < 6 && Math.random() < 0.35) {
                const dotAlpha = segAlpha * lerp(1, 0.4, i / 6);
                trailCtx.fillStyle = rgba(color, dotAlpha);
                const dotR = lerp(3.2, 1.0, i / 6) * speedBoost;
                trailCtx.beginPath();
                trailCtx.arc(
                    p.x + (Math.random() - 0.5) * 0.8,
                    p.y + (Math.random() - 0.5) * 0.8,
                    dotR,
                    0,
                    Math.PI * 2
                );
                trailCtx.fill();
            }
        }

        // soft leading halo circle to accentuate pointer position
        const head = tail[0];
        if (head) {
            trailCtx.shadowBlur = 18;
            trailCtx.shadowColor = rgba(color, 0.85);
            trailCtx.fillStyle = rgba(color, 0.18);
            trailCtx.beginPath();
            trailCtx.arc(head.x, head.y, 10, 0, Math.PI * 2);
            trailCtx.fill();

            trailCtx.shadowBlur = 6;
            trailCtx.fillStyle = rgba(color, 0.6);
            trailCtx.beginPath();
            trailCtx.arc(head.x, head.y, 3.6, 0, Math.PI * 2);
            trailCtx.fill();
        }

        // reset shadow to avoid leaking to other draws
        trailCtx.shadowBlur = 0;
        trailCtx.shadowColor = "transparent";

        requestAnimationFrame(drawTrail);
    }
    drawTrail();

    // ========== Background particles (interactive) ===========

    function resizeCanvas() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const vw = window.visualViewport?.width ?? window.innerWidth;
        const vh = window.visualViewport?.height ?? window.innerHeight;
        canvas.width = Math.floor(vw * dpr);
        canvas.height = Math.floor(vh * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (fluidCanvas && fctx) {
            fluidCanvas.width = Math.floor(vw * dpr);
            fluidCanvas.height = Math.floor(vh * dpr);
            fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        orbitsCanvas.width = Math.floor(vw * dpr);
        orbitsCanvas.height = Math.floor(vh * dpr);
        orbitsCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resizeCanvas();
    let resizeTimer = null;
    function onResizeLikeEvent() {
        if (resizeTimer) clearTimeout(resizeTimer);
        // Debounce to avoid thrashing when mobile browser is animating UI bars
        resizeTimer = setTimeout(() => {
            resizeTimer = null;
            resizeCanvas();
            resizeTrailCanvas();
            initParticles();
            drawOrbits();
            // Re-setup fluid only when in fluid mode AND no section is open (to avoid restarts while scrolling content)
            const sectionOpen = universe.classList.contains("section-active");
            if (window.FluidSim && window.FluidSim.fluidRunning && !sectionOpen) {
                try { window.FluidSim.setupFluid(); } catch (e) { }
                tail.length = 0; // clear trail after geometry changes
            }
            cursor.style.left = mouseX + "px";
            cursor.style.top = mouseY + "px";
        }, 120);
    }
    window.addEventListener("resize", onResizeLikeEvent);
    window.addEventListener("orientationchange", onResizeLikeEvent);
    // iOS/Android virtual keyboard and dynamic viewport
    if (window.visualViewport) {
        visualViewport.addEventListener("resize", onResizeLikeEvent);
    }
    // Listen for DPR changes (zoom) and re-run sizing
    (function watchDPR() {
        let last = window.devicePixelRatio || 1;
        try {
            let mq = matchMedia(`(resolution: ${last}dppx)`);
            const handler = () => {
                mq.removeEventListener("change", handler);
                onResizeLikeEvent();
                watchDPR();
            };
            mq.addEventListener("change", handler);
        } catch { }
    })();

    function rand(min, max) {
        return Math.random() * (max - min) + min;
    }

    function initParticles() {
        const base = Math.min(
            120,
            Math.max(50, (window.innerWidth * window.innerHeight) / 25000)
        );
        const densityScale =
            (typeof particlesConfig?.density === "number"
                ? particlesConfig.density
                : 100) / 100;
        const count = Math.round(Math.min(240, Math.max(20, base * densityScale)));
        particles = new Array(count).fill(0).map(() => ({
            x: rand(0, window.innerWidth),
            y: rand(0, window.innerHeight),
            vx: rand(-0.3, 0.3),
            vy: rand(-0.3, 0.3),
            r: rand(1, 2.5),
        }));
    }

    function drawParticles() {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        ctx.fillStyle =
            getComputedStyle(document.body).getPropertyValue("--primary").trim() ||
            "#60a5fa";
        const maxDist = Math.max(
            0,
            typeof particlesConfig?.link === "number" ? particlesConfig.link : 120
        );
        const mx = cursorX,
            my = cursorY;
        const mouseR =
            typeof particlesConfig?.mouseRadius === "number"
                ? particlesConfig.mouseRadius
                : 160;
        const mouseForce =
            ((typeof particlesConfig?.mouseForce === "number"
                ? particlesConfig.mouseForce
                : 100) /
                100) *
            0.06;
        for (const p of particles) {
            // basic motion
            p.x += p.vx;
            p.y += p.vy;
            // bounce
            if (p.x < 0 || p.x > window.innerWidth) p.vx *= -1;
            if (p.y < 0 || p.y > window.innerHeight) p.vy *= -1;
            // mild repulsion from cursor
            const dx = p.x - mx;
            const dy = p.y - my;
            const d2 = dx * dx + dy * dy;
            const d = Math.sqrt(d2);
            if (d < mouseR) {
                const f = (mouseR - d) / mouseR;
                p.vx += (dx / (d + 0.001)) * f * mouseForce;
                p.vy += (dy / (d + 0.001)) * f * mouseForce;
            }

            // draw point
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }
        // light connecting lines for nearby particles
        ctx.strokeStyle = "rgba(96,165,250,0.12)";
        ctx.lineWidth = 1;
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const a = particles[i],
                    b = particles[j];
                const dx = a.x - b.x,
                    dy = a.y - b.y;
                const d2 = dx * dx + dy * dy;
                if (d2 < maxDist * maxDist) {
                    const alpha = 1 - d2 / (maxDist * maxDist);
                    ctx.strokeStyle = `rgba(96,165,250,${0.12 * alpha})`;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                }
            }
        }
    }

    function animate() {
        if (paused) return; // don't request another frame when paused
        drawParticles();
        animationId = requestAnimationFrame(animate);
    }

    function pauseParticles(v) {
        if (paused === v) {
            // still ensure canvas is cleared when pausing
            if (paused) {
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.restore();
            }
            return;
        }
        paused = v;
        if (paused) {
            if (animationId) cancelAnimationFrame(animationId);
            animationId = null;
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
        } else {
            animationId = requestAnimationFrame(animate);
        }
    }

    initParticles();
    if (document.body.classList.contains("bg-mode-particles")) {
        animationId = requestAnimationFrame(animate);
    }

    // ========== Orbit connections and playful movement ==========
    const bubbles = Array.from(document.querySelectorAll(".nav-bubble"));
    const hubRectProvider = () =>
        document.querySelector(".central-logo")?.getBoundingClientRect();
    // bubbleState now holds full physics-ish state: current pos (dx,dy), target (targetDx,targetDy),
    // velocity (vx,vy), and pointer tracking for velocity estimation during drag.
    const bubbleState = new Map();
    bubbles.forEach((b, idx) =>
        bubbleState.set(b, {
            dx: 0,
            dy: 0,
            targetDx: 0,
            targetDy: 0,
            vx: 0,
            vy: 0,
            dragging: false,
            i: idx,
            // pointer tracking
            startPointerX: 0,
            startPointerY: 0,
            startDx: 0,
            startDy: 0,
            lastPointer: null,
            // previous offsets to estimate centers without forcing layout mid-frame
            prevDx: 0,
            prevDy: 0,
            // last known on-screen center (from previous layout)
            cx0: 0,
            cy0: 0,
        })
    );

    // improved dragging: velocity estimation + inertia + springback to origin
    bubbles.forEach((b) => {
        b.addEventListener("pointerdown", (e) => {
            b.setPointerCapture(e.pointerId);
            const s = bubbleState.get(b);
            s.dragging = true;
            s.startPointerX = e.clientX;
            s.startPointerY = e.clientY;
            s.startDx = s.dx;
            s.startDy = s.dy;
            s.targetDx = s.dx;
            s.targetDy = s.dy;
            s.vx = 0;
            s.vy = 0;
            s.lastPointer = { x: e.clientX, y: e.clientY, t: performance.now() };
        });

        b.addEventListener("pointermove", (e) => {
            const s = bubbleState.get(b);
            if (!s.dragging) return;
            // compute desired target based on pointer delta from start
            const desiredX = s.startDx + (e.clientX - s.startPointerX);
            const desiredY = s.startDy + (e.clientY - s.startPointerY);
            s.targetDx = desiredX;
            s.targetDy = desiredY;

            // estimate instantaneous pointer velocity (px/sec)
            const now = performance.now();
            if (s.lastPointer) {
                const dt = Math.max(1, now - s.lastPointer.t) / 1000; // seconds, avoid 0
                const pvx = (e.clientX - s.lastPointer.x) / dt;
                const pvy = (e.clientY - s.lastPointer.y) / dt;
                // blend into stored velocity to avoid spikes
                const blend = 0.25; // a bit more responsive
                s.vx = s.vx * (1 - blend) + pvx * blend;
                s.vy = s.vy * (1 - blend) + pvy * blend;
                // clamp extreme velocities to avoid huge fling
                const maxVel = 3000; // px/sec
                const sp = Math.hypot(s.vx, s.vy);
                if (sp > maxVel) {
                    const k = maxVel / sp;
                    s.vx *= k;
                    s.vy *= k;
                }
            }
            s.lastPointer = { x: e.clientX, y: e.clientY, t: now };
        });

        b.addEventListener("pointerup", (e) => {
            const s = bubbleState.get(b);
            s.dragging = false;
            // keep velocity in px/sec for inertial motion; clamp to sane range
            const maxVel = 3000;
            const sp = Math.hypot(s.vx, s.vy);
            if (sp > maxVel) {
                const k = maxVel / sp;
                s.vx *= k;
                s.vy *= k;
            }
            s.lastPointer = null;
            b.releasePointerCapture(e.pointerId);
        });

        b.addEventListener("pointercancel", (e) => {
            const s = bubbleState.get(b);
            s.dragging = false;
            s.lastPointer = null;
        });
    });

    function drawOrbits() {
        orbitsCtx.save();
        orbitsCtx.setTransform(1, 0, 0, 1, 0, 0);
        orbitsCtx.clearRect(0, 0, orbitsCanvas.width, orbitsCanvas.height);
        orbitsCtx.restore();
        // keep lines subtle and not section-colored; use a neutral hue
        orbitsCtx.strokeStyle = "rgba(148, 163, 184, 0.18)";
        orbitsCtx.lineWidth = 1.2;
        const hub = hubRectProvider();
        if (!hub) return;
        const center = { x: hub.left + hub.width / 2, y: hub.top + hub.height / 2 };

        // compute bubble centers and connect to hub and neighbors
        const centers = bubbles.map((b) => {
            const r = b.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });
        centers.forEach((p, idx) => {
            // line to hub
            orbitsCtx.beginPath();
            orbitsCtx.moveTo(center.x, center.y);
            orbitsCtx.lineTo(p.x, p.y);
            orbitsCtx.stroke();
            // line to next bubble (ring)
            const q = centers[(idx + 1) % centers.length];
            orbitsCtx.beginPath();
            orbitsCtx.moveTo(p.x, p.y);
            orbitsCtx.lineTo(q.x, q.y);
            orbitsCtx.stroke();
        });
    }
    // initial paint
    drawOrbits();

    // Add subtle time-based wobble by updating CSS vars
    // timestep-aware animator: integrates velocities, follows targets while dragging,
    // allows inertia & spring-back when released, and applies the wobble on top.
    let lastTime = performance.now();
    let wobbleT = 0;
    const RESTITUTION = 0.6; // bounciness for collisions
    function clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }
    function predictedCenter(state) {
        // estimate the center after applying current dx/dy (relative to start-of-frame values)
        return {
            x: state.cx0 + (state.dx - state.prevDx),
            y: state.cy0 + (state.dy - state.prevDy),
        };
    }
    function animateWobble(now) {
        now = now || performance.now();
        const dt = Math.min((now - lastTime) / 1000, 0.05); // clamp dt
        lastTime = now;
        wobbleT += dt;

        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;

        // Snapshot geometry at start of frame (previously rendered positions)
        const items = bubbles.map((b, idx) => {
            const s = bubbleState.get(b);
            const r = b.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            s.prevDx = s.dx; // record start-of-frame offsets
            s.prevDy = s.dy;
            s.cx0 = cx;
            s.cy0 = cy;
            return { el: b, s, idx, radius: r.width / 2 };
        });

        const hubRect = hubRectProvider();
        const hub = hubRect
            ? {
                x: hubRect.left + hubRect.width / 2,
                y: hubRect.top + hubRect.height / 2,
                r: Math.min(hubRect.width, hubRect.height) / 2,
            }
            : null;

        // 1) Integrate motion for each bubble
        const sectionOpen = universe.classList.contains("section-active");
        items.forEach(({ s }) => {
            if (sectionOpen) {
                // Freeze motion while a section is open
                s.vx = 0; s.vy = 0; return;
            }
            if (s.dragging) {
                const followK = 28;
                const alpha = 1 - Math.exp(-followK * dt);
                s.dx += (s.targetDx - s.dx) * alpha;
                s.dy += (s.targetDy - s.dy) * alpha;
                s.vx *= 0.85;
                s.vy *= 0.85;
            } else {
                const friction = Math.exp(-3.2 * dt);
                s.vx *= friction;
                s.vy *= friction;
                s.dx += s.vx * dt;
                s.dy += s.vy * dt;
            }
        });

        // 2) Constrain to screen bounds and resolve collisions
        // Do a couple of iterations for stability
        for (let iter = 0; iter < 2; iter++) {
            // Bounds
            items.forEach(({ s, radius }) => {
                const c = predictedCenter(s);
                // Horizontal
                const minX = radius;
                const maxX = viewportW - radius;
                if (c.x < minX) {
                    const dx = minX - c.x;
                    s.dx += dx;
                    s.vx = Math.abs(s.vx) * 0.4; // dampened bounce
                } else if (c.x > maxX) {
                    const dx = maxX - c.x;
                    s.dx += dx;
                    s.vx = -Math.abs(s.vx) * 0.4;
                }
                // Vertical
                const minY = radius;
                const maxY = viewportH - radius;
                if (c.y < minY) {
                    const dy = minY - c.y;
                    s.dy += dy;
                    s.vy = Math.abs(s.vy) * 0.4;
                } else if (c.y > maxY) {
                    const dy = maxY - c.y;
                    s.dy += dy;
                    s.vy = -Math.abs(s.vy) * 0.4;
                }
            });

            // Collisions with hub (immovable)
            if (hub) {
                items.forEach(({ s, radius }) => {
                    const c = predictedCenter(s);
                    let dx = c.x - hub.x;
                    let dy = c.y - hub.y;
                    let dist = Math.hypot(dx, dy) || 0.0001;
                    const overlap = radius + hub.r - dist;
                    if (overlap > 0) {
                        const nx = dx / dist,
                            ny = dy / dist;
                        const push = overlap + 0.5; // small slop to avoid stickiness
                        s.dx += nx * push;
                        s.dy += ny * push;
                        const vDotN = s.vx * nx + s.vy * ny;
                        if (vDotN < 0) {
                            s.vx -= (1 + RESTITUTION) * vDotN * nx;
                            s.vy -= (1 + RESTITUTION) * vDotN * ny;
                        }
                    }
                });
            }

            // Collisions between bubbles (equal mass)
            for (let i = 0; i < items.length; i++) {
                for (let j = i + 1; j < items.length; j++) {
                    const A = items[i],
                        B = items[j];
                    const ca = predictedCenter(A.s);
                    const cb = predictedCenter(B.s);
                    let dx = cb.x - ca.x;
                    let dy = cb.y - ca.y;
                    let dist = Math.hypot(dx, dy) || 0.0001;
                    const minDist = A.radius + B.radius;
                    const overlap = minDist - dist;
                    if (overlap > 0) {
                        const nx = dx / dist,
                            ny = dy / dist;
                        const corr = overlap / 2 + 0.5;
                        // separate equally
                        A.s.dx -= nx * corr;
                        A.s.dy -= ny * corr;
                        B.s.dx += nx * corr;
                        B.s.dy += ny * corr;

                        // simple elastic response along normal
                        const rvx = A.s.vx - B.s.vx;
                        const rvy = A.s.vy - B.s.vy;
                        const rel = rvx * nx + rvy * ny;
                        if (rel < 0) {
                            const jImp = ((1 + RESTITUTION) * rel) / 2; // equal masses
                            A.s.vx -= jImp * nx;
                            A.s.vy -= jImp * ny;
                            B.s.vx += jImp * nx;
                            B.s.vy += jImp * ny;
                        }
                    }
                }
            }
        }

        // 3) Apply wobble, but clamp so final position stays on-screen
        items.forEach(({ el, s, idx, radius }) => {
            const base = predictedCenter(s);
            let ax = Math.sin(wobbleT + idx) * 3;
            let ay = Math.cos(wobbleT * 0.9 + idx) * 3;

            // clamp wobble to keep inside viewport
            const minAx = radius - base.x;
            const maxAx = viewportW - radius - base.x;
            const minAy = radius - base.y;
            const maxAy = viewportH - radius - base.y;
            ax = clamp(ax, minAx, maxAx);
            ay = clamp(ay, minAy, maxAy);

            // also avoid wobble colliding into hub
            if (hub) {
                const wx = base.x + ax,
                    wy = base.y + ay;
                let dx = wx - hub.x,
                    dy = wy - hub.y;
                const dist = Math.hypot(dx, dy) || 0.0001;
                const overlap = radius + hub.r - dist;
                if (overlap > 0) {
                    const nx = dx / dist,
                        ny = dy / dist;
                    const push = overlap + 0.5;
                    ax += nx * push;
                    ay += ny * push;
                }
            }

            el.style.setProperty("--dx", s.dx + ax + "px");
            el.style.setProperty("--dy", s.dy + ay + "px");

            // prepare for next frame center estimation
            s.prevDx = s.dx;
            s.prevDy = s.dy;
        });

        drawOrbits();
        requestAnimationFrame(animateWobble);
    }
    requestAnimationFrame(animateWobble);

    // Back overlay and mouse back button
    document
        .querySelectorAll(".back-overlay")
        .forEach((el) => el.addEventListener("click", backToHub));
    window.addEventListener("popstate", (e) => {
        // When user presses Back from a section, return to hub instead of leaving
        if (universe.classList.contains("section-active")) {
            // clear state but don't push a new one
            universe.classList.remove("section-active");
            sections.forEach((s) => s.classList.remove("active"));
            if (document.body.classList.contains("bg-mode-particles"))
                pauseParticles(false);
            document.documentElement.style.removeProperty("--cursor-color");
            // resume wobble/orbits after closing
            drawOrbits();
        }
    });
    window.addEventListener("mouseup", (e) => {
        if (e.button === 3 || e.button === 4) backToHub();
    });

    // Slow down particles a bit and use a different color
    function drawParticles() {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        ctx.fillStyle = particleColor;
        const speedScale =
            (typeof particlesConfig?.speed === "number"
                ? particlesConfig.speed
                : 100) / 100;
        const maxDist = Math.max(
            0,
            typeof particlesConfig?.link === "number" ? particlesConfig.link : 120
        );
        const mx = cursorX,
            my = cursorY;
        const mouseR =
            typeof particlesConfig?.mouseRadius === "number"
                ? particlesConfig.mouseRadius
                : 160;
        const mouseForce =
            ((typeof particlesConfig?.mouseForce === "number"
                ? particlesConfig.mouseForce
                : 100) /
                100) *
            0.06;
        for (const p of particles) {
            // slower baseline motion
            p.x += p.vx * 0.65 * speedScale;
            p.y += p.vy * 0.65 * speedScale;
            if (p.x < 0 || p.x > window.innerWidth) p.vx *= -1;
            if (p.y < 0 || p.y > window.innerHeight) p.vy *= -1;
            const dx = p.x - mx;
            const dy = p.y - my;
            const d2 = dx * dx + dy * dy;
            const d = Math.sqrt(d2);
            if (d < mouseR) {
                // react based on configured radius/force
                const f = (mouseR - d) / mouseR;
                p.vx += (dx / (d + 0.001)) * f * mouseForce;
                p.vy += (dy / (d + 0.001)) * f * mouseForce;
            }
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }
        // lines
        ctx.lineWidth = 1;
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const a = particles[i],
                    b = particles[j];
                const dx = a.x - b.x,
                    dy = a.y - b.y;
                const d2 = dx * dx + dy * dy;
                if (d2 < maxDist * maxDist) {
                    const alpha = 1 - d2 / (maxDist * maxDist);
                    ctx.strokeStyle = `rgba(125, 211, 252, ${0.12 * alpha})`;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                }
            }
        }
    }

    // Bubble-specific colors: use each section color for its icon/text glow
    function applyBubbleColors() {
        bubbles.forEach((b) => {
            // Priority: inline CSS variable (--primary) -> data-color attribute -> JS default by target
            const inlineColor = b.style.getPropertyValue("--primary")?.trim();
            const dataColor = b.getAttribute("data-color")?.trim();
            const target = b.dataset.target;

            let color = inlineColor || dataColor || "#60a5fa";

            // if (!inlineColor && !dataColor) {
            //     // fallback defaults based on target (for compatibility)
            //     if (target === 'projects') color = '#60a5fa';
            //     if (target === 'art') color = '#f472b6';
            //     if (target === 'learning') color = '#34d399';
            //     if (target === 'writing') color = '#f59e0b';
            //     if (target === 'music') color = '#a78bfa';
            // }

            b.style.setProperty("--primary", color);
        });
    }
    applyBubbleColors();

    // Initial cursor color from theme
    document.documentElement.style.setProperty(
        "--cursor-color",
        getComputedStyle(document.body).getPropertyValue("--primary").trim()
    );

    // ========== Floating footer visibility while scrolling ==========
    (function setupFloatingFooter() {
        const footer = document.getElementById("page-footer");
        if (!footer) return;
        // On touch devices we keep footer hidden (no custom cursor, etc.)
        if (matchMedia && matchMedia("(pointer: coarse)").matches) return;

        let lastY = window.scrollY || 0;
        let hideTimer = null;

        function showFooter() {
            // don't show footer when a section is open (hub overlay active)
            if (universe && universe.classList.contains("section-active")) return;
            footer.classList.add("visible");
            if (hideTimer) {
                clearTimeout(hideTimer);
                hideTimer = null;
            }
            hideTimer = setTimeout(() => footer.classList.remove("visible"), 3200);
        }

        function onScroll() {
            const y = window.scrollY || 0;
            // show only when scrolling down a bit
            if (y > lastY + 10) {
                showFooter();
            }
            lastY = y;
        }

        // Use passive listener for performance
        window.addEventListener("scroll", onScroll, { passive: true });
        // Also reveal when user uses wheel/trackpad even if scrollTop didn't change yet
        window.addEventListener(
            "wheel",
            (e) => {
                if (
                    e.deltaY > 10 &&
                    !(universe && universe.classList.contains("section-active"))
                )
                    showFooter();
            },
            { passive: true }
        );
    })();

    // Fluid simulation has been moved to `fluid-sim.js` and is available at window.FluidSim.
    // Wire control elements to the external FluidSim if present.
    const elDetail = document.getElementById("fluid-detail");
    const elInertia = document.getElementById("fluid-inertia");
    const elSwirl = document.getElementById("fluid-swirl");
    const elFlow = document.getElementById("fluid-flow");
    const elReset = document.getElementById("settings-reset");

    if (window.FluidSim) {
        if (elDetail) elDetail.value = String(window.FluidSim.fluidConfig.detail);
        if (elInertia)
            elInertia.value = String(window.FluidSim.fluidConfig.inertia);
        if (elSwirl) elSwirl.value = String(window.FluidSim.fluidConfig.swirl);
        if (elFlow) elFlow.value = String(window.FluidSim.fluidConfig.flow);

        function restartFluidIfActive(reseed = false) {
            if (!document.body.classList.contains("bg-mode-fluid")) return;
            if (reseed && window.FluidSim) window.FluidSim.setupFluid();
            window.FluidSim.lastFluidTime = performance.now();
            if (!window.FluidSim.fluidId)
                window.FluidSim.fluidId = requestAnimationFrame(
                    window.FluidSim.fluidStep
                );
        }

        elDetail?.addEventListener("input", () => {
            window.FluidSim.fluidConfig.detail = Number(elDetail.value);
            localStorage.setItem(
                "fluid-detail",
                String(window.FluidSim.fluidConfig.detail)
            );
            window.FluidSim.setupFluid?.();
            restartFluidIfActive(true);
        });
        elInertia?.addEventListener("input", () => {
            window.FluidSim.fluidConfig.inertia = Number(elInertia.value);
            localStorage.setItem(
                "fluid-inertia",
                String(window.FluidSim.fluidConfig.inertia)
            );
            restartFluidIfActive(false);
        });
        elSwirl?.addEventListener("input", () => {
            window.FluidSim.fluidConfig.swirl = Number(elSwirl.value);
            localStorage.setItem(
                "fluid-swirl",
                String(window.FluidSim.fluidConfig.swirl)
            );
            restartFluidIfActive(false);
        });
        elFlow?.addEventListener("input", () => {
            window.FluidSim.fluidConfig.flow = Number(elFlow.value);
            localStorage.setItem(
                "fluid-flow",
                String(window.FluidSim.fluidConfig.flow)
            );
            restartFluidIfActive(false);
        });
        elReset?.addEventListener("click", () => {
            window.FluidSim.fluidConfig.detail = 3;
            localStorage.setItem("fluid-detail", "3");
            if (elDetail) elDetail.value = "3";
            window.FluidSim.fluidConfig.inertia = 70;
            localStorage.setItem("fluid-inertia", "70");
            if (elInertia) elInertia.value = "70";
            window.FluidSim.fluidConfig.swirl = 60;
            localStorage.setItem("fluid-swirl", "60");
            if (elSwirl) elSwirl.value = "60";
            window.FluidSim.fluidConfig.flow = 50;
            localStorage.setItem("fluid-flow", "50");
            if (elFlow) elFlow.value = "50";
            window.FluidSim.setupFluid?.();
            restartFluidIfActive(true);
            resetParticlesConfig(particlesConfig);
            if (typeof pDensity !== "undefined" && pDensity)
                pDensity.value = String(particlesConfig.density);
            if (typeof pSpeed !== "undefined" && pSpeed)
                pSpeed.value = String(particlesConfig.speed);
            if (typeof pLink !== "undefined" && pLink)
                pLink.value = String(particlesConfig.link);
            if (typeof pMouseRadius !== "undefined" && pMouseRadius)
                pMouseRadius.value = String(particlesConfig.mouseRadius);
            if (typeof pMouseForce !== "undefined" && pMouseForce)
                pMouseForce.value = String(particlesConfig.mouseForce);
            // re-seed particles so changes take effect
            try {
                initParticles();
            } catch (e) { }
            try {
                applyParticlesSettings(true);
            } catch (e) { }
        });
    } else {
        // If FluidSim isn't available (script not loaded), keep UI defaults in sync with localStorage
        if (elDetail) elDetail.value = localStorage.getItem("fluid-detail") ?? "3";
        if (elInertia)
            elInertia.value = localStorage.getItem("fluid-inertia") ?? "70";
        if (elSwirl) elSwirl.value = localStorage.getItem("fluid-swirl") ?? "60";
        if (elFlow) elFlow.value = localStorage.getItem("fluid-flow") ?? "50";
        // Provide Reset fallback to at least reset particle settings when fluid sim isn't present
        elReset?.addEventListener("click", () => {
            resetParticlesConfig(particlesConfig);
            if (typeof pDensity !== "undefined" && pDensity)
                pDensity.value = String(particlesConfig.density);
            if (typeof pSpeed !== "undefined" && pSpeed)
                pSpeed.value = String(particlesConfig.speed);
            if (typeof pLink !== "undefined" && pLink)
                pLink.value = String(particlesConfig.link);
            if (typeof pMouseRadius !== "undefined" && pMouseRadius)
                pMouseRadius.value = String(particlesConfig.mouseRadius);
            if (typeof pMouseForce !== "undefined" && pMouseForce)
                pMouseForce.value = String(particlesConfig.mouseForce);
            try {
                initParticles();
            } catch (e) { }
            try {
                applyParticlesSettings(true);
            } catch (e) { }
        });
    }

    // Particles settings wiring
    const pDensity = document.getElementById("particles-density");
    const pSpeed = document.getElementById("particles-speed");
    const pLink = document.getElementById("particles-link");
    const pMouseRadius = document.getElementById("particles-mouse-radius");
    const pMouseForce = document.getElementById("particles-mouse-force");
    if (pDensity) pDensity.value = String(particlesConfig.density);
    if (pSpeed) pSpeed.value = String(particlesConfig.speed);
    if (pLink) pLink.value = String(particlesConfig.link);
    if (pMouseRadius) pMouseRadius.value = String(particlesConfig.mouseRadius);
    if (pMouseForce) pMouseForce.value = String(particlesConfig.mouseForce);

    function applyParticlesSettings(reseed = false) {
        // persist
        saveParticlesConfig(particlesConfig);
        // if in particles mode, re-init and ensure animation running
        if (document.body.classList.contains("bg-mode-particles")) {
            if (reseed) initParticles();
            if (paused) pauseParticles(false);
            if (!animationId) animationId = requestAnimationFrame(animate);
        }
    }
    pDensity?.addEventListener("input", () => {
        particlesConfig.density = Number(pDensity.value);
        applyParticlesSettings(true);
    });
    pSpeed?.addEventListener("input", () => {
        particlesConfig.speed = Number(pSpeed.value);
        applyParticlesSettings(false);
    });
    pLink?.addEventListener("input", () => {
        particlesConfig.link = Number(pLink.value);
        applyParticlesSettings(false);
    });
    pMouseRadius?.addEventListener("input", () => {
        particlesConfig.mouseRadius = Number(pMouseRadius.value);
        applyParticlesSettings(false);
    });
    pMouseForce?.addEventListener("input", () => {
        particlesConfig.mouseForce = Number(pMouseForce.value);
        applyParticlesSettings(false);
    });
});
