import { Container, Graphics, Sprite, Texture, Rectangle } from 'pixi.js';
import { precipitationFrame } from './precipitation.js';
import { lotusAppearance } from './lotus-growth.js';

export class WeatherEffects {
  constructor(stage){this.layer=new Container();this.rain=new Graphics();this.rings=new Graphics();this.snow=new Graphics();this.layer.addChild(this.rings,this.rain,this.snow);stage.addChild(this.layer);this.frame={rain:[],impacts:[],snow:[],shaderImpacts:[]};}
  update(time,w,view,plants=[]){
    const rain=this.rain.clear(),rings=this.rings.clear(),snow=this.snow.clear();
    const {scaleX:sx,scaleY:sy,x:ox,y:oy}=view;
    this.frame=precipitationFrame(time,w,plants);
    for(const p of this.frame.rain){
      const x=p.airX*sx+ox,y=p.airY*sy+oy;
      rain.moveTo(x,y-p.length*sy).lineTo(x,y).stroke({width:(.45+p.size*.18)*sx,color:0xe8f1ea,alpha:.28+w.rain*.18});
      rain.circle(x,y,.55*sx).fill({color:0xf0f5e8,alpha:.25});
    }
    for(const p of this.frame.impacts){
      const x=p.x*sx+ox,y=p.y*sy+oy,age=p.impactAge,radius=1+age*25,fade=(1-age/1.05)*w.rain;
      rings.ellipse(x,y,radius*sx,radius*sy).stroke({color:0xe0f1e3,width:.75*sx,alpha:fade*.27});
      if(age>.14)rings.ellipse(x,y,(radius-3.5)*sx,(radius-3.5)*sy).stroke({color:0x214f48,width:.65*sx,alpha:fade*.18});
      if(age<.16){rings.circle(x,y,(1.5-age*5)*sx).fill({color:0xf0f5ea,alpha:(1-age/.16)*.45});for(let k=0;k<3;k++){const a=k*Math.PI*2/3+p.id;const d=age*30;rings.circle(x+Math.cos(a)*d*sx,y+Math.sin(a)*d*sy-age*(1-age/.16)*35*sy,.65*sx).fill({color:0xeaf1e3,alpha:fade*.3});}}
    }
    for(const p of this.frame.snow){const x=p.airX*sx+ox,y=p.airY*sy+oy;snow.circle(x,y,p.size*sx).fill({color:0xf4f6ed,alpha:p.alpha});}
    return this.frame;
  }
}

export class LotusVisuals {
  constructor(world, atlas, growth){
    this.container=new Container();world.addChild(this.container);this.growth=growth;
    const cellW=atlas.width/3,cellH=atlas.height/2;
    this.textures=Array.from({length:6},(_,i)=>new Texture({source:atlas.source,frame:new Rectangle(i%3*cellW,Math.floor(i/3)*cellH,cellW,cellH)}));
    this.plants=growth.plants.map(p=>{const group=new Container();group.position.set(p.x,p.y);this.container.addChild(group);const leaves=new Container();const flower=new Container();group.addChild(leaves,flower);const leafSprites=Array.from({length:3},(_,i)=>{const s=new Sprite(this.textures[i]);s.anchor.set(.5);leaves.addChild(s);return s;});const blooms=Array.from({length:3},(_,i)=>{const s=new Sprite(this.textures[3+i]);s.anchor.set(.5);flower.addChild(s);return s;});return{group,leaves,flower,leafSprites,blooms};});
  }
  update(time,weather){
    this.growth.plants.forEach((p,i)=>{const v=this.plants[i],{visible,leafScale:size,leafStage,bloomStage,bloomScale}=lotusAppearance(p.age);v.group.visible=visible;
      v.group.x=p.x+Math.sin(time*.6+p.phase)*weather.wind*.26;v.group.y=p.y+Math.cos(time*.5+p.phase)*weather.wind*.15;
      v.leaves.rotation=Math.sin(time*.48+p.phase)*(.012+weather.wind*.003);v.leaves.scale.set((82/this.textures[0].width)*size);
      v.leafSprites.forEach((s,n)=>{s.alpha=Math.max(0,1-Math.abs(leafStage-n));});
      v.flower.position.set(12,-14);v.flower.scale.set((49/this.textures[3].width)*bloomScale);v.flower.rotation=Math.sin(time*.7+p.phase)*weather.wind*.002;
      v.blooms.forEach((s,n)=>s.alpha=Math.max(0,1-Math.abs(bloomStage-n)));
    });
  }
}
