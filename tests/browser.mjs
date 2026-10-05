import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// 定向测试：只通过页面控件操作；观察接口只读，不改时钟或生长记录。
// 适配器也可接入已有浏览器，复用同一组检查。
export async function runBrowserChecks(ui) {
  const checks=[];
  const until=async expression=>{
    const deadline=Date.now()+15000;
    while(!await ui.read(expression)) {
      assert.ok(Date.now()<deadline,`页面状态等待超时：${expression}`);
      await ui.wait(100);
    }
  };
  const sample=ms=>ui.read(`new Promise(resolve=>{
    const start=performance.now(),frames=window.__pond.frames,time=window.__pond.snapshot().time;
    setTimeout(()=>resolve({seconds:(performance.now()-start)/1000,frames:window.__pond.frames-frames,sceneSeconds:window.__pond.snapshot().time-time}),${ms});
  })`);
  const garden=()=>ui.read('window.__pond.growth().map(({id,x,y,bornAt})=>({id,x,y,bornAt}))');
  const panel=async open=>{
    if(await ui.read('document.querySelector("#weather-panel").open')!==open)await ui.click('#weather-summary');
  };
  const style=async key=>{
    await ui.click(`button[data-scene-style="${key}"]`);
    await until(`window.__pond.appearance().current==="${key}"&&window.__pond.appearance().pending===null`);
  };
  await until('window.__pond?.ready');
  assert.equal(await ui.read('window.__pond.renderer'),'webgl');
  const original=await ui.read('({style:window.__pond.appearance().current,season:window.__pond.seasons().mode,paused:window.__pond.paused,time:window.__pond.weather().timeMode,preset:window.__pond.weather().preset})');
  const planted=await garden();
  if(!original.paused)await ui.click('#pause');
  const pause=await sample(1200);
  assert.equal(pause.frames,0);assert.equal(pause.sceneSeconds,0);
  assert.equal(await ui.read('window.__pond.wallpaper().tickerRunning'),false);
  checks.push('暂停停止连续绘制');
  await panel(true);
  await ui.click('[data-season="summer"]');await ui.click('[data-weather="clear"]');await ui.click('[data-time="day"]');
  const warmFlowers=await ui.read('window.__pond.plantsDisplay().plants.filter(p=>p.flowerVisible).length');
  for(const key of ['cartoon','natural']) {
    await style(key);await ui.click('[data-season="winter"]');
    assert.equal(await ui.read('window.__pond.plantsDisplay().dormant'),true);
    assert.equal(await ui.read('window.__pond.plantsDisplay().plants.every(p=>p.withered)'),true);
    assert.equal(await ui.read('window.__pond.plantsDisplay().plants.some(p=>p.flowerVisible)'),false);
    assert.equal(await ui.read('window.__pond.landings().flowers.some(p=>p.available)'),false);
    assert.equal(await ui.read('window.__pond.wildlife().frogs.some(f=>f.visible)'),false);
    await ui.size({width:1440,height:900});await ui.capture(`winter-${key}`);
    await ui.click('[data-season="summer"]');
    assert.equal(await ui.read('window.__pond.plantsDisplay().dormant'),false);
    assert.equal(await ui.read('window.__pond.plantsDisplay().plants.some(p=>p.withered)'),false);
    assert.equal(await ui.read('window.__pond.plantsDisplay().plants.filter(p=>p.flowerVisible).length'),warmFlowers);
    assert.deepEqual(await garden(),planted);
  }
  checks.push('两种风格冬季休眠、暖季恢复、生长记录保留');
  await ui.click('[data-season="winter"]');await ui.click('[data-weather="snow"]');
  assert.ok(await ui.read('window.__pond.precipitationBudget().drawnSnow>0'));
  for(const season of ['spring','autumn','summer']) {
    await ui.click(`[data-season="${season}"]`);
    assert.equal(await ui.read('document.querySelector("[data-weather=snow]").disabled'),true);
    assert.equal(await ui.read('window.__pond.precipitationBudget().snowCount'),0);
  }
  checks.push('仅冬季降雪及切季清理');
  const before=await ui.read('window.__pond.frames');
  await ui.click('[data-weather="rain"]');await ui.click('[data-time="night"]');
  assert.ok(await ui.read('window.__pond.frames')>before);
  assert.equal(await ui.read('window.__pond.weather().current.rain'),1);
  assert.ok(await ui.read('window.__pond.weather().current.light')<.2);
  assert.equal(await ui.read('window.__pond.precipitationBudget().rainBudget'),7200);
  const staticNight=await sample(1100);assert.equal(staticNight.frames,0);
  checks.push('暂停时天气与昼夜设置立即更新');
  await ui.click('[data-weather="clear"]');await ui.click('[data-time="day"]');await panel(false);
  await ui.size({width:390,height:844});
  assert.equal(await ui.read('document.querySelector("canvas").clientWidth'),390);
  assert.ok(await ui.read('window.__pond.viewport().height')>=843);
  assert.equal(await ui.read('document.documentElement.scrollWidth<=innerWidth'),true);
  const panBefore=await ui.read('window.__pond.viewport().x');
  await ui.key('canvas','ArrowRight');
  assert.ok(await ui.read('window.__pond.viewport().x')<panBefore);
  await ui.capture('mobile');
  await ui.size({width:2560,height:1440});
  assert.ok(await ui.read('Math.max(document.querySelector("canvas").width,document.querySelector("canvas").height)')<=2560);
  assert.ok(await ui.read('window.__pond.performance().drawPixels')<=2600000);
  checks.push('手机铺满、暂停时平移与2K绘制限制');
  await ui.click('#pause');
  const running=await sample(3200);
  const performance=await ui.read('window.__pond.performance()');
  assert.ok(running.frames>0);
  assert.ok(running.sceneSeconds>running.seconds*.55&&running.sceneSeconds<running.seconds*1.45,JSON.stringify(running));
  checks.push('恢复动画后按经过时间推进');
  await ui.reload();await until('window.__pond?.ready');assert.deepEqual(await garden(),planted);
  checks.push('刷新保留出生时间与位置');
  await panel(true);await style(original.style);
  await ui.click(`[data-season="${original.season||'auto'}"]`);
  await ui.click(`[data-weather="${original.preset||'clear'}"]`);await ui.click(`[data-time="${original.time}"]`);
  await panel(false);if(original.paused)await ui.click('#pause');
  await ui.size({width:1440,height:900});
  return {type:'定向测试',checks,pause,running,performance};
}

// 定向测试：沿用已启动的页面，观察真实巡游、网格预算和簇群，不推进内部时钟。
export async function runCompositionChecks(ui){
  const wasPaused=await ui.read('window.__pond.paused');
  if(wasPaused)await ui.click('#pause');
  const samples=await ui.read(`new Promise(resolve=>{
    const result=[];let count=0;
    const timer=setInterval(()=>{
      const state=window.__pond.snapshot();
      result.push({state,neighbors:window.__pond.neighborBudget(),wakes:window.__pond.surfaceMotion(),
        fishOnWater:state.fish.every(f=>window.__pond.waterAt(f.x,f.y)),
        wakesOnWater:window.__pond.surfaceMotion().active.every(p=>window.__pond.surfaceAt(p.x,p.y)==='water')});
      if(++count===30){clearInterval(timer);resolve(result);}
    },200);
  })`);
  if(wasPaused)await ui.click('#pause');
  for(const sample of samples){
    assert.equal(sample.state.fish.length,44);assert.equal(sample.fishOnWater,true);
    assert.ok(sample.state.fish.every(f=>[f.x,f.y,f.speed,f.submergence].every(Number.isFinite)));
    assert.ok(sample.neighbors.checks<sample.neighbors.allPairs);
    assert.ok(sample.wakes.active.length<=sample.wakes.capacity);assert.equal(sample.wakesOnWater,true);
  }
  const groups=new Map();
  for(const f of samples[0].state.fish.filter(f=>f.schooling))groups.set(f.group,(groups.get(f.group)||0)+1);
  assert.ok([...groups.values()].every(n=>n>=2&&n<=4));
  assert.ok(samples.some(s=>s.wakes.active.some(p=>p.kind==='fish')));
  const plants=await ui.read('window.__pond.growth()'),display=await ui.read('window.__pond.plantsDisplay()');
  assert.equal(new Set(plants.map(p=>p.cluster)).size,2);
  for(const cluster of [0,1])assert.ok(display.plants.filter(p=>p.flowerVisible&&plants[p.id].cluster===cluster).length<=2);
  assert.equal(await ui.read('window.__pond.plantsDisplay().companions.every(p=>window.__pond.surfaceAt(p.x,p.y)==="leaf")'),true);
  assert.equal(await ui.read('window.__pond.meshBudget().batchedFish'),44);
  return {type:'定向测试',samples:samples.length,groups:[...groups.values()],solitary:samples[0].state.fish.filter(f=>!f.schooling).length,
    meanNeighborChecks:samples.reduce((sum,s)=>sum+s.neighbors.checks,0)/samples.length,allPairs:samples[0].neighbors.allPairs,
    maxWakes:Math.max(...samples.map(s=>s.wakes.active.length)),companions:display.companions.length};
}

async function runLocal() {
  const {chromium}=await import('@playwright/test');
  const browser=await chromium.launch({channel:'msedge',headless:process.env.POND_TEST_HEADLESS==='1'});
  const output=resolve('Test/browser');await mkdir(output,{recursive:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(process.env.POND_TEST_URL||'http://127.0.0.1:5173/');
    const ui={
      read:expression=>page.evaluate(expression),click:selector=>page.locator(selector).click(),
      key:(selector,key)=>page.locator(selector).press(key),size:size=>page.setViewportSize(size),
      wait:ms=>page.waitForTimeout(ms),reload:()=>page.reload(),
      capture:name=>page.screenshot({path:join(output,`${name}.png`)}),
    };
    const result=await runBrowserChecks(ui),composition=await runCompositionChecks(ui);
    assert.deepEqual(errors,[]);console.log(JSON.stringify({result,composition},null,2));
  } finally {await browser.close();}
}
if(typeof process!=='undefined'&&process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await runLocal();
