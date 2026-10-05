import { Assets, Texture, Rectangle } from 'pixi.js';
import { createSurfaceOcclusion } from './surface-occlusion.js';

const STORAGE_KEY = 'pond-scene-style';
const FISH_FRAMES = [[13,18,743,324],[789,19,732,325],[13,355,740,315],[785,358,735,315],[14,684,742,321],[788,687,733,320]];
const PROFILES = {
  cartoon: {
    label: '卡通', bottom: '/assets/pond-cartoon.webp', winterBottom: '/assets/pond-winter-cartoon.webp', fish: '/assets/fish-cartoon.webp',
    shore: '/assets/shore-cartoon.webp', winter: '/assets/shore-cartoon-winter.webp',
    lotus: '/assets/lotus-cartoon.webp', life: '/assets/pond-life-cartoon.webp',
    layout: {
      frames: [[69,125,560,625],[714,163,508,586],[104,791,470,371],[712,809,460,353]],
      winterFrames: [[69,125,560,625],[714,163,508,586]],
      anchors: [[.535,.93],[.502,.93]], hive: [468,620],
    },
  },
  natural: {
    label: '自然写实', bottom: '/assets/pond-natural.webp', winterBottom: '/assets/pond-winter-natural.webp', fish: '/assets/koi-atlas.png',
    shore: '/assets/shore-life.png', winter: '/assets/shore-winter.png', layout: {},
    lotus: '/assets/lotus-growth.png', life: '/assets/pond-life-natural.webp',
  },
};
const cache = new Map();

export function savedSceneStyle() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (Object.hasOwn(PROFILES, saved)) return saved;
  } catch { /* Storage restrictions do not prevent displaying the pond. */ }
  return 'cartoon';
}

export function loadSceneStyle(key) {
  if (!Object.hasOwn(PROFILES, key)) throw new RangeError('Unknown pond style');
  if (!cache.has(key)) {
    const profile = PROFILES[key];
    const pending = Promise.all([profile.bottom,profile.fish,profile.shore,profile.winter,profile.lotus,profile.life,profile.winterBottom].map(url => Assets.load({src:url,data:{autoGenerateMipmaps:true,minFilter:'linear',mipmapFilter:'linear'}})))
      .then(([bottom,atlas,shore,winter,lotus,life,winterBottom]) => ({
        key, bottom, winterBottom, shore, winter, lotus, life, layout: {...profile.layout,style:key},
        surface: createSurfaceOcclusion(bottom,key),
        winterSurface: createSurfaceOcclusion(winterBottom,key,false),
        fishTextures: (key==='cartoon'?Array.from({length:6},(_,i)=>[i%2*768,Math.floor(i/2)*1024/3,768,1024/3]):FISH_FRAMES).map(([x,y,width,height]) => new Texture({
          source: atlas.source,
          frame: new Rectangle(x*atlas.width/1536,y*atlas.height/1024,width*atlas.width/1536,height*atlas.height/1024),
        })),
      })).catch(error => { cache.delete(key); throw error; });
    cache.set(key, pending);
  }
  return cache.get(key);
}

export function setupSceneStyle(initial, apply) {
  const section = document.createElement('div');
  section.className = 'appearance-controls';
  const label = document.createElement('p');
  label.textContent = '画面风格';
  const group = document.createElement('div');
  group.id = 'appearance-options';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', '画面风格');
  const status = document.createElement('p');
  status.id = 'style-status'; status.setAttribute('role', 'status'); status.hidden = true;
  section.append(label, group, status);
  document.querySelector('#weather-status').before(section);
  let current = initial.key, pending = null, revision = 0;
  const buttons = Object.entries(PROFILES).map(([key,profile]) => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = profile.label; button.dataset.sceneStyle = key;
    button.addEventListener('click', () => select(key));
    group.append(button); return button;
  });
  async function select(key) {
      if (!Object.hasOwn(PROFILES, key)) return;
      const request = ++revision;
      if (key === current) { pending = null; refresh(); return; }
      pending = key; status.textContent = '正在切换画面…'; status.hidden = false; refresh();
      try {
        const style = await loadSceneStyle(key);
        if (request !== revision) return;
        apply(style); current = key; pending = null;
        try { localStorage.setItem(STORAGE_KEY, key); } catch { /* Appearance remains usable without storage. */ }
        status.hidden = true;
      } catch (error) {
        if (request !== revision) return;
        pending = null; status.textContent = '素材加载失败，请重试'; status.hidden = false;
        console.warn('Pond style could not be loaded', error);
      }
      refresh();
  }
  function refresh() {
    group.setAttribute('aria-busy', String(pending !== null));
    if (pending === null && status.textContent === '正在切换画面…') status.hidden = true;
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.sceneStyle === current));
    document.documentElement.dataset.sceneStyle = current;
  }
  refresh();
  return { select, snapshot: () => ({ current, pending, cached: [...cache.keys()] }) };
}
