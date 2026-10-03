const params = new URLSearchParams(location.search);
const enabled = document.documentElement.dataset.wallpaper === 'true' || params.has('wallpaper');
const options = { style: 'cartoon', weather: 'clear', time: 'auto', season: 'auto', fit: 'fill', fps: 30, interaction: true };
const choices = {
  style: ['cartoon', 'natural'], weather: ['clear', 'cloudy', 'rain', 'snow', 'wind'],
  time: ['auto', 'day', 'night'], season: ['auto', 'spring', 'summer', 'autumn', 'winter'],
  fit: ['fill', 'fit'], fps: [30, 60],
};
let hostFPS = 0, hostPaused = false, adapter = null;

export const wallpaper = {
  enabled,
  get options() { return { ...options }; },
  get fps() { return enabled ? Math.min(options.fps, hostFPS || options.fps) : 60; },
  get hostPaused() { return hostPaused; },
  get interactive() { return !enabled || options.interaction; },
  attach(callbacks) {
    if (!enabled) return;
    adapter = callbacks;
    adapter.apply({ ...options });
    adapter.playback();
  },
  snapshot: () => ({ enabled, ...options, hostFPS, effectiveFPS: wallpaper.fps, hostPaused }),
};

if (enabled) {
  document.documentElement.dataset.wallpaper = 'true';
  // Register before asynchronous texture loading so startup settings are retained.
  window.wallpaperPropertyListener = {
    applyUserProperties(properties) {
      const changed = {};
      for (const key of Object.keys(options)) {
        const property = properties['pond' + key];
        if (!property) continue;
        let value = property.value;
        if (key === 'fps') value = Number(value);
        if (key === 'interaction' ? typeof value !== 'boolean' : !choices[key].includes(value)) continue;
        if (options[key] !== value) { options[key] = value; changed[key] = value; }
      }
      if (Object.keys(changed).length) adapter?.apply(changed);
    },
    applyGeneralProperties(properties) {
      if (!Object.hasOwn(properties, 'fps')) return;
      const fps = Number(properties.fps);
      if (!Number.isFinite(fps) || fps < 0) return;
      hostFPS = fps;
      adapter?.apply({ fps: options.fps });
    },
    setPaused(isPaused) {
      hostPaused = Boolean(isPaused);
      adapter?.playback();
    },
  };
}
