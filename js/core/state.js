(function () {
    const existing = window.HTMLGISState || {};
    window.HTMLGISState = Object.assign({
        layers: [],
        activeId: null,
        modes: { select: false, identify: false, moveRotate: false },
        currentProcess: { tool: null, options: {} }
    }, existing);
})();
