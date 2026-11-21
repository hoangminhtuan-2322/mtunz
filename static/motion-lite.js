/* Tiny lifecycle controller: no animation frame loops, observers, polling or timers. */
(() => {
  'use strict';
  const html = document.documentElement;
  const network = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const lowPower = (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 2)
    || (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 2);

  let currentView;
  // Renderers provide the selected destination. Data refreshes in place stay still.
  globalThis.markViewMotion = (node,key) => {
    if(!node || key===currentView)return;
    const opening=currentView===undefined;
    currentView=key;
    node.classList.add(opening?'entry-arrival':'view-arrival');
  };

  function syncMotion() {
    html.classList.toggle('mtunz-motion-paused', document.hidden);
    html.classList.toggle('mtunz-save-data', Boolean(lowPower || network?.saveData));
  }

  document.addEventListener('visibilitychange', syncMotion, { passive:true });
  network?.addEventListener?.('change', syncMotion);
  syncMotion();
})();
