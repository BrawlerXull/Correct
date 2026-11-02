/*!
 * CORRECT shade-finder widget · drop-in for any store page
 *
 *   <script src="https://correct-youcam.vercel.app/widget.js" data-label="Find my corrector shade" async></script>
 *
 * Optional attributes on the <script> tag:
 *   data-target="#css-selector"   where to put the button (default: right after the script tag)
 *   data-label="..."              button text
 *   data-color="#2A2320"          button colour
 *
 * Events fired on window (also passed to window.CorrectWidget.on(name, fn)):
 *   "correct:plan"         { skin, concerns, steps:[{ step, shadeHex, shadeName, sku, product, productShade, price, deltaE }] }
 *   "correct:add-to-bag"   { items:[{ sku, name, shade, price, qty }] }   ← map these SKUs to your cart
 *   "correct:close"
 * No photos are ever sent to the host page – only shades and SKUs.
 */
(function () {
  if (window.CorrectWidget && window.CorrectWidget.__loaded) return;
  var script = document.currentScript || document.querySelector('script[src*="widget.js"]');
  var ORIGIN = new URL(script.src, location.href).origin;
  var label = script.getAttribute("data-label") || "Find my corrector shade";
  var color = script.getAttribute("data-color") || "#2A2320";
  var handlers = {};
  var overlay = null, iframe = null, lastFocus = null;

  function emit(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (e) {}
    (handlers[name] || []).forEach(function (fn) { try { fn(detail); } catch (e) {} });
  }

  function open() {
    if (overlay) return;
    lastFocus = document.activeElement;
    overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "CORRECT shade finder");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483000;background:rgba(42,35,32,.45);display:flex;align-items:center;justify-content:center;padding:0;";
    var box = document.createElement("div");
    var small = window.matchMedia("(max-width: 640px)").matches;
    box.style.cssText = small
      ? "width:100%;height:100%;background:#FBF7F2;overflow:hidden;"
      : "width:min(560px,96vw);height:min(860px,94vh);background:#FBF7F2;border-radius:24px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.35);";
    iframe = document.createElement("iframe");
    iframe.src = ORIGIN + "/embed";
    iframe.title = "CORRECT shade finder";
    iframe.allow = "camera; microphone; clipboard-write";
    iframe.style.cssText = "border:0;width:100%;height:100%;display:block;";
    box.appendChild(iframe);
    overlay.appendChild(box);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
    document.documentElement.style.overflow = "hidden";
    iframe.focus();
  }

  function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = iframe = null;
    document.removeEventListener("keydown", onKey);
    document.documentElement.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    emit("correct:close", {});
  }

  function onKey(e) { if (e.key === "Escape") close(); }

  window.addEventListener("message", function (e) {
    if (e.origin !== ORIGIN || !e.data || e.data.source !== "correct-widget") return;
    var d = e.data;
    if (d.type === "correct:close") return close();
    emit(d.type, d);
  });

  function mountButton() {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "correct-widget-button";
    btn.innerHTML =
      '<span aria-hidden="true" style="position:relative;display:inline-block;width:26px;height:18px;margin-right:10px;vertical-align:-3px">' +
      '<span style="position:absolute;left:0;top:0;width:18px;height:18px;border-radius:50%;background:#B4505E;opacity:.85"></span>' +
      '<span style="position:absolute;left:8px;top:0;width:18px;height:18px;border-radius:50%;background:#6F9468;opacity:.9;mix-blend-mode:multiply"></span></span>' +
      label;
    btn.style.cssText =
      "display:inline-flex;align-items:center;font:600 15px/1 system-ui,-apple-system,Segoe UI,sans-serif;color:#fff;background:" + color +
      ";border:0;border-radius:999px;padding:14px 22px;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.15)";
    btn.addEventListener("click", open);
    var target = script.getAttribute("data-target") && document.querySelector(script.getAttribute("data-target"));
    if (target) target.appendChild(btn);
    else script.parentNode.insertBefore(btn, script.nextSibling);
  }

  window.CorrectWidget = {
    __loaded: true,
    open: open,
    close: close,
    on: function (name, fn) { (handlers[name] = handlers[name] || []).push(fn); },
  };
  if (script.getAttribute("data-no-button") === null) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountButton);
    else mountButton();
  }
})();
