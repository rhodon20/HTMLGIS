(function () {
    const SafeStorage = {
        isAvailable: false,
        init() {
            try {
                const k = '__htmlgis_storage_test__';
                localStorage.setItem(k, k);
                localStorage.removeItem(k);
                this.isAvailable = true;
            } catch (_) {
                this.isAvailable = false;
            }
        },
        save(key, value) {
            if (!this.isAvailable) return;
            localStorage.setItem(key, value);
        },
        load(key) {
            if (!this.isAvailable) return null;
            return localStorage.getItem(key);
        },
        clear(key) {
            if (!this.isAvailable) return;
            localStorage.removeItem(key);
        }
    };

    SafeStorage.init();
    window.SafeStorage = SafeStorage;
})();
