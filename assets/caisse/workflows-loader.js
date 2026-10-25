/* Owner: caisse workflow loading, before caisse-app.js startup.
 * Exposes stock and order-review entry points until their owners replace them.
 * Requires kiwi-caisse.html's data-caisse-script/data-caisse-lazy registry.
 * Eager declarations keep the classic global scope and parser order; the
 * inventory and order-review drawers load once on first use, with retry after a load failure.
 */
(function () {
  var loading = Object.create(null);
  function openWorkflow(owner, name, receiver, args) {
    if (!loading[owner]) {
      loading[owner] = new Promise(function (resolve, reject) {
        var script = document.createElement('script');
        script.src = document.querySelector('[data-caisse-lazy="' + owner + '"]').getAttribute('href');
        script.onload = function () { resolve(); };
        script.onerror = function () { script.remove(); delete loading[owner]; reject(new Error('Caisse ' + owner + ' load failed')); };
        document.head.appendChild(script);
      });
    }
    return loading[owner].then(function () { return window[name].apply(receiver, args); });
  }
  window.openStock = function () { return openWorkflow('inventory', 'openStock', this, arguments); };
  window.closeStock = function () { return openWorkflow('inventory', 'closeStock', this, arguments); };
  window.openRecept = function () { return openWorkflow('inventory', 'openRecept', this, arguments); };
  window.openOrderReviewModal = function () { return openWorkflow('orders', 'openOrderReviewModal', this, arguments); };
  window.closeOrderReviewModal = function () { return openWorkflow('orders', 'closeOrderReviewModal', this, arguments); };
  window.renderOrderReviewContent = function () { return openWorkflow('orders', 'renderOrderReviewContent', this, arguments); };
  /* Parser insertion preserves the old blocking scripts' global declarations,
     including bindings referenced synchronously by restored shifts. Keep this
     loader parser-inserted, never async/defer or invoked after page load. */
  document.querySelectorAll('[data-caisse-script]').forEach(function (link) {
    document.write('<scr' + 'ipt src="' + link.getAttribute('href') + '"></scr' + 'ipt>');
  });
})();
