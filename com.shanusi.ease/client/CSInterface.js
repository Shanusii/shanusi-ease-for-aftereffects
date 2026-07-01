/* CSInterface — shim ringkas untuk Shanusi Ease.
 * Mengandalkan window.__adobe_cep__ yang disuntik runtime CEP.
 * Cukup mengimplementasikan yang kita pakai: evalScript + info host. */
function CSInterface() {}

CSInterface.prototype.hostEnvironment = function () {
    try { return JSON.parse(window.__adobe_cep__.getHostEnvironment()); }
    catch (e) { return null; }
};

CSInterface.prototype.getApplicationID = function () {
    var h = this.hostEnvironment();
    return h ? h.appName : "";
};

/* Jalankan ExtendScript di host. callback(result:String). */
CSInterface.prototype.evalScript = function (script, callback) {
    if (typeof callback !== "function") callback = function () {};
    try {
        window.__adobe_cep__.evalScript(script, callback);
    } catch (e) {
        callback("ERR:CEP bridge tidak tersedia (" + e + ")");
    }
};

/* Path folder extension (untuk resolusi resource bila perlu). */
CSInterface.prototype.getSystemPath = function (type) {
    try { return decodeURI(window.__adobe_cep__.getSystemPath(type)); }
    catch (e) { return ""; }
};
