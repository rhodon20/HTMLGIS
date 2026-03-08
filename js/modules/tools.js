(function () {
  window.HTMLGISModules = window.HTMLGISModules || {};

  function safeEvalFormula(expression) {
    const unsafe = /\b(?:window|document|globalThis|self|Function|eval|fetch|XMLHttpRequest|localStorage|sessionStorage|indexedDB|caches|navigator|location|constructor|prototype)\b/i;
    if (unsafe.test(expression)) throw new Error('Formula bloqueada por seguridad');
    if (/[^0-9+\-*/%().,'"\s_a-zA-Z]/.test(expression)) throw new Error('Formula contiene caracteres no permitidos');
    return Function('"use strict"; return (' + expression + ');')();
  }

  window.HTMLGISModules.tools = { safeEvalFormula };
})();
