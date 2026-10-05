export function setupSceneClock(summary) {
  const icon = (paths, className = '') => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'clock-icon ' + className);
    for (const d of paths) { const path = document.createElementNS(svg.namespaceURI, 'path');path.setAttribute('d', d);svg.append(path); }
    return svg;
  };
  const makeText = (className, text = '') => { const node = document.createElement('span');node.className = className;node.textContent = text;return node; };
  const clock = document.createElement('time');
  clock.id = 'scene-clock';
  const dateLabel = document.createElement('span');
  dateLabel.className = 'clock-date';
  const weatherLabel = document.createElement('span');
  weatherLabel.className = 'clock-weather';
  const weatherIcon = icon(['M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10', 'M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2'], 'weather-symbol');
  const weatherText = makeText('clock-condition'), seasonText = makeText('clock-season'), sourceText = makeText('clock-source');
  weatherLabel.append(weatherIcon, weatherText, seasonText, sourceText);
  const stats = makeText('clock-stats');
  const stat = (name, path) => {
    const row = makeText('clock-stat'), value = makeText('clock-value', '—');
    row.append(icon(path), makeText('clock-stat-label', name), value);stats.append(row);return value;
  };
  const fish = stat('游鱼', ['M3 12C7 5 15 5 19 12c-4 7-12 7-16 0Z', 'm19 12 4-4v8ZM7 10h.01']);
  const flowers = stat('荷花', ['M12 17C6 12 9 6 12 3c3 3 6 9 0 14Z', 'M12 18C6 19 2 15 2 9c6 0 10 5 10 9Zm0 0c6 1 10-3 10-9-6 0-10 5-10 9Z', 'M5 21h14']);
  const surface = stat('水面', ['M2 7q3-3 6 0t6 0 6 0M2 12q3-3 6 0t6 0 6 0M2 17q3-3 6 0t6 0 6 0']);
  const wind = stat('风力', ['M2 8h13a3 3 0 1 0-3-3M2 12h18a2 2 0 1 1-2 2M2 16h8a3 3 0 1 1-3 3']);
  const settings = makeText('clock-settings');
  settings.append(icon(['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8', 'm9 2 6 0 1 3 3 1 3 3-2 3 0 3-3 1-2 4H9l-1-3-3-1-3-3 2-3V9l3-1Z']), makeText('', '场景设置'), icon(['m8 10 4 4 4-4'], 'clock-chevron'));
  summary.replaceChildren(clock, dateLabel, weatherLabel, stats, settings);
  summary.title = '打开时间、天气与场景设置';
  const timeFormat = new Intl.DateTimeFormat('zh-CN', {hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
  const dateFormat = new Intl.DateTimeFormat('zh-CN', {month:'long', day:'numeric', weekday:'long'});
  let timer;
  const update = () => {
    clearTimeout(timer);
    if (document.hidden) return;
    const now = new Date();
    clock.dateTime = now.toISOString();
    clock.textContent = timeFormat.format(now);
    dateLabel.textContent = dateFormat.format(now).replace('星期', ' · 星期');
    timer = setTimeout(update, 60000 - Date.now() % 60000 + 50);
  };
  document.addEventListener('visibilitychange', update);
  update();
  return {
    setWeather(weather) {
      const live = weather.source === 'live';
      weatherText.textContent = weather.target.label + (live ? ` ${Math.round(weather.target.temp)}°` : '');
      seasonText.textContent = {spring:'春日',summer:'盛夏',autumn:'秋日',winter:'冬日'}[weather.season] || '';
      sourceText.textContent = live ? '当地' : '演示';
      const preset = weather.preset || (weather.target.snow > 0 ? 'snow' : weather.target.rain > 0 ? 'rain' : weather.target.cloud > .5 ? 'cloudy' : 'clear');
      const paths = {
        clear: ['M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10', 'M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2'],
        cloudy: ['M7 18a5 5 0 1 1 1-10 6 6 0 0 1 11 2 4 4 0 0 1 0 8Z'],
        rain: ['M6 14a4 4 0 1 1 1-8 5 5 0 0 1 10 1 4 4 0 0 1 1 7Z', 'M7 17l-1 3m6-3-1 3m6-3-1 3'],
        snow: ['M12 2v20M3 7l18 10M3 17 21 7', 'm9 4 3 3 3-3M9 20l3-3 3 3M3 10l4-1V5M21 14l-4 1v4'],
        wind: ['M2 8h13a3 3 0 1 0-3-3M2 12h18a2 2 0 1 1-2 2M2 16h8a3 3 0 1 1-3 3'],
      };
      const replacement = icon(paths[preset] || paths.cloudy, 'weather-symbol');
      weatherLabel.querySelector('svg').replaceWith(replacement);
      weatherLabel.dataset.weather = preset;
      wind.textContent = weather.target.wind < .5 ? '无风' : weather.target.wind < 3.5 ? '微风' : weather.target.wind < 8 ? '轻风' : '强风';
    },
    setScene(scene) {
      fish.textContent = String(scene.fish);flowers.textContent = String(scene.flowers);surface.textContent = scene.surface;
    },
    destroy() { clearTimeout(timer); document.removeEventListener('visibilitychange', update); },
  };
}
