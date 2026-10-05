import { Container, Graphics, Sprite, Texture, Rectangle, Particle, ParticleContainer } from 'pixi.js';
import { precipitationFrame, createPrecipitationFrame, PRECIPITATION_PARTICLES, RAIN_PARTICLE_LIMIT, SNOW_PARTICLE_LIMIT } from './precipitation.js';
import { lotusAppearance } from './lotus-growth.js';
import { rng } from './simulation.js';
import { createFoliageFilter } from './tree-seasons.js';
import { COMPANION_PADS } from './pond-layout.js';

function snowTextures() {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=64;
  const c=canvas.getContext('2d');
  for(let n=0;n<8;n++) {
    c.save();c.translate(n*64+32,32);
    const random=rng(5913+n*717),soft=n>=4;
    c.fillStyle='#f4f8f8';c.shadowColor='rgba(239,248,250,.5)';c.shadowBlur=soft?3:1;
    // A loose aggregate of ice grains retains gaps and feathered edges at close range.
    for(let k=0;k<(soft?38:24);k++){
      const angle=random()*Math.PI*2,r=Math.pow(random(),.8)*(soft?19:13);
      const x=Math.cos(angle)*r,y=Math.sin(angle)*r*(.5+n%3*.15),width=2+random()*4,height=1+random()*3;
      c.save();c.translate(x,y);c.rotate(random()*Math.PI);c.globalAlpha=(.3+random()*.4)*(1-r/(soft?26:20));
      c.beginPath();c.moveTo(-width,0);c.quadraticCurveTo(-width*.4,-height,width*.5,-height*.6);c.quadraticCurveTo(width,height*.4,0,height);c.quadraticCurveTo(-width*.6,height*.5,-width,0);c.fill();c.restore();
    }
    c.restore();
  }
  const atlas=Texture.from(canvas);
  return Array.from({length:8},(_,i)=>new Texture({source:atlas.source,frame:new Rectangle(i*64,0,64,64)}));
}
function rainTexture(){
  const canvas=document.createElement('canvas');canvas.width=8;canvas.height=64;
  const c=canvas.getContext('2d'),gradient=c.createLinearGradient(0,0,0,64);
  gradient.addColorStop(0,'rgba(235,247,246,0)');gradient.addColorStop(.7,'rgba(235,247,246,.65)');gradient.addColorStop(1,'rgba(250,255,253,1)');
  c.fillStyle=gradient;c.fillRect(2,0,4,64);return Texture.from(canvas);
}
export class WeatherEffects {
  constructor(stage,climate){
    this.climate=climate;this.layer=new Container();this.rings=new Graphics();
    const rain=rainTexture(),textures=snowTextures();
    this.rain=new ParticleContainer({texture:rain,dynamicProperties:{position:true,vertex:true,rotation:true,color:true}});
    this.snow=new ParticleContainer({texture:textures[0],dynamicProperties:{position:true,vertex:true,rotation:true,color:true}});
    this.drops=Array.from({length:RAIN_PARTICLE_LIMIT},()=>new Particle({texture:rain,anchorX:.5,anchorY:1}));
    this.flakes=Array.from({length:SNOW_PARTICLE_LIMIT},(_,i)=>new Particle({texture:textures[i%4+(PRECIPITATION_PARTICLES[i].depth>.7?4:0)],anchorX:.5,anchorY:.5}));
    this.layer.addChild(this.rings,this.rain,this.snow);stage.addChild(this.layer);this.frame=createPrecipitationFrame();
  }
  update(time,w,view,plants=[],quality=1,season='default'){
    const rings=this.rings.clear(),rainChildren=this.rain.particleChildren,snowChildren=this.snow.particleChildren;
    const {scaleX:sx,scaleY:sy,x:ox,y:oy}=view;
    precipitationFrame(time,w,plants,this.frame,this.climate,quality,season);
    rainChildren.length=0;snowChildren.length=0;
    for(const p of this.frame.rain){
      const x=p.airX*sx+ox,y=p.airY*sy+oy;
      if(x<-32||x>view.width+32||y<-32||y>view.height+p.length*sy+32)continue;
      const drop=this.drops[p.id];drop.x=x;drop.y=y;drop.scaleX=p.width*sx/4;drop.scaleY=p.length*sy/64;drop.rotation=p.slant;drop.alpha=.45+w.rain*.2;
      rainChildren.push(drop);
    }
    this.rain.update();
    for(const p of this.frame.impacts){
      const x=p.x*sx+ox,y=p.y*sy+oy,age=p.impactAge,radius=1+age*25,fade=(1-age/1.05)*w.rain;
      rings.ellipse(x,y,radius*sx,radius*sy).stroke({color:0xe0f1e3,width:.75*sx,alpha:fade*.27});
      if(age>.14)rings.ellipse(x,y,(radius-3.5)*sx,(radius-3.5)*sy).stroke({color:0x214f48,width:.65*sx,alpha:fade*.18});
      if(age<.16){rings.circle(x,y,(1.5-age*5)*sx).fill({color:0xf0f5ea,alpha:(1-age/.16)*.45});for(let k=0;k<3;k++){const a=k*Math.PI*2/3+p.id;const d=age*30;rings.circle(x+Math.cos(a)*d*sx,y+Math.sin(a)*d*sy-age*(1-age/.16)*35*sy,.65*sx).fill({color:0xeaf1e3,alpha:fade*.3});}}
    }
    for(const p of this.frame.snow) {
      const x=p.airX*sx+ox,y=p.airY*sy+oy;if(x<-24||x>view.width+24||y<-24||y>view.height+24)continue;
      const sprite=this.flakes[p.id];
      const melting=!p.airborne&&p.surface==='water',shrink=melting?Math.max(.15,1-p.impactAge/ .6):1;
      sprite.x=x;sprite.y=y;sprite.rotation=p.rotation;
      sprite.scaleX=p.size*8/64*sx*(.4+.6*Math.abs(p.roll))*shrink;sprite.scaleY=p.size*8/64*sy*shrink;
      sprite.alpha=p.alpha*(melting?.5:1);
      snowChildren.push(sprite);
      if(melting)rings.ellipse(p.x*sx+ox,p.y*sy+oy,(1+p.impactAge*5)*sx,(1+p.impactAge*5)*sy).stroke({width:.45,color:0xcde2dc,alpha:(1-p.impactAge/.6)*.13});
    }
    this.snow.update();
    return this.frame;
  }
}

export class LotusVisuals {
  constructor(world, atlas, growth, shadowLayer){
    this.container=new Container();world.addChild(this.container);this.growth=growth;
    this.winterFilter=createFoliageFilter();
    this.winterFilter.resources.seasonUniforms.uniforms.uFoliage=[.89,.73,.49,1];
    this.textureSets=new Map();this.setStyle(atlas);
    this.shadows=new Container();shadowLayer.addChild(this.shadows);
    this.companionLayer=new Container();this.container.addChild(this.companionLayer);
    this.companions=COMPANION_PADS.map(([x,y,rx,ry],i)=>{
      const leaf=new Sprite(this.textures[2]),shadow=new Sprite(this.textures[2]);
      leaf.anchor.set(.5);leaf.position.set(x,y);leaf.width=rx*2.28;leaf.height=ry*2.28;leaf.rotation=i*1.7;
      shadow.anchor.set(.5);shadow.position.set(x+5,y+7);shadow.width=leaf.width*1.06;shadow.height=leaf.height*1.06;shadow.rotation=leaf.rotation;shadow.tint=0x18392e;shadow.alpha=.14;
      this.shadows.addChild(shadow);this.companionLayer.addChild(leaf);return {leaf,shadow};
    });
    this.flowerSites=growth.plants.map(p=>({id:p.id,x:p.x+12,y:p.y,height:14,available:false}));
    this.plants=growth.plants.map(p=>{
      const group=new Container();group.position.set(p.x,p.y);this.container.addChild(group);
      const leaves=new Container(),flower=new Container();group.addChild(leaves,flower);
      const underlay=new Sprite(this.textures[0]);underlay.anchor.set(.5);leaves.addChild(underlay);
      const leafSprites=Array.from({length:3},(_,i)=>{const s=new Sprite(this.textures[i]);s.anchor.set(.5);leaves.addChild(s);return s;});
      const blooms=Array.from({length:3},(_,i)=>{const s=new Sprite(this.textures[3+i]);s.anchor.set(.5);flower.addChild(s);return s;});
      const shadow=new Sprite(this.textures[0]),flowerShadow=new Sprite(this.textures[3]);
      for(const s of [shadow,flowerShadow]){s.anchor.set(.5);s.tint=0x18392e;this.shadows.addChild(s);}
      shadow.alpha=.13;flowerShadow.alpha=.12;
      return{group,leaves,flower,underlay,leafSprites,blooms,shadow,flowerShadow};
    });
  }
  setStyle(atlas){
    if(!this.textureSets.has(atlas)){
      const cellW=atlas.width/3,cellH=atlas.height/2;
      this.textureSets.set(atlas,Array.from({length:6},(_,i)=>new Texture({source:atlas.source,frame:new Rectangle(i%3*cellW,Math.floor(i/3)*cellH,cellW,cellH)})));
    }
    this.textures=this.textureSets.get(atlas);
    for(const [i,{leaf,shadow}] of (this.companions||[]).entries()){
      leaf.texture=this.textures[2];shadow.texture=this.textures[2];
      leaf.width=COMPANION_PADS[i][2]*2.28;leaf.height=COMPANION_PADS[i][3]*2.28;shadow.width=leaf.width*1.06;shadow.height=leaf.height*1.06;
    }
    for(const plant of this.plants||[]){
      plant.leafSprites.forEach((sprite,i)=>sprite.texture=this.textures[i]);
      plant.underlay.texture=this.textures[0];
      plant.blooms.forEach((sprite,i)=>sprite.texture=this.textures[3+i]);
    }
  }
  update(time,weather,season='summer'){
    const changed=this.season!==season;this.season=season;const dormant=season==='winter';
    if(changed)this.companionLayer.filters=dormant?[this.winterFilter]:null;
    this.companionLayer.visible=!dormant;
    for(const {shadow} of this.companions)shadow.visible=!dormant;
    const blossoms=[0,0];
    this.growth.plants.forEach((p,i)=>{const v=this.plants[i],{visible,leafScale:size,leafStage,bloomStage,bloomScale}=lotusAppearance(p.age);v.group.visible=visible&&!dormant;
      v.group.x=p.x+Math.sin(time*.6+p.phase)*weather.wind*.26;v.group.y=p.y+Math.cos(time*.5+p.phase)*weather.wind*.15;
      v.leaves.rotation=Math.sin(time*.48+p.phase)*(.012+weather.wind*.003);v.leaves.scale.set((82/this.textures[0].width)*size);
      if(changed)v.leaves.filters=dormant?[this.winterFilter]:null;
      v.flower.visible=!dormant&&blossoms[p.cluster]<2;
      if(visible&&bloomScale>0&&v.flower.visible)blossoms[p.cluster]++;
      v.underlay.texture=this.textures[Math.floor(leafStage)];
      v.leafSprites.forEach((s,n)=>{s.alpha=Math.max(0,1-Math.abs(leafStage-n));});
      v.flower.position.set(12,-14);v.flower.scale.set((49/this.textures[3].width)*bloomScale);v.flower.rotation=Math.sin(time*.7+p.phase)*weather.wind*.002;
      v.blooms.forEach((s,n)=>s.alpha=Math.max(0,1-Math.abs(bloomStage-n)));
      v.shadow.texture=this.textures[Math.round(leafStage)];v.shadow.visible=visible&&!dormant;v.shadow.position.set(v.group.x+5,v.group.y+7);v.shadow.scale.set(v.leaves.scale.x*1.04);v.shadow.rotation=v.leaves.rotation;
      v.flowerShadow.texture=this.textures[3+Math.round(bloomStage)];v.flowerShadow.visible=visible&&v.flower.visible;v.flowerShadow.position.set(v.group.x+18,v.group.y+5);v.flowerShadow.scale.set(v.flower.scale.x*1.08);
      const site=this.flowerSites[i];site.x=v.group.x+12;site.y=v.group.y;site.available=v.flower.visible&&visible&&bloomScale>.7&&bloomStage>.7;
    });
  }
  snapshot(){return {season:this.season,dormant:this.season==='winter',companions:this.companions.map(({leaf})=>({x:leaf.x,y:leaf.y,width:leaf.width,height:leaf.height,withered:Boolean(this.companionLayer.filters?.length)})),plants:this.plants.map((v,i)=>({id:this.growth.plants[i].id,visible:v.group.visible,flowerVisible:v.group.visible&&v.flower.visible&&v.flower.scale.x>0,withered:Boolean(v.leaves.filters?.length)}))};}
}
