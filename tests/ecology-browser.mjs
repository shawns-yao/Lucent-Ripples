import assert from 'node:assert/strict';

// 定向测试：从真实页面控件进入，观察自然经过时间，不注入动物或植物状态。
export async function runEcologyChecks(ui){
  const original=await ui.read('({style:__pond.appearance().current,season:__pond.seasons().mode,time:__pond.weather().timeMode,preset:__pond.weather().preset,paused:__pond.paused})');
  const panel=async open=>{if(await ui.read('document.querySelector("#weather-panel").open')!==open)await ui.click('#weather-summary');};
  const pause=async value=>{if(await ui.read('__pond.paused')!==value)await ui.click('#pause');};
  const style=async value=>{
    await ui.click(`button[data-scene-style="${value}"]`);
    const deadline=Date.now()+15000;
    while(!await ui.read(`__pond.appearance().current==="${value}"&&__pond.appearance().pending===null`)){assert.ok(Date.now()<deadline);await ui.wait(100);}
  };
  const births=await ui.read('__pond.growth().map(p=>p.bornAt)');
  try{
    await pause(true);await panel(true);await ui.click('[data-season="summer"]');await ui.click('[data-weather="clear"]');await ui.click('[data-time="day"]');await panel(false);
    await ui.size({width:2560,height:1440});await pause(false);
    const observed=await ui.read(`new Promise(resolve=>{
      let samples=0,invalid=0,maxWakes=0,maxPlantsResponse=0,landings=0,flights=0,slides=0,petals=0;
      const states=new Set(),start=performance.now(),frames=__pond.frames;
      const timer=setInterval(()=>{
        const e=__pond.ecology();maxWakes=Math.max(maxWakes,__pond.surfaceMotion().active.length);
        if(e.waterPasses!==1||e.shrimp.length>5||e.striders.length>3||e.petals.length>6||e.dragonflies.length>2)invalid++;
        for(const s of e.shrimp){states.add(s.state);if(!__pond.waterAt(s.x,s.y)||Math.hypot(s.x-s.homeX,s.y-s.homeY)>100)invalid++;}
        for(const s of e.striders){slides=Math.max(slides,s.slides);if(s.visible&&__pond.surfaceAt(s.x,s.y)!=='water')invalid++;}
        for(const p of e.petals)if(p.active){petals++;if(__pond.surfaceAt(p.x,p.y)!=='water')invalid++;}
        for(const p of e.vegetation)maxPlantsResponse=Math.max(maxPlantsResponse,p.response);
        for(const d of e.dragonflies){
          landings=Math.max(landings,d.landings);if(d.height>8&&d.shadowY>d.screenY+8)flights++;
          if(d.state==='rest'&&(d.height!==0||__pond.surfaceAt(d.x,d.y)!=='leaf'))invalid++;
        }
        if(++samples===48){clearInterval(timer);resolve({samples,invalid,maxWakes,maxPlantsResponse,landings,flights,slides,petals,shrimpStates:[...states],seconds:(performance.now()-start)/1000,frames:__pond.frames-frames,performance:__pond.performance()});}
      },250);
    })`);
    assert.equal(observed.invalid,0);assert.ok(observed.maxWakes<=6);assert.ok(observed.landings>0&&observed.flights>0);
    assert.ok(observed.slides>0&&observed.petals>0&&observed.maxPlantsResponse>.05);assert.ok(observed.shrimpStates.includes('crawl'));
    await pause(true);await panel(true);
    for(const key of ['cartoon','natural']){
      await style(key);await panel(false);await ui.size({width:1600,height:1000});await ui.capture(`ecology-${key}`);
      await ui.size({width:390,height:844});await ui.capture(`ecology-mobile-${key}`);
      assert.ok(await ui.read('__pond.viewport().height')>=843);
      await panel(true);await ui.click('[data-time="night"]');
      assert.equal(await ui.read('__pond.ecology().dragonflies.some(d=>d.visible)||__pond.ecology().striders.some(s=>s.visible)'),false);
      await ui.click('[data-time="day"]');await ui.click('[data-weather="rain"]');
      assert.equal(await ui.read('__pond.ecology().dragonflies.some(d=>d.visible)||__pond.ecology().striders.some(s=>s.visible)'),false);
      await ui.click('[data-season="winter"]');await ui.click('[data-weather="snow"]');
      assert.equal(await ui.read('__pond.ecology().shrimp.some(s=>s.visible)||__pond.ecology().petals.some(p=>p.active)||__pond.ecology().dragonflies.some(d=>d.visible)||__pond.ecology().striders.some(s=>s.visible)'),false);
      await ui.capture(`ecology-winter-${key}`);
      await ui.click('[data-season="summer"]');await ui.click('[data-weather="clear"]');
      assert.equal(await ui.read('__pond.ecology().shrimp.every(s=>s.visible)&&__pond.ecology().dragonflies.every(d=>d.visible)'),true);
    }
    assert.deepEqual(await ui.read('__pond.growth().map(p=>p.bornAt)'),births);
    const before=await ui.read('__pond.frames');await ui.wait(1100);assert.equal(await ui.read('__pond.frames'),before);
    return {type:'定向测试',observed,checks:['连续运动和落点','鱼经过时水草响应','水面范围与固定数量','两种风格及手机画面','夜晚、大雨与冬季隐藏','暖季恢复、出生时间保留、暂停零绘制']};
  }finally{
    await panel(true);await style(original.style);await ui.click(`[data-season="${original.season||'auto'}"]`);
    await ui.click(`[data-weather="${original.preset||'clear'}"]`);await ui.click(`[data-time="${original.time}"]`);await panel(false);await pause(original.paused);
  }
}
