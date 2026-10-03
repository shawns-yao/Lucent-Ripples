import { Container, Graphics, Sprite, Texture, Rectangle } from 'pixi.js';
import { precipitationFrame, createPrecipitationFrame } from './precipitation.js';
import { lotusAppearance } from './lotus-growth.js';

function snowTextures() {
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;
  const c=canvas.getContext('2d');c.strokeStyle='#eef3f0';c.fillStyle='#f4f6ef';c.lineCap='round';
  for(let n=0;n<4;n++) {
    c.save();c.translate(n*64+32,32);c.lineWidth=n===0?2.2:3;
    if(n<2)for(let k=0;k<6;k++) {
      c.save();c.rotate(k*Math.PI/3);c.beginPath();c.moveTo(0,0);c.lineTo(0,-22+n*4);
      c.moveTo(-6,-11);c.lineTo(0,-16);c.lineTo(6,-11);c.stroke();c.restore();
    }
    else {
      c.beginPath();for(let k=0;k<9;k++){const a=k*Math.PI*2/9,r=9+(k*7+n*3)%10;k?c.lineTo(Math.cos(a)*r,Math.sin(a)*r):c.moveTo(Math.cos(a)*r,Math.sin(a)*r);}c.closePath();c.fill();
      c.globalAlpha=.35;c.fillRect(-17,-3,11,6);c.fillRect(3,8,8,5);
    }
    c.restore();
  }
  const atlas=Texture.from(canvas);
  return Array.from({length:4},(_,i)=>new Texture({source:atlas.source,frame:new Rectangle(i*64,0,64,64)}));
}
export class WeatherEffects {
  constructor(stage,climate){
    this.climate=climate;this.layer=new Container();this.rain=new Graphics();this.rings=new Graphics();this.snow=new Container();
    this.layer.addChild(this.rings,this.rain,this.snow);stage.addChild(this.layer);this.frame=createPrecipitationFrame();
    const textures=snowTextures();
    this.flakes=Array.from({length:180},(_,i)=>{const sprite=new Sprite(textures[i%4]);sprite.anchor.set(.5);sprite.visible=false;this.snow.addChild(sprite);return sprite;});
  }
  update(time,w,view,plants=[],quality=1){
    const rain=this.rain.clear(),rings=this.rings.clear();
    const {scaleX:sx,scaleY:sy,x:ox,y:oy}=view;
    precipitationFrame(time,w,plants,this.frame,this.climate,quality);
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
    for(let i=0;i<this.flakes.length;i++) {
      const sprite=this.flakes[i],p=this.frame.snow[i];sprite.visible=!!p;
      if(!p)continue;
      const melting=!p.airborne&&p.surface==='water',shrink=melting?Math.max(.15,1-p.impactAge/ .6):1;
      sprite.position.set(p.airX*sx+ox,p.airY*sy+oy);sprite.rotation=p.rotation;
      sprite.scale.set(p.size*4/64*sx*(.4+.6*Math.abs(p.roll))*shrink,p.size*4/64*sy*shrink);
      sprite.alpha=p.alpha*(melting?.5:1);
      if(melting)rings.ellipse(p.x*sx+ox,p.y*sy+oy,(1+p.impactAge*5)*sx,(1+p.impactAge*5)*sy).stroke({width:.45,color:0xcde2dc,alpha:(1-p.impactAge/.6)*.13});
    }
    return this.frame;
  }
}

export class LotusVisuals {
  constructor(world, atlas, growth){
    this.container=new Container();world.addChild(this.container);this.growth=growth;
    this.textureSets=new Map();this.setStyle(atlas);
    this.flowerSites=growth.plants.map(p=>({id:p.id,x:p.x+12,y:p.y,height:14,available:false}));
    this.plants=growth.plants.map(p=>{const group=new Container();group.position.set(p.x,p.y);this.container.addChild(group);const leaves=new Container();const flower=new Container();group.addChild(leaves,flower);const underlay=new Sprite(this.textures[0]);underlay.anchor.set(.5);leaves.addChild(underlay);const leafSprites=Array.from({length:3},(_,i)=>{const s=new Sprite(this.textures[i]);s.anchor.set(.5);leaves.addChild(s);return s;});const blooms=Array.from({length:3},(_,i)=>{const s=new Sprite(this.textures[3+i]);s.anchor.set(.5);flower.addChild(s);return s;});return{group,leaves,flower,underlay,leafSprites,blooms};});
  }
  setStyle(atlas){
    if(!this.textureSets.has(atlas)){
      const cellW=atlas.width/3,cellH=atlas.height/2;
      this.textureSets.set(atlas,Array.from({length:6},(_,i)=>new Texture({source:atlas.source,frame:new Rectangle(i%3*cellW,Math.floor(i/3)*cellH,cellW,cellH)})));
    }
    this.textures=this.textureSets.get(atlas);
    for(const plant of this.plants||[]){
      plant.leafSprites.forEach((sprite,i)=>sprite.texture=this.textures[i]);
      plant.underlay.texture=this.textures[0];
      plant.blooms.forEach((sprite,i)=>sprite.texture=this.textures[3+i]);
    }
  }
  update(time,weather){
    this.growth.plants.forEach((p,i)=>{const v=this.plants[i],{visible,leafScale:size,leafStage,bloomStage,bloomScale}=lotusAppearance(p.age);v.group.visible=visible;
      v.group.x=p.x+Math.sin(time*.6+p.phase)*weather.wind*.26;v.group.y=p.y+Math.cos(time*.5+p.phase)*weather.wind*.15;
      v.leaves.rotation=Math.sin(time*.48+p.phase)*(.012+weather.wind*.003);v.leaves.scale.set((82/this.textures[0].width)*size);
      v.underlay.texture=this.textures[Math.floor(leafStage)];
      v.leafSprites.forEach((s,n)=>{s.alpha=Math.max(0,1-Math.abs(leafStage-n));});
      v.flower.position.set(12,-14);v.flower.scale.set((49/this.textures[3].width)*bloomScale);v.flower.rotation=Math.sin(time*.7+p.phase)*weather.wind*.002;
      v.blooms.forEach((s,n)=>s.alpha=Math.max(0,1-Math.abs(bloomStage-n)));
      const site=this.flowerSites[i];site.x=v.group.x+12;site.y=v.group.y;site.available=visible&&bloomScale>.7&&bloomStage>.7;
    });
  }
}
