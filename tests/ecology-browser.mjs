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
      let samples=0,invalid=0,maxWakes=0,maxPlantsResponse=0,flights=0,petals=0;
      const states=new Set(),start=performance.now(),frames=__pond.frames;
      const timer=setInterval(()=>{
        const e=__pond.ecology();maxWakes=Math.max(maxWakes,__pond.surfaceMotion().active.length);
        if(e.waterPasses!==1||e.shrimp.length!==8||'striders' in e||e.petals.length>6||e.dragonflies.length!==3)invalid++;
        for(const s of e.shrimp){states.add(s.state);if(!__pond.waterAt(s.x,s.y)||Math.hypot(s.x-s.homeX,s.y-s.homeY)>100)invalid++;}
        for(const p of e.petals)if(p.active){petals++;if(__pond.surfaceAt(p.x,p.y)!=='water')invalid++;}
        for(const p of e.vegetation)maxPlantsResponse=Math.max(maxPlantsResponse,p.response);
        for(const d of e.dragonflies){
          if(d.height>20&&d.shadowY>d.screenY+20)flights++;
          if(d.state!=='flight'||d.height<20)invalid++;
        }
        if(++samples===48){clearInterval(timer);resolve({samples,invalid,maxWakes,maxPlantsResponse,flights,petals,shrimpStates:[...states],seconds:(performance.now()-start)/1000,frames:__pond.frames-frames,performance:__pond.performance()});}
      },250);
    })`);
    assert.equal(observed.invalid,0);assert.ok(observed.maxWakes<=6);assert.equal(observed.flights,144);
    assert.ok(observed.petals>0&&observed.maxPlantsResponse>.05);assert.ok(observed.shrimpStates.includes('crawl'));
    await pause(true);await panel(true);
    for(const key of ['cartoon','natural']){
      await style(key);await panel(false);await ui.size({width:1600,height:1000});await ui.capture(`ecology-${key}`);
      await ui.size({width:390,height:844});await ui.capture(`ecology-mobile-${key}`);
      assert.ok(await ui.read('__pond.viewport().height')>=843);
      await panel(true);await ui.click('[data-time="night"]');
      assert.equal(await ui.read('__pond.ecology().dragonflies.some(d=>d.visible)||__pond.shoreLife().beesVisible>0'),false);
      await ui.click('[data-time="day"]');await ui.click('[data-weather="rain"]');
      assert.equal(await ui.read('__pond.ecology().dragonflies.some(d=>d.visible)||__pond.shoreLife().beesVisible>0'),false);
      await ui.click('[data-season="winter"]');await ui.click('[data-weather="snow"]');
      assert.equal(await ui.read('__pond.ecology().shrimp.some(s=>s.visible)||__pond.ecology().petals.some(p=>p.active)||__pond.ecology().dragonflies.some(d=>d.visible)||__pond.shoreLife().beesVisible>0'),false);
      await ui.capture(`ecology-winter-${key}`);
      await ui.click('[data-season="summer"]');await ui.click('[data-weather="clear"]');
      assert.equal(await ui.read('__pond.ecology().shrimp.every(s=>s.visible)&&__pond.ecology().dragonflies.every(d=>d.visible)'),true);
    }
    assert.deepEqual(await ui.read('__pond.growth().map(p=>p.bornAt)'),births);
    const before=await ui.read('__pond.frames');await ui.wait(1100);assert.equal(await ui.read('__pond.frames'),before);
    return {type:'定向测试',observed,checks:['蜻蜓持续飞行与水黾移除','鱼经过时水草响应','水面范围与固定数量','两种风格及手机画面','夜晚、大雨与冬季隐藏','暖季恢复、出生时间保留、暂停零绘制']};
  }finally{
    await panel(true);await style(original.style);await ui.click(`[data-season="${original.season||'auto'}"]`);
    await ui.click(`[data-weather="${original.preset||'clear'}"]`);await ui.click(`[data-time="${original.time}"]`);await panel(false);await pause(original.paused);
  }
}

// 定向测试：真实时间内观察蜜蜂改变目标、采集停留和返巢，不修改动物状态。
export async function runBeeChecks(ui){
  const original=await ui.read('({season:__pond.seasons().mode,time:__pond.weather().timeMode,preset:__pond.weather().preset,paused:__pond.paused})');
  const panel=async open=>{if(await ui.read('document.querySelector("#weather-panel").open')!==open)await ui.click('#weather-summary');};
  try{
    await panel(true);await ui.click('[data-season="summer"]');await ui.click('[data-weather="clear"]');await ui.click('[data-time="day"]');await panel(false);
    if(await ui.read('__pond.paused'))await ui.click('#pause');
    const samples=[];
    for(let batch=0;batch<4;batch++)samples.push(...await ui.read(`new Promise(resolve=>{const rows=[];const timer=setInterval(()=>{rows.push({bees:__pond.shoreLife().bees,flowers:__pond.landings().flowers,butterflies:__pond.landings().butterflies,dragons:__pond.ecology().dragonflies});if(rows.length===16){clearInterval(timer);resolve(rows);}},500);})`));
    const states=new Set(),targets=Array.from({length:7},()=>new Set()),ranges=Array.from({length:7},()=>({minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity}));
    for(const row of samples){
      assert.equal(row.bees.length,7);const reserved=new Set();
      for(const b of row.bees){
        states.add(b.state);assert.ok([b.x,b.y,b.height].every(Number.isFinite));
        if(b.flowerId!==null){assert.ok(!reserved.has(b.flowerId));reserved.add(b.flowerId);assert.ok(!row.butterflies.some(f=>f.flowerId===b.flowerId));}
        if(b.state==='rest'){assert.ok(Math.hypot(b.x-b.targetX,b.y-b.targetY)<3);if(b.flowerId!==null){const f=row.flowers.find(p=>p.id===b.flowerId);assert.ok(f?.available);assert.ok(Math.abs(f.height-b.height)<2);}}
        if(b.state==='forage')targets[b.id].add(`${Math.round(b.targetX/20)},${Math.round(b.targetY/20)}`);
        const r=ranges[b.id];r.minX=Math.min(r.minX,b.x);r.maxX=Math.max(r.maxX,b.x);r.minY=Math.min(r.minY,b.y);r.maxY=Math.max(r.maxY,b.y);
      }
      assert.ok(row.dragons.every(d=>d.state==='flight'&&d.height>20));
    }
    for(const state of ['forage','rest','return','hive'])assert.ok(states.has(state),`缺少蜜蜂状态 ${state}`);
    const spans=ranges.map(r=>Math.hypot(r.maxX-r.minX,r.maxY-r.minY));assert.ok(spans.every(n=>n>100));assert.ok(targets.some(t=>t.size>1));
    return {type:'定向测试',samples:samples.length,seconds:32,states:[...states],travelSpans:spans,targetCounts:targets.map(t=>t.size)};
  }finally{
    await panel(true);await ui.click(`[data-season="${original.season||'auto'}"]`);await ui.click(`[data-weather="${original.preset||'clear'}"]`);await ui.click(`[data-time="${original.time}"]`);await panel(false);
    if(await ui.read('__pond.paused')!==original.paused)await ui.click('#pause');
  }
}
