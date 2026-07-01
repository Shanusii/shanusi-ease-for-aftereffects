/* Shanusi Ease — CLIENT (UI). Canvas bezier editor + live preview + jembatan host. */
(function () {
    "use strict";

    var cs = new CSInterface();

    /* ---------------- state ---------------- */
    var cp = { p1x: 0.33, p1y: 0.0, p2x: 0.66, p2y: 1.0 };
    var vHalf = 1.2, V_MIN = 0.55, V_MAX = 3.0;
    var PAD = 24;
    var activeTab = "ease";

    var BUILTIN = [
        { name: "Linear", v: [0, 0, 1, 1] },
        { name: "Ease", v: [0.25, 0.1, 0.25, 1] },
        { name: "Ease In", v: [0.42, 0, 1, 1] },
        { name: "Ease Out", v: [0, 0, 0.58, 1] },
        { name: "Ease In-Out", v: [0.42, 0, 0.58, 1] },
        { name: "Smooth", v: [0.33, 0, 0.66, 1] },
        { name: "Quart Out", v: [0.165, 0.84, 0.44, 1] },
        { name: "Expo Out", v: [0.19, 1, 0.22, 1] },
        { name: "Overshoot", v: [0.34, 1.56, 0.64, 1] },
        { name: "Anticipate", v: [0.36, 0, 0.66, -0.56] }
    ];
    var PKEY = "shanusiEasePresets";
    function loadUser() { try { return JSON.parse(localStorage.getItem(PKEY)) || []; } catch (e) { return []; } }
    function saveUser(a) { localStorage.setItem(PKEY, JSON.stringify(a)); }
    var userPresets = loadUser();

    /* ---------------- elemen ---------------- */
    var $ = function (id) { return document.getElementById(id); };
    var graph = $("graph"), gctx = graph.getContext("2d");
    var strip = $("strip"), sctx = strip.getContext("2d");
    var bprev = $("bprev"), bctx = bprev.getContext("2d");
    var eprev = $("eprev"), ectx = eprev.getContext("2d");
    var p1x = $("p1x"), p1y = $("p1y"), p2x = $("p2x"), p2y = $("p2y"), rnd = $("rnd");
    var presetSel = $("preset"), modeSel = $("mode"), statusEl = $("status");

    /* ---------------- util ---------------- */
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function round(v) { return Math.round(v * 1000) / 1000; }
    function bez(t, a, b, c, d) {
        var m = 1 - t;
        return m * m * m * a + 3 * m * m * t * b + 3 * m * t * t * c + t * t * t * d;
    }
    function ymin() { return 0.5 - vHalf; }
    function ymax() { return 0.5 + vHalf; }

    function setStatus(msg) {
        statusEl.className = "status";
        if (!msg) { statusEl.textContent = ""; return; }
        if (msg.indexOf("OK:") === 0) { statusEl.classList.add("ok"); msg = msg.slice(3); }
        else if (msg.indexOf("ERR:") === 0) { statusEl.classList.add("err"); msg = msg.slice(4); }
        statusEl.textContent = msg;
    }

    /* ---------------- canvas helpers ---------------- */
    function fit(canvas, ctx, cssH) {
        var rect = canvas.getBoundingClientRect();
        if (rect.width < 2) return false;
        var dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(cssH * dpr);
        canvas.style.height = cssH + "px";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return true;
    }
    function cw(canvas) { var r = canvas.getBoundingClientRect(); return r.width; }
    function line(ctx, x1, y1, x2, y2, color, w) {
        ctx.strokeStyle = color; ctx.lineWidth = w || 1;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    function dot(ctx, x, y, r, color) {
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }

    /* ---------------- graph geometri ---------------- */
    function sx(nx, W) { return PAD + nx * (W - 2 * PAD); }
    function sy(ny, H) { return H - PAD - ((ny - ymin()) / (ymax() - ymin())) * (H - 2 * PAD); }
    function nx2(px, W) { return (px - PAD) / (W - 2 * PAD); }
    function ny2(py, H) { return ymin() + ((H - PAD - py) / (H - 2 * PAD)) * (ymax() - ymin()); }

    /* ---------------- easing value-over-time ---------------- */
    function solveT(tau) {
        var lo = 0, hi = 1, t = tau;
        for (var i = 0; i < 22; i++) {
            t = (lo + hi) / 2;
            if (bez(t, 0, cp.p1x, cp.p2x, 1) < tau) lo = t; else hi = t;
        }
        return t;
    }
    function easeValueAt(tau) { return bez(solveT(tau), 0, cp.p1y, cp.p2y, 1); }

    /* ---------------- gambar graph (+ marker live) ---------------- */
    function drawGraph(tau) {
        var W = cw(graph), H = 220;
        gctx.clearRect(0, 0, W, H);
        gctx.fillStyle = "#1a1a1a"; gctx.fillRect(0, 0, W, H);

        var t;
        for (t = 0; t <= 1.0001; t += 0.25) line(gctx, sx(t, W), sy(ymin(), H), sx(t, W), sy(ymax(), H), "#2b2b2b", 1);
        for (var yy = Math.ceil(ymin() / 0.5) * 0.5; yy <= ymax() + 1e-6; yy += 0.5) {
            if (Math.abs(yy) < 1e-6 || Math.abs(yy - 1) < 1e-6) continue;
            line(gctx, sx(0, W), sy(yy, H), sx(1, W), sy(yy, H), "#2b2b2b", 1);
        }
        line(gctx, sx(0, W), sy(0, H), sx(1, W), sy(0, H), "#4a4a4a", 1);
        line(gctx, sx(0, W), sy(1, H), sx(1, W), sy(1, H), "#4a4a4a", 1);
        line(gctx, sx(0, W), sy(0, H), sx(0, W), sy(1, H), "#4a4a4a", 1);
        line(gctx, sx(1, W), sy(0, H), sx(1, W), sy(1, H), "#4a4a4a", 1);
        line(gctx, sx(0, W), sy(0, H), sx(1, W), sy(1, H), "#373737", 1);

        line(gctx, sx(0, W), sy(0, H), sx(cp.p1x, W), sy(cp.p1y, H), "#777", 1);
        line(gctx, sx(1, W), sy(1, H), sx(cp.p2x, W), sy(cp.p2y, H), "#777", 1);

        gctx.strokeStyle = "#4da6ff"; gctx.lineWidth = 2; gctx.beginPath();
        gctx.moveTo(sx(0, W), sy(0, H));
        for (var s = 1; s <= 80; s++) {
            var tt = s / 80;
            gctx.lineTo(sx(bez(tt, 0, cp.p1x, cp.p2x, 1), W), sy(bez(tt, 0, cp.p1y, cp.p2y, 1), H));
        }
        gctx.stroke();

        // marker preview berjalan di kurva
        var mv = easeValueAt(tau);
        line(gctx, sx(tau, W), sy(ymin(), H), sx(tau, W), sy(ymax(), H), "rgba(255,255,255,0.12)", 1);
        dot(gctx, sx(tau, W), sy(mv, H), 4, "#ffffff");

        dot(gctx, sx(cp.p1x, W), sy(cp.p1y, H), 5, "#4da6ff");
        dot(gctx, sx(cp.p2x, W), sy(cp.p2y, H), 5, "#ff8c4d");
    }

    function drawStrip(tau) {
        var W = cw(strip), H = 26, pad = 10;
        sctx.clearRect(0, 0, W, H);
        sctx.fillStyle = "#1a1a1a"; sctx.fillRect(0, 0, W, H);
        line(sctx, pad, H / 2, W - pad, H / 2, "#333", 2);
        var v = clamp(easeValueAt(tau), -0.15, 1.15);
        dot(sctx, pad + v * (W - 2 * pad), H / 2, 6, "#4da6ff");
    }

    /* ---------------- preview Bounce / Elastic ---------------- */
    function buildBounce(num, decay) {
        var d = clamp(decay, 0.05, 0.95), qt = Math.sqrt(d);
        var units = 1, k;
        for (k = 1; k <= num; k++) units += 2 * Math.pow(qt, k);
        var pts = [{ x: 0, y: 0 }], tc = 1 / units;
        pts.push({ x: tc, y: 1 });
        for (k = 1; k <= num; k++) {
            var half = Math.pow(qt, k) / units;
            pts.push({ x: tc + half, y: 1 - Math.pow(d, k) });
            if (k < num) pts.push({ x: tc + 2 * half, y: 1 });
            tc += 2 * half;
        }
        pts.push({ x: 1, y: 1 });
        return pts;
    }
    function buildElastic(num, redam) {
        var d = clamp(redam, 0.05, 0.95), pts = [{ x: 0, y: 0 }], k;
        for (k = 1; k <= num; k++) {
            var sign = (k % 2 === 1) ? 1 : -1;
            pts.push({ x: k / (num + 1), y: 1 + Math.pow(d, k) * sign });
        }
        pts.push({ x: 1, y: 1 });
        return pts;
    }
    function sampleAt(pts, x) {
        if (x <= pts[0].x) return pts[0].y;
        var n = pts.length;
        if (x >= pts[n - 1].x) return pts[n - 1].y;
        for (var i = 0; i < n - 1; i++) {
            if (x <= pts[i + 1].x) {
                var a = pts[i], b = pts[i + 1];
                var u = (x - a.x) / ((b.x - a.x) || 1e-9);
                var sm = u * u * (3 - 2 * u);
                return a.y + (b.y - a.y) * sm;
            }
        }
        return pts[n - 1].y;
    }
    function drawMotion(ctx, canvas, pts, tau, color) {
        var W = cw(canvas), H = 80, pad = 12;
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = "#1a1a1a"; ctx.fillRect(0, 0, W, H);
        var min = 0, max = 1, i;
        for (i = 0; i < pts.length; i++) { if (pts[i].y < min) min = pts[i].y; if (pts[i].y > max) max = pts[i].y; }
        var rng = (max - min) || 1, padV = rng * 0.12; min -= padV; max += padV; rng = max - min;
        function mx(x) { return pad + x * (W - 2 * pad); }
        function my(y) { return H - pad - ((y - min) / rng) * (H - 2 * pad); }
        // garis target (1) & awal (0)
        line(ctx, mx(0), my(1), mx(1), my(1), "#3a3a3a", 1);
        line(ctx, mx(0), my(0), mx(1), my(0), "#2b2b2b", 1);
        // kurva
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
        for (i = 0; i <= 90; i++) {
            var x = i / 90, y = sampleAt(pts, x);
            if (i === 0) ctx.moveTo(mx(x), my(y)); else ctx.lineTo(mx(x), my(y));
        }
        ctx.stroke();
        // dot live
        dot(ctx, mx(tau), my(sampleAt(pts, tau)), 4, "#ffffff");
    }

    /* ---------------- animation loop ---------------- */
    var PERIOD = 1900, HOLD = 0.16;
    function frame(ts) {
        var p = (ts % PERIOD) / PERIOD, tau;
        if (p < HOLD) tau = 0;
        else if (p > 1 - HOLD) tau = 1;
        else tau = (p - HOLD) / (1 - 2 * HOLD);

        if (activeTab === "ease") {
            drawGraph(tau); drawStrip(tau);
        } else {
            drawMotion(bctx, bprev, buildBounce(clamp(Math.round(+$("bnum").value || 3), 1, 10), parseFloat($("bdec").value) || 0.5), tau, "#ff8c4d");
            drawMotion(ectx, eprev, buildElastic(clamp(Math.round(+$("enum").value || 4), 1, 12), parseFloat($("edmp").value) || 0.5), tau, "#4da6ff");
        }
        requestAnimationFrame(frame);
    }

    /* ---------------- interaksi graph ---------------- */
    var drag = 0;
    function localPos(e) { var r = graph.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    graph.addEventListener("mousedown", function (e) {
        var W = cw(graph), H = 220, p = localPos(e);
        var d1 = Math.hypot(p.x - sx(cp.p1x, W), p.y - sy(cp.p1y, H));
        var d2 = Math.hypot(p.x - sx(cp.p2x, W), p.y - sy(cp.p2y, H));
        drag = (d1 < d2) ? (d1 < 16 ? 1 : 0) : (d2 < 16 ? 2 : 0);
    });
    window.addEventListener("mousemove", function (e) {
        if (!drag) return;
        var W = cw(graph), H = 220, p = localPos(e);
        var nx = clamp(nx2(p.x, W), 0, 1), ny = clamp(ny2(p.y, H), ymin(), ymax());
        if (drag === 1) { cp.p1x = nx; cp.p1y = ny; } else { cp.p2x = nx; cp.p2y = ny; }
        syncInputs();
    });
    window.addEventListener("mouseup", function () { drag = 0; });
    graph.addEventListener("wheel", function (e) {
        e.preventDefault();
        if (e.deltaY < 0) vHalf = Math.max(V_MIN, vHalf * 0.85);
        else vHalf = Math.min(V_MAX, vHalf * 1.18);
    }, { passive: false });
    $("fit").addEventListener("click", function () { vHalf = 1.2; });

    /* ---------------- input angka ---------------- */
    function syncInputs() {
        p1x.value = round(cp.p1x); p1y.value = round(cp.p1y);
        p2x.value = round(cp.p2x); p2y.value = round(cp.p2y);
    }
    function readInputs() {
        cp.p1x = clamp(parseFloat(p1x.value) || 0, 0, 1);
        cp.p1y = parseFloat(p1y.value) || 0;
        cp.p2x = clamp(parseFloat(p2x.value) || 0, 0, 1);
        cp.p2y = parseFloat(p2y.value) || 0;
    }
    [p1x, p1y, p2x, p2y].forEach(function (el) { el.addEventListener("change", readInputs); });

    function setCurve(v) { cp.p1x = v[0]; cp.p1y = v[1]; cp.p2x = v[2]; cp.p2y = v[3]; syncInputs(); }

    /* ---------------- preset dropdown ---------------- */
    function refreshPresets() {
        presetSel.innerHTML = "";
        BUILTIN.forEach(function (p, i) { add(p.name, "b" + i); });
        if (userPresets.length) {
            var sep = document.createElement("option");
            sep.disabled = true; sep.textContent = "──────────"; presetSel.appendChild(sep);
        }
        userPresets.forEach(function (p, i) { add("★ " + p.name, "u" + i); });
        function add(label, val) {
            var o = document.createElement("option"); o.textContent = label; o.value = val; presetSel.appendChild(o);
        }
        if (galleryOpen) renderGallery();
    }
    presetSel.addEventListener("change", function () {
        var val = presetSel.value, v = null;
        if (val[0] === "b") v = BUILTIN[+val.slice(1)].v;
        else if (val[0] === "u") v = userPresets[+val.slice(1)].v;
        if (v) setCurve(v);
    });

    /* ---------------- galeri thumbnail ---------------- */
    var galleryOpen = false, galleryWrap = $("gallery-wrap");
    function miniCurve(v) {
        var c = document.createElement("canvas"); c.width = 100; c.height = 64;
        var x = c.getContext("2d"), W = 100, H = 64, pd = 8;
        x.fillStyle = "#1a1a1a"; x.fillRect(0, 0, W, H);
        // range -0.4..1.4 supaya overshoot kelihatan
        function MY(ny) { return H - pd - ((ny + 0.4) / 1.8) * (H - 2 * pd); }
        function MX(nx) { return pd + nx * (W - 2 * pd); }
        x.strokeStyle = "#333"; x.lineWidth = 1;
        x.strokeRect(MX(0), MY(1), MX(1) - MX(0), MY(0) - MY(1));
        x.strokeStyle = "#4da6ff"; x.lineWidth = 2; x.beginPath(); x.moveTo(MX(0), MY(0));
        for (var s = 1; s <= 40; s++) { var t = s / 40; x.lineTo(MX(bez(t, 0, v[0], v[2], 1)), MY(bez(t, 0, v[1], v[3], 1))); }
        x.stroke();
        return c;
    }
    function renderGallery() {
        galleryWrap.innerHTML = "";
        var all = BUILTIN.map(function (p) { return { name: p.name, v: p.v, custom: false }; })
            .concat(userPresets.map(function (p) { return { name: p.name, v: p.v, custom: true }; }));
        all.forEach(function (p) {
            var chip = document.createElement("div"); chip.className = "chip";
            chip.appendChild(miniCurve(p.v));
            var lbl = document.createElement("span"); lbl.textContent = (p.custom ? "★ " : "") + p.name;
            chip.appendChild(lbl);
            chip.title = p.name;
            chip.addEventListener("click", function () { setCurve(p.v); });
            galleryWrap.appendChild(chip);
        });
    }
    $("gallery").addEventListener("click", function () {
        galleryOpen = !galleryOpen;
        galleryWrap.style.display = galleryOpen ? "grid" : "none";
        if (galleryOpen) renderGallery();
    });

    /* ---------------- preset actions ---------------- */
    $("save").addEventListener("click", function () {
        var name = window.prompt("Nama preset:", "My Ease");
        if (!name) return;
        userPresets = userPresets.filter(function (p) { return p.name !== name; });
        userPresets.push({ name: name, v: [cp.p1x, cp.p1y, cp.p2x, cp.p2y] });
        saveUser(userPresets); refreshPresets(); setStatus("OK:Preset '" + name + "' tersimpan");
    });
    $("del").addEventListener("click", function () {
        var val = presetSel.value;
        if (val[0] !== "u") { setStatus("ERR:Pilih preset custom (★) dulu"); return; }
        userPresets.splice(+val.slice(1), 1); saveUser(userPresets); refreshPresets();
    });
    $("exp").addEventListener("click", function () {
        if (!userPresets.length) { setStatus("ERR:Belum ada preset custom"); return; }
        var text = userPresets.map(function (p) { return p.name + "|" + p.v.join(","); }).join("\n");
        run("exportPresets", [text]);
    });
    $("imp").addEventListener("click", function () {
        cs.evalScript("ShanusiEase.importPresets()", function (res) {
            if (res.indexOf("DATA:") !== 0) { setStatus(res || "ERR:Gagal import"); return; }
            var lines = res.slice(5).split(/\r?\n/), added = 0;
            lines.forEach(function (ln) {
                if (!ln) return;
                var parts = ln.split("|"); if (parts.length < 2) return;
                var nums = parts[1].split(","); if (nums.length < 4) return;
                if (userPresets.some(function (p) { return p.name === parts[0]; })) return;
                userPresets.push({ name: parts[0], v: [+nums[0], +nums[1], +nums[2], +nums[3]] }); added++;
            });
            saveUser(userPresets); refreshPresets(); setStatus("OK:Import " + added + " preset");
        });
    });

    /* ---------------- jembatan host ---------------- */
    function esc(s) {
        return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n");
    }
    function run(fn, args) {
        var a = (args || []).map(function (x) {
            if (typeof x === "string") return '"' + esc(x) + '"';
            var n = Number(x); return isFinite(n) ? n : 0;
        }).join(",");
        cs.evalScript("ShanusiEase." + fn + "(" + a + ")", function (res) { setStatus(res); });
    }

    $("apply").addEventListener("click", function () {
        run("applyEase", [cp.p1x, cp.p1y, cp.p2x, cp.p2y, modeSel.value, (parseFloat(rnd.value) || 0) / 100]);
    });
    $("get").addEventListener("click", function () {
        cs.evalScript("ShanusiEase.getEase()", function (res) {
            if (res && res[0] === "{") {
                try {
                    var o = JSON.parse(res);
                    setCurve([clamp(o.p1x, 0, 1), o.p1y, clamp(o.p2x, 0, 1), o.p2y]);
                    setStatus("OK:Easing terbaca dari keyframe");
                } catch (e) { setStatus("ERR:Parse gagal"); }
            } else setStatus(res);
        });
    });
    $("copy").addEventListener("click", function () { run("copyEase", []); });
    $("paste").addEventListener("click", function () { run("pasteEase", []); });
    $("makeout").addEventListener("click", function () { run("makeOut", [1]); });
    $("bounce").addEventListener("click", function () {
        run("bounce", [clamp(Math.round(+$("bnum").value || 3), 1, 10), parseFloat($("bdec").value) || 0.5]);
    });
    $("elastic").addEventListener("click", function () {
        run("elastic", [clamp(Math.round(+$("enum").value || 4), 1, 12), parseFloat($("edmp").value) || 0.5]);
    });

    /* ---------------- tabs ---------------- */
    var tabs = document.querySelectorAll(".tab");
    tabs.forEach(function (tb) {
        tb.addEventListener("click", function () {
            tabs.forEach(function (x) { x.classList.remove("active"); });
            tb.classList.add("active");
            document.querySelectorAll(".panel").forEach(function (p) { p.classList.remove("active"); });
            activeTab = tb.dataset.tab;
            $("tab-" + activeTab).classList.add("active");
            sizeAll();
        });
    });

    /* ---------------- init ---------------- */
    function sizeAll() {
        if (activeTab === "ease") { fit(graph, gctx, 220); fit(strip, sctx, 26); }
        else { fit(bprev, bctx, 80); fit(eprev, ectx, 80); }
    }
    window.addEventListener("resize", sizeAll);
    refreshPresets();
    syncInputs();
    sizeAll();
    requestAnimationFrame(frame);
    cs.evalScript("ShanusiEase.ping()", function (res) { setStatus(res); });
})();
