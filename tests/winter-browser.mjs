import assert from 'node:assert/strict';

// 定向测试：只操作页面控件、点击画布，再读取真实场景的观察接口。
export async function runWinterChecks(ui){
  const panel=async open=>{if(await ui.read('document.querySelector("#weather-panel").open')!==open)await ui.click('#weather-summary');};
  const pause=async value=>{if(await ui.read('__pond.paused')!==value)await ui.click('#pause');};
  const births=await ui.read('__pond.growth().map(p=>p.bornAt)');
  const results=[];
  await pause(true);await panel(true);await ui.click('[data-season="summer"]');await ui.click('[data-weather="clear"]');await ui.click('[data-time="day"]');await panel(false);
  await ui.size({width:2560,height:1440});await pause(false);await ui.wait(8000);
  const summer=await ui.read('__pond.snapshot().fish.reduce((s,f)=>s+f.speed,0)/44');
  await pause(true);await panel(true);await ui.click('[data-season="winter"]');await panel(false);await pause(false);await ui.wait(8000);
  const winter=await ui.read('({speed:__pond.snapshot().fish.reduce((s,f)=>s+f.speed,0)/44,depth:__pond.snapshot().fish.reduce((s,f)=>s+f.submergence/Math.max(.01,f.waterDepth),0)/44,performance:__pond.performance()})');
  assert.ok(winter.speed<summer*.85);assert.ok(winter.depth>.72);
  assert.equal(await ui.read('__pond.surfaceMotion().active.some(p=>p.kind==="leaf")'),false);
  await pause(true);
  for(const style of ['natural','cartoon']){
    await panel(true);await ui.click(`button[data-scene-style="${style}"]`);
    for(let i=0;i<50&&await ui.read('__pond.appearance().pending!==null');i++)await ui.wait(100);
    assert.equal(await ui.read('__pond.appearance().current'),style);await panel(false);
    const state=await ui.read('({winter:__pond.winterScene(),plants:__pond.plantsDisplay(),occlusion:__pond.occlusion(),fish:__pond.snapshot().fish.length,passes:__pond.ecology().waterPasses})');
    assert.ok(state.winter.active&&state.winter.remnants);assert.equal(state.occlusion.leafPixels,0);
    assert.ok(state.plants.plants.every(p=>!p.visible&&!p.flowerVisible));assert.equal(state.fish,44);assert.equal(state.passes,1);
    assert.ok(state.winter.probes.slice(0,4).every(p=>p.surface==='ice'));assert.ok(state.winter.probes.slice(4).every(p=>p.surface==='water'));
    assert.equal(await ui.read('__pond.surfaceAt(873,826)'), 'water');
    for(const [x,y,accepted] of [[400,180,false],[650,355,true],[873,826,true]]){
      const p=await ui.read(`({x:__pond.viewport().x+${x}*__pond.viewport().scaleX,y:__pond.viewport().y+${y}*__pond.viewport().scaleY})`);
      await ui.tap(p.x,p.y);assert.equal(await ui.read('__pond.lastClick.accepted'),accepted);
    }
    await panel(true);await ui.click('[data-weather="rain"]');await panel(false);await pause(false);
    const precipitation=await ui.read(`new Promise(resolve=>{let count=0,impacts=0,invalid=0;const timer=setInterval(()=>{for(const p of __pond.precipitation().impacts){impacts++;if(__pond.surfaceAt(p.x,p.y)!=='water')invalid++;}if(++count===16){clearInterval(timer);resolve({impacts,invalid});}},250);})`);
    assert.ok(precipitation.impacts>0);assert.equal(precipitation.invalid,0);results.push({style,...precipitation});
    await pause(true);await panel(true);await ui.click('[data-weather="clear"]');await ui.click('[data-season="summer"]');await panel(false);
    assert.ok(await ui.read('__pond.plantsDisplay().plants.some(p=>p.visible)'));assert.ok(await ui.read('__pond.occlusion().leafPixels')>0);
    assert.deepEqual(await ui.read('__pond.growth().map(p=>p.bornAt)'),births);
    await panel(true);await ui.click('[data-season="winter"]');await panel(false);
  }
  return {type:'定向测试',summerSpeed:summer,winter,results,checks:['冬季两种底图与残荷','冰面拒绝点击和雨滴波纹','中央与移除荷叶处可互动','暖季恢复及生长日期保留','鱼减速和下潜','单水面滤镜及2K预算']};
}

export async function runFrogFlowerChecks(ui){
  if(await ui.read('__pond.paused'))await ui.click('#pause');
  if(!await ui.read('document.querySelector("#weather-panel").open'))await ui.click('#weather-summary');
  await ui.click('[data-season="summer"]');await ui.click('[data-weather="clear"]');await ui.click('[data-time="day"]');await ui.click('#weather-summary');
  const before=await ui.read('__pond.wildlife().frogs.reduce((s,f)=>s+f.jumpCount,0)');
  const batches=[];
  for(let batch=0;batch<4;batch++)batches.push(await ui.read(`new Promise(resolve=>{
    let frames=0,flowers=0,visible=0,overlaps=0,reservations=0,spacing=0;const states=new Set();
    const timer=setInterval(()=>{
      const blooms=__pond.flowerObstacles().filter(p=>p.radius>1),frogs=__pond.wildlife().frogs;flowers=Math.max(flowers,blooms.length);
      for(const f of frogs){if(!f.visible)continue;visible++;states.add(f.state);
        for(const p of blooms){if(Math.hypot(f.x-p.x,f.y-f.height-p.y)<p.radius+18)overlaps++;if(f.perch&&Math.hypot(f.perch.x-p.x,f.perch.y-p.y)<p.radius+18)reservations++;}
        if(f.state==='rest'||f.state==='settle')for(const other of frogs)if(other.id>f.id&&(other.state==='rest'||other.state==='settle')&&Math.hypot(f.x-other.x,f.y-other.y)<43)spacing++;
      }
      if(++frames===80){clearInterval(timer);resolve({frames,flowers,visible,overlaps,reservations,spacing,states:[...states]});}
    },100);
  })`));
  for(const result of batches){assert.ok(result.flowers>0&&result.visible>0);assert.equal(result.overlaps,0);assert.equal(result.reservations,0);assert.equal(result.spacing,0);}
  const jumps=await ui.read('__pond.wildlife().frogs.reduce((s,f)=>s+f.jumpCount,0)')-before;
  assert.ok(jumps>0);return {type:'定向测试',jumps,batches};
}
