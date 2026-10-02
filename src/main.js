import { Application, Assets, Container, Sprite, Texture, Rectangle, MeshSimple, Graphics, BlurFilter } from 'pixi.js';
import { PondSimulation, WORLD } from './simulation.js';
import { createWaterFilter } from './water.js';
import { WeatherState, LotusGrowth } from './weather.js';
import { WeatherEffects, LotusVisuals } from './weather-effects.js';
import { setupWeatherUI } from './weather-ui.js';
import { ShoreLife } from './shore-life.js';
import { STATIC_PADS } from './pond-surface.js';
import { LOTUS_STORAGE_KEY } from './lotus-growth.js';
import { celestialAt } from './celestial.js';
import './style.css';
const host=document.querySelector('#pond');
const app=new Application();
const sim=new PondSimulation();
const weather=new WeatherState(),growth=new LotusGrowth();
const TILT=.9; // A gentle 2.5D oblique overhead projection, not a full 3D camera.
let paused=false,ready=false,frames=0,lastClick=null,sky=null,skyKey="",skyCheckedAt=0;
const params=new URLSearchParams(location.search);
await app.init({resizeTo:window,preference:'webgl',antialias:true,resolution:Math.min(devicePixelRatio,1.5),autoDensity:true,background:0x507e70,powerPreference:'high-performance'});
host.appendChild(app.canvas);
app.canvas.setAttribute('aria-label','水光粼粼的池塘，44 条锦鲤自由游动。点击水面投下涟漪，吸引附近的鱼');
app.canvas.tabIndex=0;
const [bottom,atlas,lotusAtlas,shoreAtlas]=await Promise.all([Assets.load('/assets/pond-bottom.png'),Assets.load('/assets/koi-atlas.png'),Assets.load('/assets/lotus-growth.png'),Assets.load('/assets/shore-life.png')]);
const world=new Container();app.stage.addChild(world);
const bg=new Sprite(bottom);bg.width=WORLD.width;bg.height=WORLD.height;world.addChild(bg);
const shadows=new Container();shadows.filters=[new BlurFilter({strength:1.8,quality:2})];world.addChild(shadows);
const fishes=new Container();world.addChild(fishes);
const framesData=[[13,18,743,324],[789,19,732,325],[13,355,740,315],[785,358,735,315],[14,684,742,321],[788,687,733,320]];
const textures=framesData.map(([x,y,width,height])=>new Texture({source:atlas.source,frame:new Rectangle(x,y,width,height)}));
const COLS=20,ROWS=4;
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
// Surface leaves occlude submerged fish; full-texture masks retain the original painterly edges.
const pads=new Sprite(bottom);pads.width=WORLD.width;pads.height=WORLD.height;
const padMask=new Graphics();
for(const [x,y,rx,ry] of STATIC_PADS)padMask.ellipse(x,y,rx,ry).fill(0xffffff);
world.addChild(pads,padMask);pads.mask=padMask;
const lotus=new LotusVisuals(world,lotusAtlas,growth);
const water=createWaterFilter();world.filters=[water];world.filterArea=new Rectangle(0,0,WORLD.width,WORLD.height);
// Tiny bits of drifting pollen lend depth without turning the water into a particle effect.
const motes=new Graphics();world.addChild(motes);
const shoreWorld=new Container();app.stage.addChild(shoreWorld);
const shore=new ShoreLife(shoreWorld,shoreAtlas);
const atmosphere=new WeatherEffects(app.stage);
const weatherUI=setupWeatherUI(weather,growth);
const pollen=Array.from({length:27},()=>({x:sim.random()*WORLD.width,y:sim.random()*WORLD.height,size:.5+sim.random()*.8,phase:sim.random()*6.28}));
function fit(){const scale=Math.max(innerWidth/WORLD.width,innerHeight/(WORLD.height*TILT));world.scale.set(scale,scale*TILT);world.position.set((innerWidth-WORLD.width*scale)/2,(innerHeight-WORLD.height*scale*TILT)/2);shoreWorld.scale.copyFrom(world.scale);shoreWorld.position.copyFrom(world.position);shore.viewport={left:-world.x/world.scale.x,right:(innerWidth-world.x)/world.scale.x,top:-world.y/world.scale.y,bottom:(innerHeight-world.y)/world.scale.y};world.filterArea=new Rectangle(0,0,innerWidth,innerHeight);}
window.addEventListener('resize',fit);fit();
function deform(mesh,f) {
 const {width,height}=mesh.data,v=mesh.vertices;
 for(let y=0;y<=ROWS;y++)for(let x=0;x<=COLS;x++){
   const u=x/COLS, tail=1-u, k=(y*(COLS+1)+x)*2;
   const activity=f.motionState==='rest'?.12:Math.min(1,.35+f.speed/60);
   const bend=Math.sin(f.tailPhase+u*5.3)*Math.pow(tail,2.2)*width*.095*activity;
   const steer=-f.turn*Math.pow(tail,1.8)*width*.021;
   const fins=Math.sin(f.tailPhase*.66)*Math.sin(Math.PI*u)*.018;
   v[k]=(u-.5)*width;v[k+1]=(y/ROWS-.5)*height*(1+fins)+bend+steer;
 }
 mesh.position.set(f.x,f.y);mesh.rotation=f.angle;
}
function updateSky(date=new Date()){
 const key=JSON.stringify([weather.timeMode,weather.location]);
 if(!sky||key!==skyKey||Math.abs(date.getTime()-skyCheckedAt)>=1000){
   sky=celestialAt({date,location:weather.location,timeMode:weather.timeMode,weather:weather.current});skyKey=key;skyCheckedAt=date.getTime();
   const note=document.querySelector('#celestial-note');if(note)note.textContent=sky.label;
 }
 return sky;
}
function updateVisuals(){
 updateSky();
 sim.fish.forEach((f,i)=>{const {mesh,shadow}=visuals[i];deform(mesh,f);deform(shadow,f);shadow.x+=5+f.depth*3;shadow.y+=7+f.depth*4;});
 const u=water.resources.waterUniforms.uniforms;u.uTime=sim.time;
 const w=weather.current;u.uWeather=[w.cloud,w.light,w.wind/12,w.snow];u.uWind=[w.windX,w.windY];
 lotus.update(sim.time,w);shore.update(sim.time,w);
 const precipitation=atmosphere.update(sim.time,w,{scaleX:world.scale.x,scaleY:world.scale.y,x:world.x,y:world.y},growth.plants);
 // Real sky directions map into this fixed north-up pond. An explicit preview
 // illustrates a visible moon inside the viewport, including narrow screens.
 const offsetX=world.x/world.scale.x,offsetY=world.y/world.scale.y;
 const moonX=sky.isPreview?innerWidth/world.scale.x*.57:sky.moon.reflection.x*WORLD.width+offsetX;
 const moonY=sky.isPreview?innerHeight/world.scale.y*.29:sky.moon.reflection.y*WORLD.height+offsetY;
 u.uMoon=[moonX,moonY,sky.moon.visibility,sky.moon.illumination];
 u.uSun=[sky.sun.reflection.x*WORLD.width+offsetX,sky.sun.reflection.y*WORLD.height+offsetY,sky.sun.visibility,sky.moon.phase];
 for(let i=0;i<16;i++){const p=precipitation.shaderImpacts[i];u['uRainImpact'+i]=p?[p.x+offsetX,p.y+offsetY,p.created,w.rain]:[0,0,-100,0];}
 // Translate click coordinates through the viewport's current cover transform.
 u.uWorld=[innerWidth/world.scale.x,innerHeight/world.scale.y];
 for(let i=0;i<5;i++){
   const a=sim.attractors[i];u['uRipple'+i]=a?[a.x+world.x/world.scale.x,a.y+world.y/world.scale.y,a.created,1]:[0,0,-100,0];
 }
 motes.clear();for(const p of pollen){const x=(p.x+sim.time*(1.6+w.windX*6))%WORLD.width,y=p.y+Math.sin(sim.time*.18+p.phase)*7+Math.sin(sim.time*.07+p.phase)*w.windY*6;motes.circle(x,y,p.size).fill({color:0xece9be,alpha:.18});}
}
app.ticker.maxFPS=60;
app.ticker.add(t=>{frames++;const date=new Date();updateSky(date);growth.step(date.getTime());const dt=Math.min(t.deltaMS/1000,1/20);weather.step(dt,date,sky.daylight);if(!paused)sim.step(dt);updateVisuals();});
window.addEventListener('pagehide',()=>growth.persist(true));
window.addEventListener('storage',event=>{if(event.key===LOTUS_STORAGE_KEY&&event.newValue)growth.sync(event.newValue);});
function attractClient(clientX,clientY){
 const rect=app.canvas.getBoundingClientRect();const x=(clientX-rect.left-world.x)/world.scale.x,y=(clientY-rect.top-world.y)/world.scale.y;
 lastClick=sim.attract(x,y);document.querySelector('#hint').classList.add('quiet');return lastClick;
}
app.canvas.addEventListener('pointerdown',e=>{if(e.isPrimary&&e.button===0)attractClient(e.clientX,e.clientY);});
function togglePause(){paused=!paused;const b=document.querySelector('#pause');b.setAttribute('aria-label',paused?'继续动画':'暂停动画');b.innerHTML=paused?'<svg viewBox="0 0 20 20"><path d="m7 4 8 6-8 6Z"/></svg>':'<svg viewBox="0 0 20 20"><path d="M7 5v10M13 5v10"/></svg>';}
async function fullscreen(){try{document.fullscreenElement?await document.exitFullscreen():await document.documentElement.requestFullscreen();}catch(error){console.info('Fullscreen is unavailable in this preview',error.message);}}
document.querySelector('#pause').addEventListener('click',togglePause);document.querySelector('#fullscreen').addEventListener('click',fullscreen);
window.addEventListener('keydown',e=>{if(e.target.closest('input,button,select,textarea,summary'))return;if(e.code==='Space'){e.preventDefault();togglePause();}if(e.key.toLowerCase()==='f')fullscreen();});
updateVisuals();ready=true;document.querySelector('#loading').classList.add('done');setTimeout(()=>document.querySelector('#loading')?.remove(),1200);setTimeout(()=>document.querySelector('#hint').classList.add('quiet'),9000);
// Small deterministic observation API for verification and reproducible captures.
window.__pond={get ready(){return ready},get renderer(){return app.renderer.name},get paused(){return paused},get frames(){return frames},get lastClick(){return lastClick},snapshot:()=>sim.snapshot(),weather:()=>({source:weather.source,preset:weather.preset,current:{...weather.current},target:{...weather.target},timeMode:weather.timeMode}),setWeather:name=>weatherUI.setDemo(name),growth:()=>growth.snapshot(),sky:()=>structuredClone(updateSky()),precipitation:()=>structuredClone(atmosphere.frame),attract:(x,y)=>sim.attract(x,y),pause:(value=true)=>{if(paused!==value)togglePause()},advance:(seconds)=>{for(let i=0;i<Math.round(seconds*60);i++){sim.step(1/60);weather.step(1/60,new Date(),updateSky().daylight);}growth.step();updateVisuals();app.render();},render:()=>app.render(),app};
if(params.has('still')){paused=true;document.querySelector('#hint').classList.add('quiet');}
