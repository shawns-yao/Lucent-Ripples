import { wallpaper } from './wallpaper.js';

export function setupWallpaperPanel() {
  if (!wallpaper.enabled) return;
  const panel = document.querySelector('#weather-panel');
  const section = document.createElement('section');
  section.className = 'wallpaper-settings';
  section.setAttribute('aria-label', '壁纸设置');
  const controls = {};
  const apply = (key, value) => wallpaper.setProperties({['pond' + key]:{value}});
  for (const [key, title, choices] of [
    ['clarity','清晰度',[['balanced','均衡'],['high','高清（最高 2K）']]],
    ['effects','特效强度',[['low','低'],['medium','中'],['high','高']]],
    ['fps','帧率上限',[['30','30 帧'],['60','60 帧']]],
    ['fit','画面适配',[['fill','铺满屏幕'],['fit','完整池塘']]],
  ]) {
    const label = document.createElement('label');
    label.textContent = title;
    const select = document.createElement('select');
    select.id = 'panel-' + key;
    for (const [value, text] of choices) select.add(new Option(text, value));
    select.addEventListener('change', () => apply(key, select.value));
    label.append(select);section.append(label);controls[key] = select;
  }
  const label = document.createElement('label');
  label.textContent = '鱼群数量（季节默认值的百分比）';
  const density = document.createElement('input');
  density.id = 'panel-fishdensity';density.type = 'range';density.min = '0';density.max = '100';density.step = '1';
  const output = document.createElement('output');
  output.htmlFor = density.id;
  density.addEventListener('input', () => { output.textContent = density.value + '%'; });
  density.addEventListener('change', () => apply('fishdensity', density.value));
  label.append(density, output);section.prepend(label);
  document.querySelector('.season-controls').after(section);
  const sync = () => {
    const options = wallpaper.options;
    density.value = options.fishdensity;output.textContent = options.fishdensity + '%';
    for (const [key, control] of Object.entries(controls)) control.value = options[key];
  };
  wallpaper.subscribe(sync);sync();
  // Route desktop controls through the same state used by host properties.
  panel.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    for (const [attribute, key] of [['weather','weather'],['time','time'],['sceneStyle','style'],['season','season']]) {
      if (button.dataset[attribute] !== undefined) {
        event.stopImmediatePropagation();apply(key, button.dataset[attribute]);return;
      }
    }
  }, true);
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { panel.open = false; document.querySelector('#weather-summary').focus(); }
  });
}
