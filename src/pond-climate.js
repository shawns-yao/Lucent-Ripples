import { Texture, BufferImageSource } from 'pixi.js';
import { isOpenWater, isPad, isWater, shoreDistance } from './pond-surface.js';
import { lotusAppearance } from './lotus-growth.js';
import { waterDepth } from './pond-layout.js';
import { remnantAt } from './winter-scene.js';

const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const WORLD_WIDTH=1672,WORLD_HEIGHT=941;

/** R: summer water, G: winter water, B: depth, A: cached shallow-ice footprint. */
function terrainTexture() {
  const canvas=document.createElement('canvas');canvas.width=418;canvas.height=236;
  const context=canvas.getContext('2d'),pixels=context.createImageData(canvas.width,canvas.height),near={};
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++) {
    const wx=(x+.5)/canvas.width*WORLD_WIDTH,wy=(y+.5)/canvas.height*WORLD_HEIGHT;
    const distance=shoreDistance(wx,wy,near).distance,water=isOpenWater(wx,wy);
    const k=(y*canvas.width+x)*4;
    pixels.data[k]=water?Math.round(clamp(distance/4)*255):0;
    const winterWater=isWater(wx,wy)&&!remnantAt(wx,wy);
    pixels.data[k+1]=winterWater?Math.round(clamp(distance/4)*255):0;
    pixels.data[k+2]=Math.round(waterDepth(wx,wy,distance)*255);
    // One connected shore sheet surrounds a long, asymmetric deep-water opening.
    const dx=wx-790,dy=wy-455+dx*.16;
    const inlet=18*Math.sin(wx*.014)+12*Math.sin(wy*.031+wx*.009);
    const jagged=4*Math.sin(wx*.085+wy*.054)+3*Math.sin(wy*.11-wx*.033);
    const boundary=(Math.hypot(dx/490,dy/195)-1)*180+inlet+jagged;
    const thickness=clamp(.3+boundary/110);
    pixels.data[k+3]=Math.round(255*(winterWater?thickness:0));
  }
  // Upload data directly: a canvas would lose RGB precision where ice alpha is zero.
  const texture=new Texture({source:new BufferImageSource({resource:new Uint8Array(pixels.data.buffer),width:canvas.width,height:canvas.height,format:'rgba8unorm',alphaMode:'no-premultiply-alpha',scaleMode:'linear'})});
  return {texture,data:pixels.data,width:canvas.width,height:canvas.height};
}

export class PondClimate {
  constructor(plants) {
    this.terrain=terrainTexture();this.texture=this.terrain.texture;this.freeze=0;this.snowCover=0;this.waterTemp=20;this.airTemp=20;this.seasonWinter=false;
    this.plants=plants;this.leaves=Array.from({length:8},()=>({x:0,y:0,radius:0}));
    this.near={};this.updatePlants();
  }
  updatePlants() {
    for(let i=0;i<this.leaves.length;i++) {
      const p=this.plants[i],leaf=this.leaves[i];
      leaf.x=p?.x||0;leaf.y=p?.y||0;
      leaf.radius=!this.seasonWinter&&p&&p.age>=0?36*lotusAppearance(p.age,this.season).leafScale:0;
    }
  }
  step(dt,weather,source) {
    const temp=Number.isFinite(weather.temp)?weather.temp:20;
    this.airTemp=temp;
    // Live weather is only the current air observation, not a water-temperature
    // history. A slow visual approximation prevents instant freezing on refresh.
    const demo=source==='demo',thermalTime=demo?3:600;
    this.waterTemp+=(temp-this.waterTemp)*(1-Math.exp(-dt/thermalTime));
    const iceTarget=clamp((-this.waterTemp+.4)/2.2);
    this.freeze+=(iceTarget-this.freeze)*(1-Math.exp(-dt/(demo?10:600)));
    const snowTarget=temp<2?weather.snow*.92:0;
    this.snowCover+=(snowTarget-this.snowCover)*(1-Math.exp(-dt/(snowTarget>this.snowCover?24:38)));
  }
  plantAt(x,y) {
    for(const p of this.leaves)if(p.radius>0&&(x-p.x)**2+(y-p.y)**2<p.radius*p.radius)return true;
    return false;
  }
  iceAt(x,y) {
    if(this.iceLevel<.02||!isWater(x,y)||this.plantAt(x,y)||(!this.seasonWinter&&isPad(x,y))||this.seasonWinter&&remnantAt(x,y))return 0;
    const {data,width,height}=this.terrain;
    const px=clamp(x/WORLD_WIDTH*width-.5,0,width-1),py=clamp(y/WORLD_HEIGHT*height-.5,0,height-1);
    const ix=Math.floor(px),iy=Math.floor(py),fx=px-ix,fy=py-iy;
    const sample=(a,b)=>data[(b*width+a)*4+3]/255;
    const a=sample(ix,iy)*(1-fx)+sample(Math.min(ix+1,width-1),iy)*fx;
    const b=sample(ix,Math.min(iy+1,height-1))*(1-fx)+sample(Math.min(ix+1,width-1),Math.min(iy+1,height-1))*fx;
    return (a*(1-fy)+b*fy)*this.iceLevel;
  }
  surfaceAt(x,y) {
    if(this.seasonWinter?remnantAt(x,y):this.plantAt(x,y)||isPad(x,y))return 'leaf';
    if(!isWater(x,y))return 'ground';
    return this.iceAt(x,y)>.3?'ice':'water';
  }
  // The chosen winter scene is an artistic half-frozen preset, not measured ice.
  get iceLevel(){return this.seasonWinter?1:this.freeze;}
  get winter(){return this.freeze>.025||this.airTemp<6;}
  get winterAmount(){return Math.max(this.seasonWinter?1:0,clamp((6-this.airTemp)/7),clamp(this.freeze*4));}
  snapshot(){return {freeze:this.freeze,iceLevel:this.iceLevel,seasonWinter:this.seasonWinter,snowCover:this.snowCover,waterTemp:this.waterTemp,winter:this.winter,winterAmount:this.winterAmount};}
}
