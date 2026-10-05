import { Application, Assets, Container, Sprite, Texture, Rectangle, MeshSimple, BlurFilter } from 'pixi.js';
import { PondSimulation, WORLD } from './simulation.js';
import { createWaterFilter } from './water.js';
import { WeatherState, LotusGrowth } from './weather.js';
import { WeatherEffects, LotusVisuals } from './weather-effects.js';
import { setupWeatherUI } from './weather-ui.js';
import { ShoreLife } from './shore-life.js';
import { isWater } from './pond-surface.js';
import { PondClimate } from './pond-climate.js';
import { PondLife } from './pond-life.js';
import { FrameBudget } from './frame-budget.js';
import { savedSceneStyle, loadSceneStyle, setupSceneStyle } from './scene-style.js';
import { setupTreeSeasons } from './tree-seasons.js';
import { LOTUS_STORAGE_KEY } from './lotus-growth.js';
import { celestialAt } from './celestial.js';
import { wallpaper } from './wallpaper.js';
import { SurfaceMotion } from './surface-motion.js';
import { PondVegetation } from './pond-vegetation.js';
import { PondEcology } from './pond-ecology.js';
import { createWinterRemnants } from './winter-scene.js';
import { seasonProfile } from './season-profile.js';
import './style.css';
const host=document.querySelector('#pond');
const app=new Application();
const sim=new PondSimulation();
const weather=new WeatherState(),growth=new LotusGrowth();
const climate=new PondClimate(growth.plants),budget=new FrameBudget();sim.surface=climate;
const surfaceMotion=new SurfaceMotion();
const renderResolution=()=>Math.min(devicePixelRatio||1,1.5,2560/Math.max(innerWidth,innerHeight),Math.sqrt(2600000*budget.quality/Math.max(1,innerWidth*innerHeight)));
const TILT=.9; // A gentle 2.5D oblique overhead projection, not a full 3D camera.
let paused=false,ready=false,frames=0,lastClick=null,sky=null,skyKey="",skyCheckedAt=0;
const params=new URLSearchParams(location.search);
await app.init({resizeTo:window,preference:'webgl',antialias:true,resolution:renderResolution(),autoDensity:true,background:0x263f38,powerPreference:'high-performance'});
host.appendChild(app.canvas);
app.canvas.setAttribute('aria-label','水光粼粼的池塘，44 条鱼儿自由游动。点击水面投下涟漪，吸引附近的鱼');
app.canvas.tabIndex=0;
const [initialStyle,moonTexture,iceTexture]=await Promise.all([loadSceneStyle(wallpaper.enabled?wallpaper.options.style:savedSceneStyle()),Assets.load('/assets/moon-reference.png'),Assets.load({src:'/assets/ice-material.webp',data:{autoGenerateMipmaps:true,minFilter:'linear',mipmapFilter:'linear'}})]);
const bottom=initialStyle.bottom;
const world=new Container();app.stage.addChild(world);
const bg=new Sprite(bottom);bg.width=WORLD.width;bg.height=WORLD.height;world.addChild(bg);
const shadows=new Container();shadows.filters=[new BlurFilter({strength:1.5,quality:1,resolution:.5})];world.addChild(shadows);
const fishes=new Container();world.addChild(fishes);
const textures=initialStyle.fishTextures;
const COLS=18,ROWS=4;
const tailWeights=Array.from({length:COLS+1},(_,x)=>Math.pow(1-x/COLS,2.2));
const turnWeights=Array.from({length:COLS+1},(_,x)=>Math.pow(1-x/COLS,1.8));
const finWeights=Array.from({length:COLS+1},(_,x)=>Math.sin(Math.PI*x/COLS));
function fishMesh(texture,length) {
 const width=length, height=length*texture.height/texture.width;
 const vertices=new Float32Array((COLS+1)*(ROWS+1)*2),uvs=new Float32Array(vertices.length),indices=[];
 for(let y=0;y<=ROWS;y++)for(let x=0;x<=COLS;x++){
   const k=(y*(COLS+1)+x)*2;vertices[k]=(x/COLS-.5)*width;vertices[k+1]=(y/ROWS-.5)*height;uvs[k]=x/COLS;uvs[k+1]=y/ROWS;
 }
 for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){const n=y*(COLS+1)+x;indices.push(n,n+1,n+COLS+1,n+1,n+COLS+2,n+COLS+1);}
 const mesh=new MeshSimple({texture,vertices,uvs,indices:new Uint32Array(indices)});mesh.data={width,height};return mesh;
}
const visuals=sim.fish.map(f=>{
 const texture=textures[f.variant],mesh=fishMesh(texture,f.length),shadow=fishMesh(texture,f.length);
 mesh.alpha=.87+f.depth*.1;mesh.tint=0xdfebd6;shadow.tint=0x183d35;shadow.alpha=.15;
 shadows.addChild(shadow);fishes.addChild(mesh);return {mesh,shadow};
});
const pads=new Sprite(initialStyle.surface.texture);pads.width=WORLD.width;pads.height=WORLD.height;world.addChild(pads);
let surfaceOcclusion=initialStyle.surface,activeStyle=initialStyle,shownWinter=null;
const lotus=new LotusVisuals(world,initialStyle.lotus,growth,shadows);
const winterRemnants=createWinterRemnants(world);
const water=createWaterFilter(climate.texture,moonTexture,initialStyle.surface.foliage,iceTexture);world.filters=[water];world.filterArea=new Rectangle(0,0,WORLD.width,WORLD.height);
// Tiny bits of drifting pollen lend depth without turning the water into a particle effect.
const motes=new Container();world.addChild(motes);
const shoreWorld=new Container();app.stage.addChild(shoreWorld);
const shore=new ShoreLife(shoreWorld,initialStyle.shore,initialStyle.winter,initialStyle.layout);
shore.flowerSites=lotus.flowerSites;
const life=new PondLife(world,shoreWorld,initialStyle.life,climate,(x,y)=>shore.canopyAt(x,y));
life.flowers=lotus.flowerObstacles;
const vegetation=new PondVegetation(world,fishes,initialStyle.key);
const ecology=new PondEcology({world,fishLayer:vegetation.container,shoreWorld,climate,flowers:lotus.flowerSites,canopy:(x,y,clearance)=>shore.canopyAt(x,y,clearance),style:initialStyle.key});
const atmosphere=new WeatherEffects(app.stage,climate);
const weatherUI=setupWeatherUI(weather,growth,refreshScene);
function applySceneStyle(style){
 activeStyle=style;shownWinter=null;
 bg.texture=style.bottom;pads.texture=style.surface.texture;surfaceOcclusion=style.surface;
 bg.width=pads.width=WORLD.width;bg.height=pads.height=WORLD.height;
 for(let i=0;i<visuals.length;i++){
   const {mesh,shadow}=visuals[i];mesh.texture=shadow.texture=style.fishTextures[sim.fish[i].variant];
   mesh.tint=style.key==='cartoon'?0xffffff:0xe4ede0;
   const length=sim.fish[i].length*(style.key==='cartoon'?1.35:1);
   mesh.data.width=shadow.data.width=length;mesh.data.height=shadow.data.height=length*mesh.texture.height/mesh.texture.width;
   mesh.data.tailStrength=style.key==='cartoon'?.7:1;
 }
 shore.setStyle(style.shore,style.winter,style.layout);
 lotus.setStyle(style.lotus);life.setStyle(style.life);
 vegetation.setStyle(style.key);ecology.setStyle(style.key);
 water.resources.waterUniforms.uniforms.uStyle=style.key==='cartoon'?1:0;
 water.resources.uSurface=(shownWinter?style.winterSurface:style.surface).foliage.source;
}
applySceneStyle(initialStyle);
const appearance=setupSceneStyle(initialStyle,style=>{applySceneStyle(style);refreshScene();});
const seasons=setupTreeSeasons(refreshScene);
const pollen=Array.from({length:27},()=>{
 const sprite=new Sprite(Texture.WHITE);sprite.tint=0xece9be;sprite.alpha=.15;const size=.5+sim.random()*.8;sprite.width=sprite.height=size; motes.addChild(sprite);
 return {sprite,x:sim.random()*WORLD.width,y:sim.random()*WORLD.height,phase:sim.random()*6.28};
});
const view={scaleX:1,scaleY:1,x:0,y:0};
let canPan=false,cameraPanX=.5,cameraPanY=.5,gesture=null;
function syncView(){
 shoreWorld.position.copyFrom(world.position);
 view.scaleX=world.scale.x;view.scaleY=world.scale.y;view.x=world.x;view.y=world.y;
 const left=Math.max(0,-world.x/world.scale.x),top=Math.max(0,-world.y/world.scale.y);
 const right=Math.min(WORLD.width,(innerWidth-world.x)/world.scale.x),bottom=Math.min(WORLD.height,(innerHeight-world.y)/world.scale.y);
 const u=water.resources.waterUniforms.uniforms;
 u.uOrigin[0]=left;u.uOrigin[1]=top;u.uWorld[0]=right-left;u.uWorld[1]=bottom-top;
}
function panTo(x,y){
 if(!canPan)return;
 const overflowX=WORLD.width*world.scale.x-innerWidth,overflowY=WORLD.height*world.scale.y-innerHeight;
 if(overflowX>.5){world.x=Math.max(-overflowX,Math.min(0,x));cameraPanX=-world.x/overflowX;}
 if(overflowY>.5){world.y=Math.max(-overflowY,Math.min(0,y));cameraPanY=-world.y/overflowY;}
 syncView();
 if(paused)refreshScene();
}
function fit(){
 const fitScale=Math.min(innerWidth/WORLD.width,innerHeight/(WORLD.height*TILT)),fillScale=Math.max(innerWidth/WORLD.width,innerHeight/(WORLD.height*TILT));
 const wallpaperFit=wallpaper.enabled?wallpaper.options.fit:null;
 canPan=wallpaperFit==='fill'?fillScale>fitScale+.0001:wallpaperFit==='fit'?false:fitScale/fillScale<.8;
 if(view.width!==innerWidth||view.height!==innerHeight)gesture=null;
 view.width=innerWidth;view.height=innerHeight;
 const scale=wallpaperFit==='fill'||canPan?fillScale:fitScale;
 world.scale.set(scale,scale*TILT);
 world.position.set((innerWidth-WORLD.width*scale)*(canPan?cameraPanX:.5),(innerHeight-WORLD.height*scale*TILT)*(canPan?cameraPanY:.5));
 shoreWorld.scale.copyFrom(world.scale);syncView();
 shore.viewport={left:0,right:WORLD.width,top:0,bottom:WORLD.height};
 // Pixi applies the container transform to filterArea: keep it in local units.
 world.filterArea=new Rectangle(0,0,WORLD.width,WORLD.height);
 app.canvas.style.cursor=canPan?'grab':'default';
 app.canvas.setAttribute('aria-label',canPan?'水光粼粼的池塘，拖动或使用方向键查看全景，轻点水面吸引鱼群':`水光粼粼的池塘，${sim.activeFish.length} 条鱼儿游动。点击活水吸引附近的鱼`);
 document.querySelector('#hint span').textContent=canPan?'拖动浏览，轻点水面互动':'轻点水面，等鱼儿游来';
 app.renderer.resolution=renderResolution();app.renderer.resize(innerWidth,innerHeight);
 if(paused)refreshScene();
}
window.addEventListener('resize',fit);fit();
function deform(mesh,f) {
 const {width,height}=mesh.data,v=mesh.vertices;
 const activity=f.motionState==='rest'?.12:Math.min(1,.35+f.speed/60),finPhase=Math.sin(f.tailPhase*.66);
 for(let x=0;x<=COLS;x++){
   const u=x/COLS,bend=Math.sin(f.tailPhase+u*5.3)*tailWeights[x]*width*.095*activity*(mesh.data.tailStrength||1);
   const steer=-f.turn*turnWeights[x]*width*.021,fins=finPhase*finWeights[x]*.018;
   for(let y=0;y<=ROWS;y++){const k=(y*(COLS+1)+x)*2;v[k]=(u-.5)*width;v[k+1]=(y/ROWS-.5)*height*(1+fins)+bend+steer;}
 }
 mesh.position.set(f.x,f.y);mesh.rotation=f.angle;
}
function updateSky(date=new Date()){
 if(weather.setSeason(seasons.selected(date))){
   weatherUI.refreshSummary();
   if(weather.source==='demo'&&weather.season!=='winter'){
     climate.freeze=0;climate.snowCover=0;climate.airTemp=weather.current.temp;climate.waterTemp=weather.current.temp;
   }
 }
 shore.season=seasons.current(date,climate.winter);life.seasonWinter=shore.season==='winter';
 climate.season=shore.season;climate.seasonWinter=shore.season==='winter';climate.updatePlants();
 if(sim.season!==shore.season||sim.fishDensity!==wallpaper.fishDensity){sim.setSeason(shore.season,wallpaper.fishDensity);if(!canPan)app.canvas.setAttribute('aria-label',`水光粼粼的池塘，${sim.activeFish.length} 条鱼儿游动。点击活水吸引附近的鱼`);}
 if(shownWinter!==climate.seasonWinter){
   shownWinter=climate.seasonWinter;
   bg.texture=shownWinter?activeStyle.winterBottom:activeStyle.bottom;
   surfaceOcclusion=shownWinter?activeStyle.winterSurface:activeStyle.surface;
   pads.texture=surfaceOcclusion.texture;water.resources.uSurface=surfaceOcclusion.foliage.source;
   bg.width=pads.width=WORLD.width;bg.height=pads.height=WORLD.height;winterRemnants.visible=shownWinter;
 }
 const key=JSON.stringify([weather.timeMode,weather.location]);
 if(!sky||key!==skyKey||Math.abs(date.getTime()-skyCheckedAt)>=1000){
   sky=celestialAt({date,location:weather.location,timeMode:weather.timeMode,weather:weather.current});skyKey=key;skyCheckedAt=date.getTime();
   const note=document.querySelector('#celestial-note');if(note)note.textContent=sky.label;
 }
 return sky;
}
function updateLife(w=weather.forScene()){
 lotus.update(sim.time,w,shore.season);shore.snowCover=climate.snowCover;shore.winterAmount=climate.winterAmount;shore.update(sim.time,w);life.update(sim.time,w);
 vegetation.update(sim.time,w,shore.season,sim.activeFish);ecology.update(sim.time,w,shore.season,sim.activeFish);
}
function updateVisuals(updateAnimals=true){
 updateSky();
 sim.fish.forEach((f,i)=>{
   const {mesh,shadow}=visuals[i];mesh.visible=shadow.visible=f.active;if(!f.active)return;deform(mesh,f);shadow.vertices.set(mesh.vertices);
   const clearance=Math.max(0,f.waterDepth-f.submergence);
   shadow.position.set(mesh.x+4+clearance*19,mesh.y+5+clearance*25);shadow.rotation=mesh.rotation;
   shadow.scale.set(1+clearance*.16);shadow.alpha=.17-clearance*.18;
   mesh.alpha=(.96-f.submergence*(climate.seasonWinter?.65:.26))*(1-climate.iceAt(f.x,f.y)*.65);
 });
 const u=water.resources.waterUniforms.uniforms;u.uTime=sim.time;
 u.uWinter=shore.season==='winter'?1:0;
 u.uSeason=seasonProfile(shore.season).index;
 const w=weather.forScene();u.uWeather[0]=w.cloud;u.uWeather[1]=w.light;u.uWeather[2]=w.wind/12;u.uWeather[3]=w.snow;u.uWind[0]=w.windX;u.uWind[1]=w.windY;
 const twilight=Math.max(0,1-Math.abs(sky.sun.altitude-.035)/.22);
 const seasonalMist=[.15,.08,.18,.12][u.uSeason];
 u.uMist=seasonalMist*(.18+twilight*.82)*(1-Math.min(1,w.wind/9))*(1-w.rain*.85)*(1+.15*Math.sin(sim.time*.025));
 u.uClimate[0]=climate.iceLevel;u.uClimate[1]=climate.snowCover;u.uClimate[2]=budget.quality;u.uClimate[3]=w.temp;
 climate.updatePlants();
 surfaceMotion.update(sim.time,sim.activeFish,climate,w);
 for(let i=0;i<6;i++){const p=surfaceMotion.records[i],values=u['uWake'+i];values[0]=p.x;values[1]=p.y;values[2]=p.created;values[3]=p.strength;}
 for(let i=0;i<8;i++){const leaf=climate.leaves[i],values=u['uLeaf'+i];values[0]=leaf.x;values[1]=leaf.y;values[2]=leaf.radius;}
 if(updateAnimals)updateLife(w);
 const precipitation=atmosphere.update(sim.time,w,view,growth.plants,budget.quality,seasons.selected());
 // Real sky directions map into this fixed north-up pond. An explicit preview
 // illustrates a visible moon inside the viewport, including narrow screens.
 const moonX=sky.isPreview?WORLD.width*.54+Math.sin(sim.time/130)*125:sky.moon.reflection.x*WORLD.width;
 const moonY=sky.isPreview?WORLD.height*.42+Math.sin(sim.time/170+.6)*42:sky.moon.reflection.y*WORLD.height;
 u.uMoon[0]=moonX;u.uMoon[1]=moonY;u.uMoon[2]=sky.moon.visibility;u.uMoon[3]=sky.moon.illumination;
 u.uSun[0]=sky.sun.reflection.x*WORLD.width;u.uSun[1]=sky.sun.reflection.y*WORLD.height;u.uSun[2]=sky.sun.visibility;u.uSun[3]=sky.moon.phase;
 for(let i=0;i<16;i++){const p=precipitation.shaderImpacts[i],values=u['uRainImpact'+i];values[0]=p?.x||0;values[1]=p?.y||0;values[2]=p?p.created:-100;values[3]=p?w.rain:0;}
 for(let i=0;i<5;i++){
   const a=sim.attractors[i],values=u['uRipple'+i];values[0]=a?.x||0;values[1]=a?.y||0;values[2]=a?a.created:-100;values[3]=a?1:0;
 }
 for(let i=0;i<pollen.length;i++){const p=pollen[i],x=((p.x+sim.time*(1.6+w.windX*6))%WORLD.width+WORLD.width)%WORLD.width,y=p.y+Math.sin(sim.time*.18+p.phase)*7+Math.sin(sim.time*.07+p.phase)*w.windY*6;p.sprite.position.set(x,y);p.sprite.visible=i<seasonProfile(shore.season).pollen&&isWater(x,y);}
}
app.ticker.maxFPS=wallpaper.fps;
app.ticker.add(t=>{
 const start=performance.now();frames++;const date=new Date();updateSky(date);growth.step(date.getTime());
 // Raw elapsed time avoids slow motion; bounded steps preserve collision stability.
 const elapsed=Math.min(Math.max(t.elapsedMS/1000,0),2),steps=Math.max(1,Math.ceil(elapsed/(1/20))),dt=elapsed/steps;
 for(let i=0;i<steps;i++){
   weather.step(dt,date,sky.daylight);
   if(!paused){const w=weather.forScene();climate.step(dt,w,weather.source);sim.step(dt,w);updateLife(w);}
 }
 updateVisuals(paused);
 if(!paused)budget.record(start,performance.now()-start,app.ticker.maxFPS);
 if(budget.changed){budget.changed=false;fit();}
});
function refreshScene(){
 if(!ready)return;
 const date=new Date();updateSky(date);growth.step(date.getTime());
 if(paused){weather.step(0,date,sky.daylight);Object.assign(weather.current,weather.target);skyCheckedAt=0;}
 updateVisuals();
 if(!app.ticker.started&&!document.hidden&&!wallpaper.hostPaused){app.render();frames++;}
}
function syncPlayback(){
 budget.resetClock();
 if(paused||document.hidden||wallpaper.hostPaused)app.ticker.stop();
 else app.ticker.start();
 if(ready&&!document.hidden&&!wallpaper.hostPaused)refreshScene();
}
document.addEventListener('visibilitychange',syncPlayback);
window.addEventListener('pagehide',()=>growth.persist(true));
window.addEventListener('storage',event=>{if(event.key===LOTUS_STORAGE_KEY&&event.newValue){growth.sync(event.newValue);if(paused)refreshScene();}});
function attractClient(clientX,clientY){
 const rect=app.canvas.getBoundingClientRect();const x=(clientX-rect.left-world.x)/world.scale.x,y=(clientY-rect.top-world.y)/world.scale.y;
 life.disturb(x,y,sim.time);lastClick=sim.attract(x,y);if(lastClick.accepted)document.querySelector('#hint').classList.add('quiet');if(paused)refreshScene();return lastClick;
}
app.canvas.addEventListener('pointerdown',e=>{
 if(!wallpaper.interactive)return;
 if(!e.isPrimary||e.button!==0)return;
 if(!canPan){attractClient(e.clientX,e.clientY);return;}
 gesture={id:e.pointerId,x:e.clientX,y:e.clientY,worldX:world.x,worldY:world.y,dragged:false};
 app.canvas.setPointerCapture(e.pointerId);
});
app.canvas.addEventListener('pointermove',e=>{
 if(!gesture||gesture.id!==e.pointerId)return;
 const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
 if(!gesture.dragged&&Math.hypot(dx,dy)>8)gesture.dragged=true;
 if(gesture.dragged){panTo(gesture.worldX+dx,gesture.worldY+dy);app.canvas.style.cursor='grabbing';document.querySelector('#hint').classList.add('quiet');}
});
app.canvas.addEventListener('pointerup',e=>{
 if(!gesture||gesture.id!==e.pointerId)return;
 const tap=!gesture.dragged;gesture=null;
 if(app.canvas.hasPointerCapture(e.pointerId))app.canvas.releasePointerCapture(e.pointerId);
 app.canvas.style.cursor=canPan?'grab':'default';
 if(tap)attractClient(e.clientX,e.clientY);
});
const cancelGesture=()=>{gesture=null;app.canvas.style.cursor=canPan?'grab':'default';};
app.canvas.addEventListener('pointercancel',cancelGesture);
app.canvas.addEventListener('lostpointercapture',cancelGesture);
function togglePause(){paused=!paused;syncPlayback();const b=document.querySelector('#pause');b.setAttribute('aria-label',paused?'继续动画':'暂停动画');b.innerHTML=paused?'<svg viewBox="0 0 20 20"><path d="m7 4 8 6-8 6Z"/></svg>':'<svg viewBox="0 0 20 20"><path d="M7 5v10M13 5v10"/></svg>';}
async function fullscreen(){try{document.fullscreenElement?await document.exitFullscreen():await document.documentElement.requestFullscreen();}catch(error){console.info('Fullscreen is unavailable in this preview',error.message);}}
document.querySelector('#pause').addEventListener('click',togglePause);document.querySelector('#fullscreen').addEventListener('click',fullscreen);
window.addEventListener('keydown',e=>{if(wallpaper.enabled||e.target.closest('input,button,select,textarea,summary'))return;if(canPan&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();panTo(world.x+(e.key==='ArrowLeft'?100:e.key==='ArrowRight'?-100:0),world.y+(e.key==='ArrowUp'?100:e.key==='ArrowDown'?-100:0));}if(e.code==='Space'){e.preventDefault();togglePause();}if(e.key.toLowerCase()==='f')fullscreen();});
wallpaper.attach({
 apply(changed){
   if(changed.style)appearance.select(changed.style);
   if(changed.season)seasons.select(changed.season);
   if(changed.weather||changed.season)weatherUI.setDemo(changed.weather||wallpaper.options.weather);
   if(changed.time)weatherUI.setTime(changed.time);
   if(changed.fit)fit();
   if(changed.fps){app.ticker.maxFPS=wallpaper.fps;budget.resetClock();}
   if(changed.interaction===false)cancelGesture();
   if(Object.hasOwn(changed,'fishdensity'))refreshScene();
 },
 playback:syncPlayback,
});
updateVisuals();ready=true;document.querySelector('#loading').classList.add('done');setTimeout(()=>document.querySelector('#loading')?.remove(),1200);setTimeout(()=>document.querySelector('#hint').classList.add('quiet'),9000);
// Small deterministic observation API for verification and reproducible captures.
window.__pond={get ready(){return ready},get renderer(){return app.renderer.name},get paused(){return paused},get frames(){return frames},get lastClick(){return lastClick},snapshot:()=>sim.snapshot(),weather:()=>({source:weather.source,preset:weather.preset,current:{...weather.current},target:{...weather.target},timeMode:weather.timeMode}),growth:()=>growth.snapshot(),sky:()=>structuredClone(sky),climate:()=>climate.snapshot(),wildlife:()=>life.snapshot(),butterflies:()=>shore.butterflies.map(b=>({x:b.x,y:b.y,state:b.state,height:b.height,visible:b.sprite.visible})),precipitation:()=>({rain:structuredClone(atmosphere.frame.rain),impacts:structuredClone(atmosphere.frame.impacts),snow:structuredClone(atmosphere.frame.snow),shaderImpacts:structuredClone(atmosphere.frame.shaderImpacts)}),performance:()=>({...budget.snapshot(),resolution:app.renderer.resolution,drawPixels:app.canvas.width*app.canvas.height}),viewport:()=>({x:world.x,y:world.y,width:WORLD.width*world.scale.x,height:WORLD.height*world.scale.y,scaleX:world.scale.x,scaleY:world.scale.y,windowWidth:innerWidth,windowHeight:innerHeight}),waterAt:(x,y)=>isWater(x,y),surfaceAt:(x,y)=>climate.surfaceAt(x,y)};
window.__pond.shoreLife=()=>shore.snapshot();
window.__pond.plantsDisplay=()=>lotus.snapshot();
window.__pond.winterScene=()=>({active:shownWinter,remnants:winterRemnants.visible,probes:[[260,260],[400,180],[1450,260],[1320,750],[650,355],[1000,500]].map(([x,y])=>({x,y,ice:climate.iceAt(x,y),surface:climate.surfaceAt(x,y)})),fishAlpha:visuals.map(v=>v.mesh.alpha)});
window.__pond.flowerObstacles=()=>lotus.flowerObstacles.map(p=>({...p}));
window.__pond.appearance=()=>appearance.snapshot();
window.__pond.seasons=()=>seasons.snapshot();
window.__pond.seasonScene=()=>({season:shore.season,profile:{...seasonProfile(shore.season)},activeFish:sim.activeFish.length,visibleFish:visuals.filter(v=>v.mesh.visible).length,fish:sim.fish.map((f,i)=>({id:f.id,active:f.active,visible:visuals[i].mesh.visible,x:f.x,y:f.y,speed:f.speed,depth:f.submergence/Math.max(.01,f.waterDepth)})),leafRadii:climate.leaves.map(p=>p.radius)});
window.__pond.mist=()=>({strength:water.resources.waterUniforms.uniforms.uMist,time:sim.time,sunAltitude:sky.sun.altitude});
window.__pond.moonReflection=()=>({preview:sky.isPreview,center:[...water.resources.waterUniforms.uniforms.uMoon].slice(0,2),time:sim.time});
window.__pond.precipitationBudget=()=>({season:atmosphere.frame.season,rainBudget:atmosphere.frame.rainBudget,rainCount:atmosphere.frame.rainCount,snowCount:atmosphere.frame.snowCount,drawnRain:atmosphere.rain.particleChildren.length,drawnSnow:atmosphere.snow.particleChildren.length,rings:atmosphere.frame.impacts.length});
window.__pond.meshBudget=()=>({fishVertices:(COLS+1)*(ROWS+1),batchedFish:visuals.filter(v=>v.mesh.batched).length});
window.__pond.neighborBudget=()=>({checks:sim.neighborChecks,allPairs:sim.fish.length*(sim.fish.length-1),cells:sim.gridHeads.length});
window.__pond.surfaceMotion=()=>({capacity:surfaceMotion.records.length,active:surfaceMotion.snapshot(sim.time)});
window.__pond.ecology=()=>({...ecology.snapshot(),vegetation:vegetation.snapshot(),waterPasses:world.filters.length});
window.__pond.occlusion=()=>({leafPixels:surfaceOcclusion.leafPixels,probes:[[405,522],[580,750],[192,198],[450,522],[879,864]].map(([x,y])=>({x,y,alpha:surfaceOcclusion.at(x,y)}))});
window.__pond.landings=()=>({flowers:lotus.flowerSites.map(p=>({...p})),butterflies:shore.butterflies.map(b=>({id:b.index,state:b.state,x:b.x,y:b.y,height:b.height,perch:b.perchKind,flowerId:b.flowerId,targetX:b.targetX,targetY:b.targetY,screenY:b.sprite.y,shadowY:b.shadow.y,landings:b.landingCount||0,flowerVisits:b.flowerVisits||0}))});
window.__pond.wallpaper=()=>({...wallpaper.snapshot(),tickerRunning:app.ticker.started,tickerFPS:app.ticker.maxFPS});
if(params.has('still')){togglePause();document.querySelector('#hint').classList.add('quiet');}
else syncPlayback();
