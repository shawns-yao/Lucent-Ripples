export function setupSceneClock(summary) {
  const clock = document.createElement('time');
  clock.id = 'scene-clock';
  const dateLabel = document.createElement('span');
  dateLabel.className = 'clock-date';
  const weatherLabel = document.createElement('span');
  weatherLabel.className = 'clock-weather';
  summary.replaceChildren(clock, dateLabel, weatherLabel);
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
    dateLabel.textContent = dateFormat.format(now);
    timer = setTimeout(update, 60000 - Date.now() % 60000 + 50);
  };
  document.addEventListener('visibilitychange', update);
  update();
  return {
    setWeather(text) { weatherLabel.textContent = text; },
    destroy() { clearTimeout(timer); document.removeEventListener('visibilitychange', update); },
  };
}
