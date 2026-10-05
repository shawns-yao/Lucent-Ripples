import { Container, Sprite, Texture, Rectangle, Graphics } from 'pixi.js';
import { rng, WORLD } from './simulation.js';
import { STATIC_PADS, SHORE } from './pond-surface.js';
import { createFoliageFilter, setFoliageSeason } from './tree-seasons.js';

const TAU = Math.PI * 2;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const fract = value => value - Math.floor(value);
const mixColor = (dark, bright, amount) => {
  let color = 0;
  for (const shift of [16, 8, 0]) {
    const a = (dark >> shift) & 255;
    const b = (bright >> shift) & 255;
    color |= Math.round(a + (b - a) * amount) << shift;
  }
  return color;
};

// Visible bounds in the 1254px source atlas, with a small antialiasing margin.
// Texture frames trim empty gutters without modifying the generated asset.
const FRAMES = [
  [94, 137, 506, 490],
  [724, 163, 468, 460],
  [125, 789, 431, 342],
  [735, 801, 426, 325],
];

/** Quiet, deterministic shore animation. All coordinates are world-space.
 * Construct after water and fish: new ShoreLife(world, shoreAtlas).
 * Call update(sim.time, weather) once per frame; time is in seconds.
 * Add to an above-water container: this module owns its day/night color grade.
 */
export class ShoreLife {
  constructor(world, atlas, winterAtlas, layout = {}) {
    if (!world?.addChild || !atlas?.source) {
      throw new TypeError('ShoreLife requires a Pixi container and an atlas texture');
    }

    this.container = new Container();
    this.container.label = 'shore-life';
    this.container.eventMode = 'none';
    this.shadowLayer = new Container();
    this.treeShadows=[new Graphics().ellipse(25,-13,104,31).fill(0x253d27),new Graphics().ellipse(14,-12,80,25).fill(0x253d27)];
    this.shadowLayer.addChild(...this.treeShadows);
    this.treeLayer = new Container();
    this.insectLayer = new Container();
    this.fireflyLayer = new Container();
    this.fireflyLayer.blendMode = 'add';
    this.container.addChild(this.shadowLayer, this.treeLayer, this.insectLayer, this.fireflyLayer);
    world.addChild(this.container);

    this.textureSets = new Map();
    const set = this.textureSet(atlas, winterAtlas, layout);
    this.textures = set.textures; this.winterTextures = set.winterTextures;
    this.butterflyTextures = set.butterflyTextures; this.layout = set.layout;
    this.trees = [
      this.makeTree(this.textures[0], 306, 282 / 506, 442 / 490),
      this.makeTree(this.textures[1], 250, 234 / 468, 429 / 460),
    ];
    for(let i=0;i<2;i++){const tree=this.trees[i],sprite=new Sprite(this.winterTextures[i]);sprite.anchor.copyFrom(tree.sprite.anchor);sprite.width=tree.width;sprite.height=tree.height;sprite.alpha=0;tree.group.addChild(sprite);tree.winterSprite=sprite;}
    this.setStyle(atlas,winterAtlas,layout);
    this.foliageFilter=createFoliageFilter();this.season='summer';
    for(const tree of this.trees)tree.sprite.filters=[this.foliageFilter];

    // A private generator means scenery never changes the fish simulation seed.
    const random = rng(84627);
    this.random=random;this.lastTime=0;
    this.bees = Array.from({ length: 7 }, (_, index) => {
      const sprite = this.makeInsect(this.textures[2]);
      const shadow=new Graphics().ellipse(0,0,2.8,1).fill({color:0x263f32,alpha:.15});this.shadowLayer.addChild(shadow);
      return { sprite, shadow, index, phase: random() * TAU, delay: random() * 31,
        period: 20 + random() * 15, reach: 82 + random() * 140,
        drift: -.4 + random() * 1.25, size: 7.5 + random() * 2.2 };
    });
    this.butterflies = Array.from({ length: 5 }, (_, index) => {
      const sprite = this.makeButterfly(this.textures[3]);
      const starts=[[240,195],[1330,270],[220,700],[1270,700],[600,100]],start=starts[index];
      const shadow=new Graphics().ellipse(0,0,5,1.8).fill({color:0x263f32,alpha:.13});this.shadowLayer.addChild(shadow);
      return { sprite, shadow, index, phase: random() * TAU, speed: 100 + random() * 45,
        size: 18 + random() * 6, x:start[0],y:start[1],heading:random()*TAU,height:32,
        cruiseHeight:38+random()*22,landingHeight:0,flowerId:null,perchKind:null,
        targetX:start[0]+120,targetY:start[1]+60,state:'flight',until:2+index*.8 };
    });
    this.fireflies = Array.from({ length: 18 }, (_, index) => ({
      index, phase: random() * TAU, speed: .23 + random() * .26,
      x: random(), y: random(), radius: .65 + random() * .65,
    }));
    const glowCanvas=document.createElement('canvas');glowCanvas.width=32;glowCanvas.height=32;
    const glowContext=glowCanvas.getContext('2d'),gradient=glowContext.createRadialGradient(16,16,0,16,16,16);
    gradient.addColorStop(0,'rgba(245,255,188,1)');gradient.addColorStop(.13,'rgba(218,255,141,.8)');gradient.addColorStop(.45,'rgba(179,238,110,.15)');gradient.addColorStop(1,'rgba(179,238,110,0)');
    glowContext.fillStyle=gradient;glowContext.fillRect(0,0,32,32);const glowTexture=Texture.from(glowCanvas);
    for(const fly of this.fireflies){fly.sprite=new Sprite(glowTexture);fly.sprite.anchor.set(.5);fly.sprite.width=fly.sprite.height=14;this.fireflyLayer.addChild(fly.sprite);}
    this.hive = { x: 0, y: 0 };
    this.activity = { day: 1, night: 0 };
    this.update(0, { light: 1, wind: 1.3, rain: 0, snow: 0 });
  }

  makeTree(texture, width, anchorX, anchorY) {
    const group = new Container();
    const sprite = new Sprite(texture);
    sprite.anchor.set(anchorX, anchorY);
    const height=width*(width===306?490/506:460/468);
    sprite.width=width;sprite.height=height;
    group.addChild(sprite);
    this.treeLayer.addChild(group);
    return { group, sprite, width, height };
  }

  textureSet(atlas, winterAtlas, layout) {
    if(this.textureSets.has(atlas))return this.textureSets.get(atlas);
    const frames=(source,rects)=>rects.map(([x,y,w,h])=>new Texture({source:source.source,frame:new Rectangle(x*source.width/1254,y*source.height/1254,w*source.width/1254,h*source.height/1254)}));
    const textures=frames(atlas,layout.frames||FRAMES);
    const winterTextures=frames(winterAtlas,layout.winterFrames||[[75,115,545,540],[707,128,517,531]]);
    const f=textures[3].frame;
    const piece=(x,width)=>new Texture({source:atlas.source,frame:new Rectangle(f.x+x,f.y,width,f.height)});
    const butterflyTextures=[piece(0,f.width*.44),piece(f.width*.56,f.width*.44),piece(f.width*.44,f.width*.12)];
    const set={textures,winterTextures,butterflyTextures,layout:{...layout,sourceScaleX:atlas.width/1254,sourceScaleY:atlas.height/1254}};
    this.textureSets.set(atlas,set);return set;
  }

  setStyle(atlas,winterAtlas,layout={}) {
    const set=this.textureSet(atlas,winterAtlas,layout);
    this.textures=set.textures;this.winterTextures=set.winterTextures;this.butterflyTextures=set.butterflyTextures;this.layout=set.layout;
    const anchors=layout.anchors||[[282/506,442/490],[234/468,429/460]];
    for(let i=0;i<2;i++){
      const tree=this.trees[i];tree.sprite.texture=this.textures[i];tree.winterSprite.texture=this.winterTextures[i];
      tree.sprite.anchor.set(...anchors[i]);tree.winterSprite.anchor.copyFrom(tree.sprite.anchor);
      tree.sprite.width=tree.winterSprite.width=tree.width;tree.sprite.height=tree.winterSprite.height=tree.height;
    }
    for(const bee of this.bees||[])bee.sprite.texture=this.textures[2];
    for(const b of this.butterflies||[]){
      const [left,right]=b.sprite.wings;left.texture=this.butterflyTextures[0];right.texture=this.butterflyTextures[1];b.sprite.body.texture=this.butterflyTextures[2];
      left.x=-this.textures[3].width*.06;right.x=this.textures[3].width*.06;
    }
  }

  makeInsect(texture) {
    const sprite = new Sprite(texture);
    sprite.anchor.set(.5);
    this.insectLayer.addChild(sprite);
    return sprite;
  }

  makeButterfly(texture) {
    const group=new Container(),f=texture.frame;
    const [left,right,body]=this.butterflyTextures.map(part=>new Sprite(part));
    left.anchor.set(1,.5);right.anchor.set(0,.5);body.anchor.set(.5);
    left.x=-f.width*.06;right.x=f.width*.06;group.addChild(left,right,body);group.wings=[left,right];group.body=body;
    this.insectLayer.addChild(group);return group;
  }

  beePoint(bee, time, hiveX, hiveY) {
    const cycle = fract((time + bee.delay) / bee.period);
    // Each bee spends a short time inside the hive, then flies out and back.
    const flight = clamp(cycle / .86);
    const excursion = Math.pow(Math.max(0, Math.sin(flight * Math.PI)), .85);
    const along = bee.reach * excursion;
    const weave = Math.sin(flight * TAU * 2 + bee.phase) * 19 * excursion;
    return {
      x: hiveX + along * .87 + weave,
      y: hiveY + along * bee.drift + Math.sin(flight * TAU + bee.phase) * 29 * excursion,
      alpha: cycle < .86 ? clamp(excursion * 5) : 0,
    };
  }

  butterflyPerch(b) {
    const flowers=(this.flowerSites||[]).filter(p=>p.available&&!this.canopyAt(p.x,p.y)&&
      !this.butterflies.some(other=>other!==b&&other.flowerId===p.id));
    flowers.sort((a,c)=>Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(c.x-b.x,c.y-b.y));
    if(flowers.length){const p=flowers[0];b.flowerId=p.id;b.perchKind='flower';b.landingHeight=p.height;b.targetX=p.x;b.targetY=p.y;return;}
    const pads=STATIC_PADS.filter(([x,y])=>!this.canopyAt(x,y)&&
      !this.butterflies.some(other=>other!==b&&other.perchKind==='leaf'&&Math.hypot(other.targetX-x,other.targetY-y)<40));
    const perch=pads.length?pads[Math.floor(this.random()*pads.length)]:SHORE[10];
    b.flowerId=null;b.perchKind=pads.length?'leaf':'shore';b.landingHeight=0;b.targetX=perch[0];b.targetY=perch[1];
  }

  takeoffButterfly(b,time,width,height) {
    b.flowerId=null;b.perchKind=null;b.state='takeoff';b.until=time+.65;
    const direction=b.heading+(this.random()-.5)*1.4,distance=75+this.random()*80;
    b.targetX=clamp(b.x+Math.cos(direction)*distance,45,width-45);
    b.targetY=clamp(b.y+Math.sin(direction)*distance,45,height-45);
  }

  flyButterfly(b,time,dt,width,height) {
    if(b.flowerId!==null) {
      const site=this.flowerSites?.find(p=>p.id===b.flowerId&&p.available);
      if(site){b.targetX=site.x;b.targetY=site.y;b.landingHeight=site.height;}
      else this.takeoffButterfly(b,time,width,height);
    }
    if(b.state==='rest') {
      b.x=b.targetX;b.y=b.targetY;b.height=b.landingHeight;
      if(time>=b.until)this.takeoffButterfly(b,time,width,height);
      else return;
    }
    if(b.state==='takeoff'&&time>=b.until){b.state='flight';b.until=time+2.5+this.random()*3.5;}
    if(b.state==='flight'&&(time>=b.until||Math.hypot(b.targetX-b.x,b.targetY-b.y)<24)) {
      this.butterflyPerch(b);b.state='approach';
    }
    const dx=b.targetX-b.x,dy=b.targetY-b.y,d=Math.hypot(dx,dy);
    const approaching=b.state==='approach';
    const desired=Math.atan2(dy,dx)+(approaching?0:Math.sin(time*3.1+b.phase)*.28);
    b.heading+=Math.atan2(Math.sin(desired-b.heading),Math.cos(desired-b.heading))*Math.min(1,dt*(approaching?7:4.8));
    const speed=Math.min(d*(approaching?3:2),b.speed*(b.state==='takeoff'?.45:.9+.22*Math.sin(time*2.2+b.phase)));
    b.x=clamp(b.x+Math.cos(b.heading)*speed*dt,25,width-25);
    b.y=clamp(b.y+Math.sin(b.heading)*speed*dt,25,height-25);
    const cruise=b.cruiseHeight+Math.sin(time*3+b.phase)*9+Math.sin(time*1.1+b.phase)*5;
    const targetHeight=approaching?b.landingHeight+clamp(d/150)*(b.cruiseHeight-b.landingHeight):cruise;
    b.height+=(targetHeight-b.height)*Math.min(1,dt*(approaching?5:4));
    if(approaching&&d<3&&Math.abs(b.height-b.landingHeight)<1.8) {
      b.x=b.targetX;b.y=b.targetY;b.height=b.landingHeight;b.state='rest';b.until=time+3+this.random()*4;
      b.landingCount=(b.landingCount||0)+1;if(b.perchKind==='flower')b.flowerVisits=(b.flowerVisits||0)+1;
    }
  }

  update(time, weather = {}, width = WORLD.width, height = WORLD.height) {
    time = finite(time, 0);
    const dt=clamp(time-this.lastTime,0,.1);this.lastTime=time;
    width = Math.max(1, finite(width, WORLD.width));
    height = Math.max(1, finite(height, WORLD.height));
    const light = clamp(finite(weather.light, 1));
    const wind = clamp(finite(weather.wind, 1.3), 0, 30);
    const rain = clamp(finite(weather.rain, 0));
    const snow = clamp(finite(weather.snow, 0));
    const cloud = clamp(finite(weather.cloud, 0));
    const calm = clamp(1 - rain * 1.35 - snow * 1.6) * clamp(1 - (wind - 5) / 12);
    const cold=this.season==='winter'||weather.temp<6||(this.winterAmount||0)>.1;
    const day = cold?0:clamp((light - .22) / .52) * calm;
    const night = cold?0:clamp((.43 - light) / .29) * clamp(1 - rain * 1.3 - snow * 1.5);
    this.activity.day = day;
    this.activity.night = night;
    const illumination = clamp((light - .08) / .92) * (1 - cloud * .14);
    const foliageTint = mixColor(mixColor(0x40556b, 0xfff7e4, illumination),0xd3ded9,clamp(this.snowCover||0)*.65);
    const insectTint = mixColor(0x8196ac, 0xfffbe9, illumination);
    if(this.appliedSeason!==this.season){setFoliageSeason(this.foliageFilter,this.season);this.appliedSeason=this.season;}

    const left = this.trees[0];
    const right = this.trees[1];
    // Bank trees stay at their world positions as the viewport pans.
    const view = this.viewport || { left: 0, right: width, top: 0, bottom: height };
    left.group.position.set(Math.max(width * .052, view.left - 10), Math.max(height * .225, view.top + 90));
    right.group.position.set(Math.min(width * .941, view.right + 10), Math.max(height * .256, view.top + 90));
    for (let i = 0; i < this.trees.length; i++) {
      const tree = this.trees[i];
      const sway = Math.sin(time * .51 + i * 2.1) * .66 + Math.sin(time * .97 + i) * .34;
      tree.group.rotation = sway * (.003 + wind * .0012);
      tree.group.skew.x = Math.sin(time * .39 + i) * wind * .0007;
      tree.sprite.scale.y = tree.height/tree.sprite.texture.height * (1 + Math.sin(time * .64 + i * 1.7) * .0025);
      tree.sprite.tint = foliageTint;
      const winter=this.season==='winter'?1:clamp(this.winterAmount||0);tree.sprite.alpha=1-winter;tree.winterSprite.alpha=winter;
      tree.winterSprite.visible=winter>.001;tree.sprite.visible=winter<.999;
      const base=tree.width/tree.winterSprite.texture.width;
      tree.winterSprite.scale.set(base,tree.height/tree.winterSprite.texture.height*(1+Math.sin(time*.64+i*1.7)*.0025));
      tree.winterSprite.tint=mixColor(0x5d7383,0xe9f0e9,illumination);
    }

    // Departures follow the atlas-specific hive, rotated around the trunk pivot.
    const frame=left.sprite.texture.frame,[hiveX,hiveY]=this.layout.hive||[460,551];
    const offsetX = (hiveX*this.layout.sourceScaleX-frame.x-frame.width*left.sprite.anchor.x)*left.sprite.scale.x;
    const offsetY = (hiveY*this.layout.sourceScaleY-frame.y-frame.height*left.sprite.anchor.y)*left.sprite.scale.y;
    const c = Math.cos(left.group.rotation), s = Math.sin(left.group.rotation);
    this.hive.x = left.group.x + offsetX * c - offsetY * s;
    this.hive.y = left.group.y + offsetX * s + offsetY * c;

    const shadowAlpha = (.035 + light * .055) * (1 - snow * .5);
    for(let i=0;i<2;i++){this.treeShadows[i].position.copyFrom(this.trees[i].group.position);this.treeShadows[i].alpha=shadowAlpha;}

    for (const bee of this.bees) {
      const point = this.beePoint(bee, time, this.hive.x, this.hive.y);
      const next = this.beePoint(bee, time + .04, this.hive.x, this.hive.y);
      const sprite = bee.sprite;
      const flightHeight=(20+Math.sin(time*6+bee.phase)*6+Math.sin(time*2+bee.phase)*5)*point.alpha;
      sprite.position.set(clamp(point.x, 8, width - 8), clamp(point.y-flightHeight, 8, height - 8));
      sprite.rotation = Math.atan2(next.y - point.y, next.x - point.x) + Math.PI / 2;
      const base = bee.size / sprite.texture.width;
      sprite.scale.set(base * (.76 + Math.abs(Math.sin(time * 66 + bee.phase)) * .24), base);
      sprite.alpha = day * point.alpha * .91;
      sprite.tint = insectTint;
      sprite.visible = sprite.alpha > .005;
      bee.shadow.position.set(point.x+flightHeight*.24,point.y+flightHeight*.15);bee.shadow.scale.set(1+flightHeight*.015);
      bee.shadow.alpha=day*point.alpha*.4/(1+flightHeight*.035);bee.shadow.visible=sprite.visible;
    }

    for (const butterfly of this.butterflies) {
      if(day>.005)this.flyButterfly(butterfly,time,dt,width,height);
      const sprite = butterfly.sprite;
      sprite.position.set(butterfly.x,butterfly.y-butterfly.height);
      sprite.rotation=butterfly.heading+Math.PI/2;
      const base=butterfly.size/this.textures[3].width;sprite.scale.set(base*(1+butterfly.height*.0015));
      const resting=butterfly.state==='rest',beat=Math.sin(time*(18+butterfly.index*.8)+butterfly.phase);
      const wing=resting?.6+Math.sin(time*1.4+butterfly.phase)*.12:.14+Math.abs(beat)*.86;
      sprite.skew.y=resting?0:Math.sin(time*3.1+butterfly.phase)*.1;
      for(let i=0;i<2;i++){const part=sprite.wings[i];part.scale.x=wing;part.rotation=resting?0:beat*(i?-.1:.1);}
      sprite.alpha = day * .85;
      sprite.tint = insectTint;
      sprite.visible = sprite.alpha > .005;
      const onFlower=resting&&butterfly.perchKind==='flower';
      butterfly.shadow.position.set(butterfly.x+butterfly.height*.24,butterfly.y+(onFlower?-butterfly.height+2:butterfly.height*.16));
      butterfly.shadow.scale.set(1+butterfly.height*.014,1+butterfly.height*.02);
      butterfly.shadow.alpha=day*(onFlower?.35:.8)/(1+butterfly.height*.035);butterfly.shadow.visible=sprite.visible;
    }

    const glow = this.fireflyLayer;
    glow.visible = night > .005;
    if (glow.visible) {
      for (const fly of this.fireflies) {
        const side = fly.index % 3;
        const x = (side === 0 ? .07 + fly.x * .18 : side === 1 ? .80 + fly.x * .16 : .18 + fly.x * .62) * width
          + Math.sin(time * fly.speed + fly.phase) * 19;
        const y = (side === 2 ? .82 + fly.y * .11 : .17 + fly.y * .61) * height
          + Math.cos(time * fly.speed * .7 + fly.phase) * 12-(18+Math.sin(time*1.7+fly.phase)*8);
        const pulse = .05 + .95 * Math.pow(.5 + .5 * Math.sin(time * 1.45 + fly.phase), 5);
        const alpha = pulse * night;
        // Glows stay luminous while the foliage receives its cooler night tint.
        fly.sprite.position.set(x,y);fly.sprite.alpha=alpha;
      }
    }
    return this.activity;
  }

  snapshot(){return {season:this.season,beesVisible:this.bees.filter(b=>b.sprite.visible).length,butterfliesVisible:this.butterflies.filter(b=>b.sprite.visible).length,firefliesVisible:this.fireflyLayer.visible?this.fireflies.filter(f=>f.sprite.alpha>.01).length:0,winterTrees:this.trees.map(t=>t.winterSprite.alpha),winterAmount:this.winterAmount||0};}

  canopyAt(x,y,clearance=18) {
    for(const tree of this.trees) {
      const dx=x-tree.group.x,dy=y-tree.group.y,c=Math.cos(tree.group.rotation),s=Math.sin(tree.group.rotation);
      const localX=dx*c+dy*s,localY=-dx*s+dy*c;
      const width=tree.width,height=tree.height;
      const cx=(.5-tree.sprite.anchor.x)*width,cy=(.5-tree.sprite.anchor.y)*height;
      if(((localX-cx)/(width*.48+clearance))**2+((localY-cy)/(height*.44+clearance))**2<1)return true;
    }
    return false;
  }

  destroy() {
    this.container.destroy({ children: true });
    this.foliageFilter.destroy();
    // Frames share the caller-owned atlas source; never destroy that source.
    for(const set of this.textureSets.values())for(const texture of [...set.textures,...set.winterTextures,...set.butterflyTextures])texture.destroy(false);
  }
}
