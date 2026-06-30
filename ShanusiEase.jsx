/**********************************************************************
 * Shanusi Ease  -  After Effects easing / keyframe tool (AE 2020+)
 * --------------------------------------------------------------------
 * Fitur:
 *   1. Graph editor visual  -> drag handle bezier (P1 & P2) seperti Flow
 *   2. Apply easing          -> terapkan kurva ke keyframe yang dipilih
 *   3. Library preset        -> built-in + simpan/hapus preset custom
 *   4. Generator keyframe     -> Fade / Scale / Slide / Spin otomatis
 *
 * Pasang sebagai dockable panel:
 *   Copy file ini ke:
 *     Windows: <AE>/Support Files/Scripts/ScriptUI Panels/
 *   Lalu buka lewat menu  Window > ShanusiEase.jsx
 *   (Pastikan "Allow Scripts to Write Files and Access Network" aktif
 *    di Preferences > Scripting & Expressions agar preset bisa disimpan.)
 *********************************************************************/

(function (thisObj) {

    /* =================================================================
     * STATE
     * ===============================================================*/
    // Control point bezier ternormalisasi. Endpoint selalu (0,0) & (1,1).
    var cp = { p1x: 0.33, p1y: 0.00, p2x: 0.66, p2y: 1.00 };

    // Preset built-in (cubic-bezier ala CSS)
    var BUILTIN = [
        { name: "Linear",        v: [0.00, 0.00, 1.00, 1.00] },
        { name: "Ease",          v: [0.25, 0.10, 0.25, 1.00] },
        { name: "Ease In",       v: [0.42, 0.00, 1.00, 1.00] },
        { name: "Ease Out",      v: [0.00, 0.00, 0.58, 1.00] },
        { name: "Ease In-Out",   v: [0.42, 0.00, 0.58, 1.00] },
        { name: "Smooth",        v: [0.33, 0.00, 0.66, 1.00] },
        { name: "Quart Out",     v: [0.165, 0.84, 0.44, 1.00] },
        { name: "Expo Out",      v: [0.19, 1.00, 0.22, 1.00] },
        { name: "Overshoot",     v: [0.34, 1.56, 0.64, 1.00] },
        { name: "Anticipate",    v: [0.36, 0.00, 0.66, -0.56] }
    ];
    var userPresets = []; // {name, v:[4]}

    /* =================================================================
     * PRESET STORAGE  (file teks sederhana: name|p1x,p1y,p2x,p2y)
     * ===============================================================*/
    function presetFile() {
        var dir = new Folder(Folder.userData.fsName + "/ShanusiEase");
        if (!dir.exists) dir.create();
        return new File(dir.fsName + "/presets.txt");
    }
    function loadUserPresets() {
        userPresets = [];
        var f = presetFile();
        if (!f.exists) return;
        f.open("r");
        var line;
        while ((line = f.readln()) != null) {
            if (!line) continue;
            var parts = line.split("|");
            if (parts.length < 2) continue;
            var nums = parts[1].split(",");
            if (nums.length < 4) continue;
            userPresets.push({
                name: parts[0],
                v: [parseFloat(nums[0]), parseFloat(nums[1]),
                    parseFloat(nums[2]), parseFloat(nums[3])]
            });
        }
        f.close();
    }
    function saveUserPresets() {
        var f = presetFile();
        f.open("w");
        for (var i = 0; i < userPresets.length; i++) {
            var p = userPresets[i];
            f.writeln(p.name + "|" + p.v.join(","));
        }
        f.close();
    }

    function exportPresets() {
        if (!userPresets.length) { alert("Belum ada preset custom untuk di-export."); return; }
        var f = File.saveDialog("Export preset", "Text:*.txt");
        if (!f) return;
        f.open("w");
        for (var i = 0; i < userPresets.length; i++) {
            f.writeln(userPresets[i].name + "|" + userPresets[i].v.join(","));
        }
        f.close();
        alert("Ter-export: " + userPresets.length + " preset.");
    }
    function importPresets() {
        var f = File.openDialog("Import preset", "Text:*.txt");
        if (!f) return;
        f.open("r");
        var line, added = 0;
        while ((line = f.readln()) != null) {
            if (!line) continue;
            var parts = line.split("|");
            if (parts.length < 2) continue;
            var nums = parts[1].split(",");
            if (nums.length < 4) continue;
            // skip duplikat nama
            var dup = false;
            for (var j = 0; j < userPresets.length; j++) if (userPresets[j].name === parts[0]) { dup = true; break; }
            if (dup) continue;
            userPresets.push({
                name: parts[0],
                v: [parseFloat(nums[0]), parseFloat(nums[1]), parseFloat(nums[2]), parseFloat(nums[3])]
            });
            added++;
        }
        f.close();
        saveUserPresets();
        alert("Ter-import: " + added + " preset baru.");
        return added;
    }

    /* =================================================================
     * BEZIER MATH (untuk gambar kurva)
     * ===============================================================*/
    function bez(t, a, b, c, d) { // a,b,c,d = nilai pada P0,P1,P2,P3
        var mt = 1 - t;
        return mt * mt * mt * a + 3 * mt * mt * t * b + 3 * mt * t * t * c + t * t * t * d;
    }

    /* =================================================================
     * AE EASING
     * ===============================================================*/
    function clampInf(v) { return Math.max(0.1, Math.min(100, v)); }
    function clampN(v, a, b) { return Math.max(a, Math.min(b, v)); }

    // ---- Copy / Paste easing (baca array KeyframeEase asli, faithful) ----
    var clipEase = null; // {out:[{s,inf}], inn:[{s,inf}]}
    function easeToPlain(arr) {
        var o = [];
        for (var i = 0; i < arr.length; i++) o.push({ s: arr[i].speed, inf: arr[i].influence });
        return o;
    }
    function plainToEase(plain, n) {
        var o = [];
        for (var i = 0; i < n; i++) {
            var src = plain[Math.min(i, plain.length - 1)];
            o.push(new KeyframeEase(src.s, clampInf(src.inf)));
        }
        return o;
    }
    function copyEaseRaw() {
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) { alert("Buka composition dulu."); return; }
        var props = comp.selectedProperties;
        for (var i = 0; i < props.length; i++) {
            var p = props[i];
            if (!(p instanceof Property) || !p.canVaryOverTime) continue;
            var keys = p.selectedKeys;
            if (!keys || keys.length < 2) continue;
            clipEase = {
                out: easeToPlain(p.keyOutTemporalEase(keys[0])),
                inn: easeToPlain(p.keyInTemporalEase(keys[1]))
            };
            return;
        }
        alert("Pilih 2 keyframe untuk copy easing.");
    }
    function pasteEaseRaw() {
        if (!clipEase) { alert("Belum ada easing yang di-copy."); return; }
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) { alert("Buka composition dulu."); return; }
        var props = comp.selectedProperties;
        app.beginUndoGroup("Shanusi Ease - Paste");
        var touched = 0;
        for (var i = 0; i < props.length; i++) {
            var p = props[i];
            if (!(p instanceof Property) || !p.canVaryOverTime) continue;
            var keys = p.selectedKeys;
            if (!keys || keys.length < 2) continue;
            for (var k = 0; k < keys.length - 1; k++) {
                var kA = keys[k], kB = keys[k + 1];
                p.setInterpolationTypeAtKey(kA, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
                p.setInterpolationTypeAtKey(kB, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
                p.setTemporalEaseAtKey(kA, p.keyInTemporalEase(kA), plainToEase(clipEase.out, p.keyOutTemporalEase(kA).length));
                p.setTemporalEaseAtKey(kB, plainToEase(clipEase.inn, p.keyInTemporalEase(kB).length), p.keyOutTemporalEase(kB));
            }
            touched++;
        }
        app.endUndoGroup();
        if (!touched) alert("Pilih property + 2 keyframe untuk paste.");
    }

    function compDV(vA, vB, n, d) {
        // Selisih nilai per dimensi. Jika ease cuma 1 dimensi tapi nilai array
        // (mis. Position) -> pakai magnitude (sesuai speed graph AE).
        if (vA instanceof Array) {
            if (n === 1) {
                var s = 0;
                for (var i = 0; i < vA.length; i++) { var df = vB[i] - vA[i]; s += df * df; }
                return Math.sqrt(s);
            }
            return vB[d] - vA[d];
        }
        return vB - vA;
    }

    function easeBetween(prop, kA, kB, c, mode) {
        mode = mode || "both"; // "both" | "out" | "in"
        var tA = prop.keyTime(kA), tB = prop.keyTime(kB);
        var dT = tB - tA;
        if (dT <= 0) return;
        var vA = prop.keyValue(kA), vB = prop.keyValue(kB);

        prop.setInterpolationTypeAtKey(kA, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        prop.setInterpolationTypeAtKey(kB, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);

        if (mode === "both" || mode === "out") {
            var nOutA = prop.keyOutTemporalEase(kA).length;
            var outA = [];
            for (var d = 0; d < nOutA; d++) {
                var avg = compDV(vA, vB, nOutA, d) / dT;
                var spdOut = (c.p1x <= 0) ? 0 : avg * (c.p1y / c.p1x);
                outA.push(new KeyframeEase(spdOut, clampInf(c.p1x * 100)));
            }
            prop.setTemporalEaseAtKey(kA, prop.keyInTemporalEase(kA), outA);
        }
        if (mode === "both" || mode === "in") {
            var nInB = prop.keyInTemporalEase(kB).length;
            var inB = [];
            for (var d2 = 0; d2 < nInB; d2++) {
                var avg2 = compDV(vA, vB, nInB, d2) / dT;
                var spdIn = (c.p2x >= 1) ? 0 : avg2 * ((1 - c.p2y) / (1 - c.p2x));
                inB.push(new KeyframeEase(spdIn, clampInf((1 - c.p2x) * 100)));
            }
            prop.setTemporalEaseAtKey(kB, inB, prop.keyOutTemporalEase(kB));
        }
    }

    // Konversi balik: baca easing dari sepasang keyframe terpilih -> bezier
    function getEase() {
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) { alert("Buka composition dulu."); return null; }
        var props = comp.selectedProperties;
        for (var i = 0; i < props.length; i++) {
            var prop = props[i];
            if (!(prop instanceof Property) || !prop.canVaryOverTime) continue;
            var keys = prop.selectedKeys;
            if (!keys || keys.length < 2) continue;
            var kA = keys[0], kB = keys[1];
            var dT = prop.keyTime(kB) - prop.keyTime(kA);
            if (dT <= 0) continue;
            var vA = prop.keyValue(kA), vB = prop.keyValue(kB);

            var outE = prop.keyOutTemporalEase(kA)[0];
            var inE  = prop.keyInTemporalEase(kB)[0];
            var avgOut = compDV(vA, vB, prop.keyOutTemporalEase(kA).length, 0) / dT;
            var avgIn  = compDV(vA, vB, prop.keyInTemporalEase(kB).length, 0) / dT;

            var p1x = outE.influence / 100;
            var p1y = (avgOut === 0) ? p1x : p1x * (outE.speed / avgOut);
            var p2x = 1 - inE.influence / 100;
            var p2y = (avgIn === 0) ? p2x : 1 - (inE.influence / 100) * (inE.speed / avgIn);

            return { p1x: p1x, p1y: p1y, p2x: p2x, p2y: p2y };
        }
        alert("Pilih minimal 2 keyframe pada sebuah property dulu.");
        return null;
    }

    // Jitter influence ±amt (fraksi 0..1) untuk gerak organik
    function jitter(c, amt) {
        if (!amt) return c;
        function j(v) { return v * (1 + (Math.random() * 2 - 1) * amt); }
        return {
            p1x: clampN(j(c.p1x), 0, 1), p1y: c.p1y,
            p2x: clampN(j(c.p2x), 0, 1), p2y: c.p2y
        };
    }

    function applyEase(c, mode, rnd) {
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) { alert("Buka composition dulu."); return; }
        var props = comp.selectedProperties;
        if (!props || props.length === 0) { alert("Pilih property + keyframe dulu."); return; }

        app.beginUndoGroup("Shanusi Ease - Apply");
        var touched = 0;
        for (var i = 0; i < props.length; i++) {
            var prop = props[i];
            if (!(prop instanceof Property) || !prop.canVaryOverTime) continue;
            var keys = prop.selectedKeys;
            if (!keys || keys.length < 2) continue;
            for (var k = 0; k < keys.length - 1; k++) {
                easeBetween(prop, keys[k], keys[k + 1], jitter(c, rnd), mode);
            }
            touched++;
        }
        app.endUndoGroup();
        if (touched === 0) alert("Pilih minimal 2 keyframe pada sebuah property.");
    }

    /* =================================================================
     * BOUNCE  (pilih 2 keyframe -> sisipkan keyframe mantulan)
     * Model: gerak utama kf1->kf2, lalu mantulan overshoot ke arah kf1
     * dengan amplitudo & interval mengecil (gravitasi). Semua selesai
     * & settle tepat di waktu kf2 (kf2 tidak berubah).
     * ===============================================================*/
    function valTowards(vB, vA, f) { // vB + (vA - vB) * f
        if (vB instanceof Array) {
            var o = [];
            for (var i = 0; i < vB.length; i++) o.push(vB[i] + (vA[i] - vB[i]) * f);
            return o;
        }
        return vB + (vA - vB) * f;
    }
    function setSmoothKey(prop, idx, infIn, infOut) {
        prop.setInterpolationTypeAtKey(idx, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        var nIn = prop.keyInTemporalEase(idx).length, nOut = prop.keyOutTemporalEase(idx).length;
        var ein = [], eout = [], i;
        for (i = 0; i < nIn; i++) ein.push(new KeyframeEase(0, clampInf(infIn)));
        for (i = 0; i < nOut; i++) eout.push(new KeyframeEase(0, clampInf(infOut)));
        prop.setTemporalEaseAtKey(idx, ein, eout);
    }

    function bounceProp(prop, kA, kB, num, elastis) {
        var t0 = prop.keyTime(kA), t1 = prop.keyTime(kB);
        var vA = prop.keyValue(kA), vB = prop.keyValue(kB);
        var T = t1 - t0;
        if (T <= 0) return false;

        var d = Math.max(0.05, Math.min(0.95, elastis)); // amplitudo decay tiap mantul
        var qt = Math.sqrt(d);                            // decay durasi (waktu mengecil)

        // Total unit waktu: fall(=1) + tiap mantul (=2*qt^k)
        var units = 1, k;
        for (k = 1; k <= num; k++) units += 2 * Math.pow(qt, k);
        var scale = T / units;

        // Kumpulkan keyframe baru (selain kf1 & kf2 yang sudah ada)
        var pts = []; // {t, v}
        var tc = t0 + 1 * scale;           // waktu impact pertama (sampai vB)
        pts.push({ t: tc, v: vB, land: true });
        for (k = 1; k <= num; k++) {
            var half = Math.pow(qt, k) * scale;
            var peakV = valTowards(vB, vA, Math.pow(d, k)); // overshoot ke arah kf1
            pts.push({ t: tc + half, v: peakV, land: false });
            if (k < num) pts.push({ t: tc + 2 * half, v: vB, land: true });
            tc += 2 * half;
        }

        // Pasang value keyframe dulu
        for (var p = 0; p < pts.length; p++) prop.setValueAtTime(pts[p].t, pts[p].v);

        // Atur interpolasi: landing = LINEAR (sudut tajam), peak = halus
        for (p = 0; p < pts.length; p++) {
            var idx = prop.nearestKeyIndex(pts[p].t);
            if (pts[p].land) {
                prop.setInterpolationTypeAtKey(idx, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
            } else {
                setSmoothKey(prop, idx, 50, 50); // puncak membulat
            }
        }
        // kf1: lepas mulus (akselerasi), kf2: settle mulus
        setSmoothKey(prop, prop.nearestKeyIndex(t0), 20, 33);
        setSmoothKey(prop, prop.nearestKeyIndex(t1), 50, 20);
        return true;
    }

    function bounce(num, decay) {
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) { alert("Buka composition dulu."); return; }
        var props = comp.selectedProperties;
        app.beginUndoGroup("Shanusi Ease - Bounce");
        var touched = 0;
        for (var i = 0; i < props.length; i++) {
            var prop = props[i];
            if (!(prop instanceof Property) || !prop.canVaryOverTime) continue;
            var keys = prop.selectedKeys;
            if (!keys || keys.length < 2) continue;
            // pakai 2 keyframe pertama yang dipilih
            if (bounceProp(prop, keys[0], keys[1], num, decay)) touched++;
        }
        app.endUndoGroup();
        if (touched === 0) alert("Pilih tepat 2 keyframe (nilai berbeda) pada sebuah property.");
    }

    /* =================================================================
     * ELASTIC  (pegas: melewati target lalu osilasi bolak-balik
     * MELINTASI target, amplitudo meredam, frekuensi konstan)
     * ===============================================================*/
    function elasticProp(prop, kA, kB, num, redam) {
        var t0 = prop.keyTime(kA), t1 = prop.keyTime(kB);
        var vA = prop.keyValue(kA), vB = prop.keyValue(kB);
        var T = t1 - t0;
        if (T <= 0) return false;

        var d = Math.max(0.05, Math.min(0.95, redam)); // rasio amplitudo tiap osilasi
        var pts = [], k;
        for (k = 1; k <= num; k++) {
            var sign = (k % 2 === 1) ? 1 : -1;          // selang-seling sisi target
            var frac = Math.pow(d, k) * sign;           // offset relatif thd jarak A->B
            var v = valTowards(vB, vA, -frac);          // vB + (vB - vA) * frac
            var t = t0 + T * k / (num + 1);             // jarak waktu RATA (frekuensi konstan)
            pts.push({ t: t, v: v });
        }
        for (var p = 0; p < pts.length; p++) prop.setValueAtTime(pts[p].t, pts[p].v);
        // semua titik puncak/lembah = halus (speed 0) -> bentuk sinus meredam
        for (p = 0; p < pts.length; p++) setSmoothKey(prop, prop.nearestKeyIndex(pts[p].t), 50, 50);
        setSmoothKey(prop, prop.nearestKeyIndex(t0), 33, 33); // lepas
        setSmoothKey(prop, prop.nearestKeyIndex(t1), 50, 33); // settle
        return true;
    }

    function elastic(num, redam) {
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) { alert("Buka composition dulu."); return; }
        var props = comp.selectedProperties;
        app.beginUndoGroup("Shanusi Ease - Elastic");
        var touched = 0;
        for (var i = 0; i < props.length; i++) {
            var prop = props[i];
            if (!(prop instanceof Property) || !prop.canVaryOverTime) continue;
            var keys = prop.selectedKeys;
            if (!keys || keys.length < 2) continue;
            if (elasticProp(prop, keys[0], keys[1], num, redam)) touched++;
        }
        app.endUndoGroup();
        if (touched === 0) alert("Pilih tepat 2 keyframe (nilai berbeda) pada sebuah property.");
    }

    /* =================================================================
     * MAKE OUT  (balikan animasi masuk -> animasi keluar di playhead)
     * Membaca keyframe terpilih lalu menulis salinan TERBALIK (value +
     * easing + interpolasi + spatial tangent) mulai dari playhead.
     * Keyframe masuk asli dibiarkan utuh.
     * ===============================================================*/
    function negEase(arr) {
        var o = [];
        for (var i = 0; i < arr.length; i++) o.push(new KeyframeEase(-arr[i].speed, arr[i].influence));
        return o;
    }
    function negVec(v) { var o = []; for (var i = 0; i < v.length; i++) o.push(-v[i]); return o; }

    function reverseToOut(prop, keys, A, durScale) {
        var n = keys.length;
        var spatial = prop.isSpatial;
        var tLast = prop.keyTime(keys[n - 1]);
        // Rekam dulu data keyframe sumber (sebelum menambah key baru)
        var data = [];
        for (var i = 0; i < n; i++) {
            var k = keys[i];
            data.push({
                t: prop.keyTime(k),
                v: prop.keyValue(k),
                inI: prop.keyInInterpolationType(k),
                outI: prop.keyOutInterpolationType(k),
                inE: prop.keyInTemporalEase(k),
                outE: prop.keyOutTemporalEase(k),
                inS: spatial ? prop.keyInSpatialTangent(k) : null,
                outS: spatial ? prop.keyOutSpatialTangent(k) : null
            });
        }
        // Pass 1: tulis value di waktu terbalik (offset dari key terakhir)
        for (i = 0; i < n; i++) {
            var nt = A + (tLast - data[i].t) * durScale;
            prop.setValueAtTime(nt, data[i].v);
        }
        // Pass 2: set interpolasi/ease/tangent (in<->out ditukar, speed dibalik)
        for (i = 0; i < n; i++) {
            var s = data[i];
            var ntt = A + (tLast - s.t) * durScale;
            var idx = prop.nearestKeyIndex(ntt);
            prop.setInterpolationTypeAtKey(idx, s.outI, s.inI);
            try { prop.setTemporalEaseAtKey(idx, negEase(s.outE), negEase(s.inE)); } catch (e) {}
            if (spatial && s.inS && s.outS) {
                try { prop.setSpatialTangentsAtKey(idx, negVec(s.outS), negVec(s.inS)); } catch (e2) {}
            }
        }
        return true;
    }

    function makeOut(durScale) {
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) { alert("Buka composition dulu."); return; }
        var props = comp.selectedProperties;
        var A = comp.time;
        app.beginUndoGroup("Shanusi Ease - Make Out");
        var touched = 0;
        for (var i = 0; i < props.length; i++) {
            var prop = props[i];
            if (!(prop instanceof Property) || !prop.canVaryOverTime) continue;
            var keys = prop.selectedKeys;
            if (!keys || keys.length < 2) continue;
            if (reverseToOut(prop, keys, A, durScale)) touched++;
        }
        app.endUndoGroup();
        if (touched === 0) alert("Pilih keyframe animasi masuk (min 2) dulu, lalu taruh playhead di posisi exit.");
    }

    /* =================================================================
     * UI
     * ===============================================================*/
    function buildUI(thisObj) {
        loadUserPresets();

        var win = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", "Shanusi Ease", undefined, { resizeable: true });
        win.alignChildren = ["fill", "top"];
        win.spacing = 4;
        win.margins = 6;

        var tabs = win.add("tabbedpanel");
        tabs.alignChildren = ["fill", "top"];
        var tabEase = tabs.add("tab", undefined, "Ease");
        var tabMake = tabs.add("tab", undefined, "Create");
        tabEase.alignChildren = ["fill", "top"]; tabEase.spacing = 4; tabEase.margins = 8;
        tabMake.alignChildren = ["fill", "top"]; tabMake.spacing = 6; tabMake.margins = 8;
        tabs.selection = tabEase;

        /* ---------- GRAPH CANVAS ---------- */
        var canvas = tabEase.add("group");
        canvas.preferredSize = [260, 220];
        canvas.minimumSize = [220, 180];

        // Ruang vertikal dinamis (zoom). View Y = [0.5 - vHalf, 0.5 + vHalf].
        // vHalf kecil = zoom in (rapat), besar = zoom out (banyak ruang overshoot).
        var PAD = 26;
        var vHalf = 1.2, V_MIN = 0.55, V_MAX = 3.0;
        var YMIN, YMAX, YRANGE;
        function applyZoom() { YMIN = 0.5 - vHalf; YMAX = 0.5 + vHalf; YRANGE = YMAX - YMIN; }
        applyZoom();
        function plot() {
            var W = canvas.size[0], H = canvas.size[1];
            var pw = W - 2 * PAD, ph = H - 2 * PAD;
            return {
                W: W, H: H, pw: pw, ph: ph,
                sx: function (nx) { return PAD + nx * pw; },
                sy: function (ny) { return H - PAD - ((ny - YMIN) / YRANGE) * ph; },
                nx: function (sx) { return (sx - PAD) / pw; },
                ny: function (sy) { return YMIN + ((H - PAD - sy) / ph) * YRANGE; }
            };
        }

        canvas.onDraw = function () {
            var g = this.graphics;
            var P = plot();

            // background
            var bg = g.newBrush(g.BrushType.SOLID_COLOR, [0.16, 0.16, 0.16, 1]);
            g.newPath(); g.rectPath(0, 0, P.W, P.H); g.fillPath(bg);

            // grid halus (full tinggi, termasuk area overshoot)
            var gpen = g.newPen(g.PenType.SOLID_COLOR, [0.23, 0.23, 0.23, 1], 1);
            var t;
            for (t = 0; t <= 1.0001; t += 0.25) {
                g.newPath(); g.moveTo(P.sx(t), P.sy(YMIN)); g.lineTo(P.sx(t), P.sy(YMAX)); g.strokePath(gpen);
            }
            // garis horizontal tiap 0.5 yang masuk range (ikut zoom)
            var yy;
            for (yy = Math.ceil(YMIN / 0.5) * 0.5; yy <= YMAX + 1e-6; yy += 0.5) {
                if (Math.abs(yy) < 1e-6 || Math.abs(yy - 1) < 1e-6) continue; // 0 & 1 = box
                g.newPath(); g.moveTo(P.sx(0), P.sy(yy)); g.lineTo(P.sx(1), P.sy(yy)); g.strokePath(gpen);
            }

            // kotak unit (0..1) ditegaskan -> batas "normal", luar = overshoot
            var bpen = g.newPen(g.PenType.SOLID_COLOR, [0.42, 0.42, 0.42, 1], 1);
            g.newPath(); g.moveTo(P.sx(0), P.sy(0)); g.lineTo(P.sx(1), P.sy(0)); g.strokePath(bpen);
            g.newPath(); g.moveTo(P.sx(0), P.sy(1)); g.lineTo(P.sx(1), P.sy(1)); g.strokePath(bpen);
            g.newPath(); g.moveTo(P.sx(0), P.sy(0)); g.lineTo(P.sx(0), P.sy(1)); g.strokePath(bpen);
            g.newPath(); g.moveTo(P.sx(1), P.sy(0)); g.lineTo(P.sx(1), P.sy(1)); g.strokePath(bpen);

            // diagonal referensi (linear)
            var dpen = g.newPen(g.PenType.SOLID_COLOR, [0.33, 0.33, 0.33, 1], 1);
            g.newPath(); g.moveTo(P.sx(0), P.sy(0)); g.lineTo(P.sx(1), P.sy(1)); g.strokePath(dpen);

            // handle lines
            var hpen = g.newPen(g.PenType.SOLID_COLOR, [0.55, 0.55, 0.55, 1], 1);
            g.newPath(); g.moveTo(P.sx(0), P.sy(0)); g.lineTo(P.sx(cp.p1x), P.sy(cp.p1y)); g.strokePath(hpen);
            g.newPath(); g.moveTo(P.sx(1), P.sy(1)); g.lineTo(P.sx(cp.p2x), P.sy(cp.p2y)); g.strokePath(hpen);

            // bezier curve
            var cpen = g.newPen(g.PenType.SOLID_COLOR, [0.30, 0.66, 1.00, 1], 2);
            g.newPath();
            g.moveTo(P.sx(0), P.sy(0));
            var steps = 64;
            for (var s = 1; s <= steps; s++) {
                var tt = s / steps;
                var bx = bez(tt, 0, cp.p1x, cp.p2x, 1);
                var by = bez(tt, 0, cp.p1y, cp.p2y, 1);
                g.lineTo(P.sx(bx), P.sy(by));
            }
            g.strokePath(cpen);

            // control points (kotak)
            function dot(nx, ny, col) {
                var b = g.newBrush(g.BrushType.SOLID_COLOR, col);
                var x = P.sx(nx), y = P.sy(ny), r = 4;
                g.newPath(); g.rectPath(x - r, y - r, 2 * r, 2 * r); g.fillPath(b);
            }
            dot(cp.p1x, cp.p1y, [0.30, 0.66, 1.00, 1]);
            dot(cp.p2x, cp.p2y, [1.00, 0.55, 0.30, 1]);
        };

        // Repaint paksa: notify("onDraw") sering DITUNDA AE (cuma ke-redraw saat
        // ada event natural spt hover). Poke ukuran -> ScriptUI invalidasi &
        // repaint seketika. Disetel ke nilai sama jadi tampilan tidak loncat.
        function redraw() {
            try { canvas.notify("onDraw"); } catch (e) {}
            try {
                var s = canvas.size;
                canvas.size = [s[0], s[1]];
            } catch (e2) {}
            try { if (win.update) win.update(); } catch (e3) {}
        }

        // --- drag interaksi ---
        // Catatan responsiveness: field angka TIDAK di-update tiap gerak
        // (penulisan edittext bikin ScriptUI nunda repaint). Hanya update
        // saat lepas mouse -> drag jadi mulus & langsung kebawa.
        var dragging = 0; // 0 = none, 1 = P1, 2 = P2
        canvas.addEventListener("mousedown", function (ev) {
            var P = plot();
            var mx = ev.clientX, my = ev.clientY;
            var d1 = dist(mx, my, P.sx(cp.p1x), P.sy(cp.p1y));
            var d2 = dist(mx, my, P.sx(cp.p2x), P.sy(cp.p2y));
            dragging = (d1 < d2) ? (d1 < 18 ? 1 : 0) : (d2 < 18 ? 2 : 0);
        });
        canvas.addEventListener("mousemove", function (ev) {
            if (!dragging) return;
            var P = plot();
            var nx = clamp(P.nx(ev.clientX), 0, 1);
            var ny = clamp(P.ny(ev.clientY), YMIN, YMAX);
            if (dragging === 1) { cp.p1x = nx; cp.p1y = ny; }
            else                { cp.p2x = nx; cp.p2y = ny; }
            redraw();
        });
        canvas.addEventListener("mouseup", function () {
            if (dragging) syncFields();
            dragging = 0;
            redraw();
        });
        function dist(ax, ay, bx, by) { return Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by)); }
        function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

        /* ---------- BARIS ZOOM ---------- */
        var zrow = tabEase.add("group");
        zrow.spacing = 3;
        zrow.alignment = ["right", "top"];
        zrow.add("statictext", undefined, "Zoom");
        var bZout = zrow.add("button", undefined, "−"); bZout.preferredSize.width = 26; bZout.helpTip = "Zoom out (lebih banyak ruang overshoot)";
        var bZin  = zrow.add("button", undefined, "+"); bZin.preferredSize.width = 26;  bZin.helpTip = "Zoom in";
        var bZfit = zrow.add("button", undefined, "Fit"); bZfit.preferredSize.width = 34; bZfit.helpTip = "Reset zoom default";
        bZout.onClick = function () { vHalf = Math.min(V_MAX, vHalf * 1.25); applyZoom(); redraw(); };
        bZin.onClick  = function () { vHalf = Math.max(V_MIN, vHalf * 0.8);  applyZoom(); redraw(); };
        bZfit.onClick = function () { vHalf = 1.2; applyZoom(); redraw(); };

        /* ---------- BARIS NILAI P1/P2 + RND ---------- */
        var fields = tabEase.add("group");
        fields.spacing = 3;
        fields.add("statictext", undefined, "P1");
        var f1x = fields.add("edittext", undefined, cp.p1x); f1x.characters = 4;
        var f1y = fields.add("edittext", undefined, cp.p1y); f1y.characters = 4;
        fields.add("statictext", undefined, "P2");
        var f2x = fields.add("edittext", undefined, cp.p2x); f2x.characters = 4;
        var f2y = fields.add("edittext", undefined, cp.p2y); f2y.characters = 4;
        fields.add("statictext", undefined, "Rnd");
        var fRnd = fields.add("edittext", undefined, "0"); fRnd.characters = 3;
        fRnd.helpTip = "Randomize influence (%) saat Apply";

        function syncFields() {
            f1x.text = round(cp.p1x); f1y.text = round(cp.p1y);
            f2x.text = round(cp.p2x); f2y.text = round(cp.p2y);
        }
        function round(v) { return Math.round(v * 1000) / 1000; }
        function readFields() {
            cp.p1x = clamp(parseFloat(f1x.text) || 0, 0, 1);
            cp.p1y = parseFloat(f1y.text) || 0;
            cp.p2x = clamp(parseFloat(f2x.text) || 0, 0, 1);
            cp.p2y = parseFloat(f2y.text) || 0;
            redraw();
        }
        f1x.onChange = f1y.onChange = f2x.onChange = f2y.onChange = readFields;

        /* ---------- BARIS PRESET ---------- */
        var prow = tabEase.add("group");
        prow.spacing = 3;
        var ddl = prow.add("dropdownlist", undefined, []);
        ddl.alignment = ["fill", "center"];
        ddl.helpTip = "Preset easing";
        var bGet  = prow.add("button", undefined, "Get");  bGet.preferredSize.width = 34;  bGet.helpTip = "Baca easing dari keyframe terpilih ke graph";
        var bSave = prow.add("button", undefined, "+");     bSave.preferredSize.width = 24; bSave.helpTip = "Simpan kurva jadi preset";
        var bDel  = prow.add("button", undefined, "−"); bDel.preferredSize.width = 24; bDel.helpTip = "Hapus preset custom";
        var bExp  = prow.add("button", undefined, "↑"); bExp.preferredSize.width = 24; bExp.helpTip = "Export preset ke file";
        var bImp  = prow.add("button", undefined, "↓"); bImp.preferredSize.width = 24; bImp.helpTip = "Import preset dari file";

        function refreshPresetList() {
            ddl.removeAll();
            for (var i = 0; i < BUILTIN.length; i++) ddl.add("item", BUILTIN[i].name);
            if (userPresets.length) ddl.add("item", "──────────");
            for (var j = 0; j < userPresets.length; j++) ddl.add("item", "* " + userPresets[j].name);
        }
        refreshPresetList();

        ddl.onChange = function () {
            if (!ddl.selection) return;
            var idx = ddl.selection.index;
            var v = null;
            if (idx < BUILTIN.length) v = BUILTIN[idx].v;
            else {
                var ui = idx - BUILTIN.length - 1; // -1 utk separator
                if (ui >= 0 && ui < userPresets.length) v = userPresets[ui].v;
            }
            if (v) {
                cp.p1x = v[0]; cp.p1y = v[1]; cp.p2x = v[2]; cp.p2y = v[3];
                syncFields(); redraw();
            }
        };
        bSave.onClick = function () {
            var name = prompt("Nama preset:", "My Ease");
            if (!name) return;
            for (var i = 0; i < userPresets.length; i++) {
                if (userPresets[i].name === name) { userPresets.splice(i, 1); break; }
            }
            userPresets.push({ name: name, v: [cp.p1x, cp.p1y, cp.p2x, cp.p2y] });
            saveUserPresets();
            refreshPresetList();
        };
        bDel.onClick = function () {
            if (!ddl.selection) return;
            var ui = ddl.selection.index - BUILTIN.length - 1;
            if (ui < 0 || ui >= userPresets.length) { alert("Pilih preset custom (* ) dulu."); return; }
            userPresets.splice(ui, 1);
            saveUserPresets();
            refreshPresetList();
        };
        bExp.onClick = function () { exportPresets(); };
        bImp.onClick = function () { if (importPresets()) refreshPresetList(); };

        /* ---------- BARIS MODE + COPY/PASTE ---------- */
        var arow = tabEase.add("group");
        arow.spacing = 3;
        var modeDdl = arow.add("dropdownlist", undefined, ["Both", "Out", "In"]);
        modeDdl.selection = 0; modeDdl.helpTip = "Sisi easing yang di-apply";
        modeDdl.alignment = ["fill", "center"];
        var bCopy  = arow.add("button", undefined, "Copy");  bCopy.helpTip = "Copy easing asli dari keyframe";
        var bPaste = arow.add("button", undefined, "Paste"); bPaste.helpTip = "Paste easing ke keyframe terpilih";
        bCopy.onClick = function () { copyEaseRaw(); };
        bPaste.onClick = function () { pasteEaseRaw(); };

        var bApply = tabEase.add("button", undefined, "APPLY");
        function curMode() {
            var i = modeDdl.selection ? modeDdl.selection.index : 0;
            return (i === 1) ? "out" : (i === 2) ? "in" : "both";
        }
        function curRnd() { return clampN((parseFloat(fRnd.text) || 0) / 100, 0, 1); }
        bGet.onClick = function () {
            var c = getEase();
            if (!c) return;
            cp.p1x = c.p1x; cp.p1y = c.p1y; cp.p2x = c.p2x; cp.p2y = c.p2y;
            syncFields(); redraw();
        };
        bApply.onClick = function () { applyEase(cp, curMode(), curRnd()); };

        /* ====================  TAB CREATE  ==================== */
        /* ---------- MASUK -> KELUAR  (balikan di playhead) ---------- */
        tabMake.add("statictext", undefined, "Masuk → Keluar");
        var bOut = tabMake.add("button", undefined, "BUAT KELUAR (di playhead)");
        bOut.helpTip = "Pilih keyframe animasi MASUK + taruh playhead di posisi exit, lalu klik. Animasi keluar = balikan dari masuk.";
        bOut.onClick = function () { makeOut(1); };

        /* ---------- BOUNCE  (mantul satu sisi, gaya bola) ---------- */
        tabMake.add("statictext", undefined, "Bounce  (pilih 2 keyframe)");
        var br = tabMake.add("group"); br.spacing = 3;
        br.add("statictext", undefined, "Jml");
        var bNum = br.add("edittext", undefined, "3"); bNum.characters = 3; bNum.helpTip = "Jumlah mantulan (1-10)";
        br.add("statictext", undefined, "Decay");
        var bDec = br.add("edittext", undefined, "0.5"); bDec.characters = 4; bDec.helpTip = "Peluruhan tinggi mantul. 0.1=cepat redam, 0.9=mantul lama";
        var bBounce = br.add("button", undefined, "BOUNCE");
        bBounce.onClick = function () {
            var n = Math.max(1, Math.min(10, Math.round(parseFloat(bNum.text) || 3)));
            var e = parseFloat(bDec.text); if (isNaN(e)) e = 0.5;
            bounce(n, e);
        };

        /* ---------- ELASTIC  (osilasi dua sisi, gaya pegas) ---------- */
        tabMake.add("statictext", undefined, "Elastic  (pilih 2 keyframe)");
        var er = tabMake.add("group"); er.spacing = 3;
        er.add("statictext", undefined, "Osilasi");
        var eNum = er.add("edittext", undefined, "4"); eNum.characters = 3; eNum.helpTip = "Berapa kali bolak-balik melintasi target (1-12)";
        er.add("statictext", undefined, "Redam");
        var eDmp = er.add("edittext", undefined, "0.5"); eDmp.characters = 4; eDmp.helpTip = "0.1=cepat diam, 0.9=getar lama & overshoot besar";
        var bElastic = er.add("button", undefined, "ELASTIC");
        bElastic.onClick = function () {
            var n = Math.max(1, Math.min(12, Math.round(parseFloat(eNum.text) || 4)));
            var e = parseFloat(eDmp.text); if (isNaN(e)) e = 0.5;
            elastic(n, e);
        };

        /* ---------- LAYOUT ---------- */
        win.onResizing = win.onResize = function () { this.layout.resize(); redraw(); };
        if (win instanceof Window) { win.center(); win.show(); }
        else { win.layout.layout(true); win.layout.resize(); }
        redraw();
        return win;
    }

    buildUI(thisObj);

})(this);
