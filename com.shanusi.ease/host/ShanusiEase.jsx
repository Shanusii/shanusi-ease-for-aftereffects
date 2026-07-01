/**********************************************************************
 * Shanusi Ease — HOST (ExtendScript) untuk CEP extension
 * --------------------------------------------------------------------
 * Semua logika AE ada di sini, di-namespace ke $.global.ShanusiEase agar
 * tidak bentrok dengan script lain (ExtendScript berbagi 1 global engine).
 * Dipanggil dari UI lewat: csInterface.evalScript("ShanusiEase.bounce(3,0.5)")
 * Setiap fungsi publik mengembalikan STRING: "OK..." / "ERR:..." / data JSON.
 *********************************************************************/

$.global.ShanusiEase = (function () {

    /* ---------------- util ---------------- */
    function clampInf(v) { return Math.max(0.1, Math.min(100, v)); }
    function clampN(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function activeComp() {
        var c = app.project.activeItem;
        return (c && c instanceof CompItem) ? c : null;
    }
    function isProp(p) { return (p instanceof Property) && p.canVaryOverTime; }

    function compDV(vA, vB, n, d) {
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

    /* ---------------- easing inti ---------------- */
    function easeBetween(prop, kA, kB, c, mode) {
        mode = mode || "both";
        var tA = prop.keyTime(kA), tB = prop.keyTime(kB);
        var dT = tB - tA;
        if (dT <= 0) return;
        var vA = prop.keyValue(kA), vB = prop.keyValue(kB);

        prop.setInterpolationTypeAtKey(kA, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        prop.setInterpolationTypeAtKey(kB, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);

        if (mode === "both" || mode === "out") {
            var nOutA = prop.keyOutTemporalEase(kA).length, outA = [];
            for (var d = 0; d < nOutA; d++) {
                var avg = compDV(vA, vB, nOutA, d) / dT;
                var spdOut = (c.p1x <= 0) ? 0 : avg * (c.p1y / c.p1x);
                outA.push(new KeyframeEase(spdOut, clampInf(c.p1x * 100)));
            }
            prop.setTemporalEaseAtKey(kA, prop.keyInTemporalEase(kA), outA);
        }
        if (mode === "both" || mode === "in") {
            var nInB = prop.keyInTemporalEase(kB).length, inB = [];
            for (var d2 = 0; d2 < nInB; d2++) {
                var avg2 = compDV(vA, vB, nInB, d2) / dT;
                var spdIn = (c.p2x >= 1) ? 0 : avg2 * ((1 - c.p2y) / (1 - c.p2x));
                inB.push(new KeyframeEase(spdIn, clampInf((1 - c.p2x) * 100)));
            }
            prop.setTemporalEaseAtKey(kB, inB, prop.keyOutTemporalEase(kB));
        }
    }

    function jitter(c, amt) {
        if (!amt) return c;
        function j(v) { return v * (1 + (Math.random() * 2 - 1) * amt); }
        return { p1x: clampN(j(c.p1x), 0, 1), p1y: c.p1y, p2x: clampN(j(c.p2x), 0, 1), p2y: c.p2y };
    }

    /* ---------------- API: APPLY ---------------- */
    function applyEase(p1x, p1y, p2x, p2y, mode, rnd) {
        var comp = activeComp();
        if (!comp) return "ERR:Buka composition dulu.";
        var c = { p1x: p1x, p1y: p1y, p2x: p2x, p2y: p2y };
        var props = comp.selectedProperties;
        if (!props || props.length === 0) return "ERR:Pilih property + keyframe dulu.";
        app.beginUndoGroup("Shanusi Ease - Apply");
        var touched = 0;
        for (var i = 0; i < props.length; i++) {
            var prop = props[i];
            if (!isProp(prop)) continue;
            var keys = prop.selectedKeys;
            if (!keys || keys.length < 2) continue;
            for (var k = 0; k < keys.length - 1; k++)
                easeBetween(prop, keys[k], keys[k + 1], jitter(c, rnd || 0), mode);
            touched++;
        }
        app.endUndoGroup();
        return touched ? ("OK:Apply ke " + touched + " property") : "ERR:Pilih min 2 keyframe pada property.";
    }

    /* ---------------- API: GET ---------------- */
    function getEase() {
        var comp = activeComp();
        if (!comp) return "ERR:Buka composition dulu.";
        var props = comp.selectedProperties;
        for (var i = 0; i < props.length; i++) {
            var prop = props[i];
            if (!isProp(prop)) continue;
            var keys = prop.selectedKeys;
            if (!keys || keys.length < 2) continue;
            var kA = keys[0], kB = keys[1];
            var dT = prop.keyTime(kB) - prop.keyTime(kA);
            if (dT <= 0) continue;
            var vA = prop.keyValue(kA), vB = prop.keyValue(kB);
            var outE = prop.keyOutTemporalEase(kA)[0], inE = prop.keyInTemporalEase(kB)[0];
            var avgOut = compDV(vA, vB, prop.keyOutTemporalEase(kA).length, 0) / dT;
            var avgIn = compDV(vA, vB, prop.keyInTemporalEase(kB).length, 0) / dT;
            var p1x = outE.influence / 100;
            var p1y = (avgOut === 0) ? p1x : p1x * (outE.speed / avgOut);
            var p2x = 1 - inE.influence / 100;
            var p2y = (avgIn === 0) ? p2x : 1 - (inE.influence / 100) * (inE.speed / avgIn);
            return '{"p1x":' + p1x + ',"p1y":' + p1y + ',"p2x":' + p2x + ',"p2y":' + p2y + '}';
        }
        return "ERR:Pilih min 2 keyframe pada property.";
    }

    /* ---------------- API: COPY / PASTE (faithful) ---------------- */
    var clipEase = null;
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
    function copyEase() {
        var comp = activeComp();
        if (!comp) return "ERR:Buka composition dulu.";
        var props = comp.selectedProperties;
        for (var i = 0; i < props.length; i++) {
            var p = props[i];
            if (!isProp(p)) continue;
            var keys = p.selectedKeys;
            if (!keys || keys.length < 2) continue;
            clipEase = { out: easeToPlain(p.keyOutTemporalEase(keys[0])), inn: easeToPlain(p.keyInTemporalEase(keys[1])) };
            return "OK:Easing tersalin";
        }
        return "ERR:Pilih 2 keyframe untuk copy.";
    }
    function pasteEase() {
        if (!clipEase) return "ERR:Belum ada easing yang di-copy.";
        var comp = activeComp();
        if (!comp) return "ERR:Buka composition dulu.";
        var props = comp.selectedProperties;
        app.beginUndoGroup("Shanusi Ease - Paste");
        var touched = 0;
        for (var i = 0; i < props.length; i++) {
            var p = props[i];
            if (!isProp(p)) continue;
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
        return touched ? ("OK:Paste ke " + touched + " property") : "ERR:Pilih property + 2 keyframe.";
    }

    /* ---------------- API: BOUNCE ---------------- */
    function valTowards(vB, vA, f) {
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
    function bounceProp(prop, kA, kB, num, decay) {
        var t0 = prop.keyTime(kA), t1 = prop.keyTime(kB);
        var vA = prop.keyValue(kA), vB = prop.keyValue(kB);
        var T = t1 - t0; if (T <= 0) return false;
        var d = Math.max(0.05, Math.min(0.95, decay)), qt = Math.sqrt(d);
        var units = 1, k;
        for (k = 1; k <= num; k++) units += 2 * Math.pow(qt, k);
        var scale = T / units, pts = [], tc = t0 + scale;
        pts.push({ t: tc, v: vB, land: true });
        for (k = 1; k <= num; k++) {
            var half = Math.pow(qt, k) * scale;
            pts.push({ t: tc + half, v: valTowards(vB, vA, Math.pow(d, k)), land: false });
            if (k < num) pts.push({ t: tc + 2 * half, v: vB, land: true });
            tc += 2 * half;
        }
        for (var p = 0; p < pts.length; p++) prop.setValueAtTime(pts[p].t, pts[p].v);
        for (p = 0; p < pts.length; p++) {
            var idx = prop.nearestKeyIndex(pts[p].t);
            if (pts[p].land) prop.setInterpolationTypeAtKey(idx, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
            else setSmoothKey(prop, idx, 50, 50);
        }
        setSmoothKey(prop, prop.nearestKeyIndex(t0), 20, 33);
        setSmoothKey(prop, prop.nearestKeyIndex(t1), 50, 20);
        return true;
    }
    function bounce(num, decay) {
        var comp = activeComp();
        if (!comp) return "ERR:Buka composition dulu.";
        var props = comp.selectedProperties;
        app.beginUndoGroup("Shanusi Ease - Bounce");
        var touched = 0;
        for (var i = 0; i < props.length; i++) {
            var prop = props[i];
            if (!isProp(prop)) continue;
            var keys = prop.selectedKeys;
            if (!keys || keys.length < 2) continue;
            if (bounceProp(prop, keys[0], keys[1], num, decay)) touched++;
        }
        app.endUndoGroup();
        return touched ? ("OK:Bounce di " + touched + " property") : "ERR:Pilih 2 keyframe (nilai beda).";
    }

    /* ---------------- API: ELASTIC ---------------- */
    function elasticProp(prop, kA, kB, num, redam) {
        var t0 = prop.keyTime(kA), t1 = prop.keyTime(kB);
        var vA = prop.keyValue(kA), vB = prop.keyValue(kB);
        var T = t1 - t0; if (T <= 0) return false;
        var d = Math.max(0.05, Math.min(0.95, redam)), pts = [], k;
        for (k = 1; k <= num; k++) {
            var sign = (k % 2 === 1) ? 1 : -1;
            var frac = Math.pow(d, k) * sign;
            pts.push({ t: t0 + T * k / (num + 1), v: valTowards(vB, vA, -frac) });
        }
        for (var p = 0; p < pts.length; p++) prop.setValueAtTime(pts[p].t, pts[p].v);
        for (p = 0; p < pts.length; p++) setSmoothKey(prop, prop.nearestKeyIndex(pts[p].t), 50, 50);
        setSmoothKey(prop, prop.nearestKeyIndex(t0), 33, 33);
        setSmoothKey(prop, prop.nearestKeyIndex(t1), 50, 33);
        return true;
    }
    function elastic(num, redam) {
        var comp = activeComp();
        if (!comp) return "ERR:Buka composition dulu.";
        var props = comp.selectedProperties;
        app.beginUndoGroup("Shanusi Ease - Elastic");
        var touched = 0;
        for (var i = 0; i < props.length; i++) {
            var prop = props[i];
            if (!isProp(prop)) continue;
            var keys = prop.selectedKeys;
            if (!keys || keys.length < 2) continue;
            if (elasticProp(prop, keys[0], keys[1], num, redam)) touched++;
        }
        app.endUndoGroup();
        return touched ? ("OK:Elastic di " + touched + " property") : "ERR:Pilih 2 keyframe (nilai beda).";
    }

    /* ---------------- API: MAKE OUT ---------------- */
    function negEase(arr) {
        var o = [];
        for (var i = 0; i < arr.length; i++) o.push(new KeyframeEase(-arr[i].speed, arr[i].influence));
        return o;
    }
    function negVec(v) { var o = []; for (var i = 0; i < v.length; i++) o.push(-v[i]); return o; }
    function reverseToOut(prop, keys, A, durScale) {
        var n = keys.length, spatial = prop.isSpatial, tLast = prop.keyTime(keys[n - 1]);
        var data = [];
        for (var i = 0; i < n; i++) {
            var k = keys[i];
            data.push({
                t: prop.keyTime(k), v: prop.keyValue(k),
                inI: prop.keyInInterpolationType(k), outI: prop.keyOutInterpolationType(k),
                inE: prop.keyInTemporalEase(k), outE: prop.keyOutTemporalEase(k),
                inS: spatial ? prop.keyInSpatialTangent(k) : null,
                outS: spatial ? prop.keyOutSpatialTangent(k) : null
            });
        }
        for (i = 0; i < n; i++) prop.setValueAtTime(A + (tLast - data[i].t) * durScale, data[i].v);
        for (i = 0; i < n; i++) {
            var s = data[i], idx = prop.nearestKeyIndex(A + (tLast - s.t) * durScale);
            prop.setInterpolationTypeAtKey(idx, s.outI, s.inI);
            try { prop.setTemporalEaseAtKey(idx, negEase(s.outE), negEase(s.inE)); } catch (e) {}
            if (spatial && s.inS && s.outS) { try { prop.setSpatialTangentsAtKey(idx, negVec(s.outS), negVec(s.inS)); } catch (e2) {} }
        }
        return true;
    }
    function makeOut(durScale) {
        var comp = activeComp();
        if (!comp) return "ERR:Buka composition dulu.";
        var props = comp.selectedProperties, A = comp.time;
        app.beginUndoGroup("Shanusi Ease - Make Out");
        var touched = 0;
        for (var i = 0; i < props.length; i++) {
            var prop = props[i];
            if (!isProp(prop)) continue;
            var keys = prop.selectedKeys;
            if (!keys || keys.length < 2) continue;
            if (reverseToOut(prop, keys, A, durScale || 1)) touched++;
        }
        app.endUndoGroup();
        return touched ? ("OK:Keluar dibuat di " + touched + " property") : "ERR:Pilih keyframe masuk (min 2) dulu.";
    }

    /* ---------------- API: EXPORT / IMPORT preset (file) ---------------- */
    function exportPresets(text) {
        var f = File.saveDialog("Export preset Shanusi Ease", "Text:*.txt");
        if (!f) return "ERR:Batal.";
        f.open("w"); f.write(text); f.close();
        return "OK:Preset ter-export.";
    }
    function importPresets() {
        var f = File.openDialog("Import preset Shanusi Ease", "Text:*.txt");
        if (!f) return "ERR:Batal.";
        f.open("r"); var t = f.read(); f.close();
        return "DATA:" + t;
    }

    function ping() { return "OK:Shanusi Ease host siap (" + app.version + ")"; }

    return {
        ping: ping,
        applyEase: applyEase,
        getEase: getEase,
        copyEase: copyEase,
        pasteEase: pasteEase,
        bounce: bounce,
        elastic: elastic,
        makeOut: makeOut,
        exportPresets: exportPresets,
        importPresets: importPresets
    };
})();
