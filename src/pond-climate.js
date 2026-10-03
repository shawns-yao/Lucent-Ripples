import { Texture } from 'pixi.js';
import { isOpenWater, isPad, isWater, shoreDistance } from './pond-surface.js';
import { lotusAppearance } from './lotus-growth.js';

const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const WORLD_WIDTH=1672,WORLD_HEIGHT=941;

/** R: moving water, G: snow-catching ground, B: distance from the bank. */
function terrainTexture() {
  const canvas=document.createElement('canvas');canvas.width=418;canvas.height=236;
  const context=canvas.getContext('2d'),pixels=context.createImageData(canvas.width,canvas.height),near={};
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++) {
    const wx=(x+.5)/canvas.width*WORLD_WIDTH,wy=(y+.5)/canvas.height*WORLD_HEIGHT;
    const distance=shoreDistance(wx,wy,near).distance,water=isOpenWater(wx,wy);
    const k=(y*canvas.width+x)*4;
    pixels.data[k]=water?Math.round(clamp(distance/4)*255):0;
    pixels.data[k+1]=water?0:255;
    pixels.data[k+2]=Math.round(clamp(Math.max(0,distance)/128)*255);
    pixels.data[k+3]=255;
  }
  context.putImageData(pixels,0,0);
  return Texture.from(canvas);
}

export class PondClimate {
  constructor(plants) {
    this.texture=terrainTexture();this.freeze=0;this.snowCover=0;this.waterTemp=20;this.airTemp=20;
    this.plants=plants;this.leaves=Array.from({length:8},()=>({x:0,y:0,radius:0}));
    this.near={};this.updatePlants();
  }
  updatePlants() {
    for(let i=0;i<this.leaves.length;i++) {
      const p=this.plants[i],leaf=this.leaves[i];
      leaf.x=p?.x||0;leaf.y=p?.y||0;
      leaf.radius=p&&p.age>=0?36*lotusAppearance(p.age).leafScale:0;
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
    if(this.freeze<.02||!isOpenWater(x,y)||this.plantAt(x,y))return 0;
    const cornerX=Math.min(x,WORLD_WIDTH-x),cornerY=Math.min(y,WORLD_HEIGHT-y);
    const distance=cornerX/(300+this.freeze*300)+cornerY/(190+this.freeze*190);
    return clamp((.95-distance)/.24)*this.freeze;
  }
  surfaceAt(x,y) {
    if(this.plantAt(x,y)||isPad(x,y))return 'leaf';
    if(!isWater(x,y))return 'ground';
    return this.iceAt(x,y)>.3?'ice':'water';
  }
  get winter(){return this.freeze>.025||this.airTemp<6;}
  get winterAmount(){return Math.max(clamp((6-this.airTemp)/7),clamp(this.freeze*4));}
  snapshot(){return {freeze:this.freeze,snowCover:this.snowCover,waterTemp:this.waterTemp,winter:this.winter,winterAmount:this.winterAmount};}
}
