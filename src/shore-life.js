import { Container, Sprite, Texture, Rectangle, Graphics } from 'pixi.js';
import { rng, WORLD } from './simulation.js';
import { STATIC_PADS, SHORE } from './pond-surface.js';

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
  constructor(world, atlas, winterAtlas) {
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

    const sourceScaleX = atlas.width / 1254;
    const sourceScaleY = atlas.height / 1254;
    this.textures = FRAMES.map(([x, y, width, height]) => new Texture({
      source: atlas.source,
      frame: new Rectangle(x * sourceScaleX, y * sourceScaleY, width * sourceScaleX, height * sourceScaleY),
    }));
    const winterFrames=[[75,115,545,540],[707,128,517,531]];
    this.winterTextures=winterFrames.map(([x,y,width,height])=>new Texture({source:winterAtlas.source,frame:new Rectangle(x*winterAtlas.width/1254,y*winterAtlas.height/1254,width*winterAtlas.width/1254,height*winterAtlas.height/1254)}));
    this.trees = [
      this.makeTree(this.textures[0], 306, 282 / 506, 442 / 490),
      this.makeTree(this.textures[1], 250, 234 / 468, 429 / 460),
    ];
    for(let i=0;i<2;i++){const tree=this.trees[i],sprite=new Sprite(this.winterTextures[i]);sprite.anchor.copyFrom(tree.sprite.anchor);sprite.width=tree.width;sprite.scale.y=sprite.scale.x;sprite.alpha=0;tree.group.addChild(sprite);tree.winterSprite=sprite;}

    // A private generator means scenery never changes the fish simulation seed.
    const random = rng(84627);
    this.random=random;this.lastTime=0;
    this.bees = Array.from({ length: 7 }, (_, index) => {
      const sprite = this.makeInsect(this.textures[2]);
      return { sprite, index, phase: random() * TAU, delay: random() * 31,
        period: 20 + random() * 15, reach: 82 + random() * 140,
        drift: -.4 + random() * 1.25, size: 7.5 + random() * 2.2 };
    });
    this.butterflies = Array.from({ length: 5 }, (_, index) => {
      const sprite = this.makeButterfly(this.textures[3]);
      const starts=[[240,195],[1330,270],[220,700],[1270,700],[600,100]],start=starts[index];
      const shadow=new Graphics().ellipse(0,0,5,1.8).fill({color:0x263f32,alpha:.13});this.shadowLayer.addChild(shadow);
      return { sprite, shadow, index, phase: random() * TAU, speed: 48 + random() * 34,
        size: 18 + random() * 6, x:start[0],y:start[1],heading:random()*TAU,height:8,
        targetX:start[0]+120,targetY:start[1]+60,state:'flight',until:4+random()*6 };
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
    sprite.scale.set(width / texture.width);
    group.addChild(sprite);
    this.treeLayer.addChild(group);
    return { group, sprite, width };
  }

  makeInsect(texture) {
    const sprite = new Sprite(texture);
    sprite.anchor.set(.5);
    this.insectLayer.addChild(sprite);
    return sprite;
  }

  makeButterfly(texture) {
    const group=new Container(),f=texture.frame;
    const piece=(x,width)=>new Sprite(new Texture({source:texture.source,frame:new Rectangle(f.x+x,f.y,width,f.height)}));
    const left=piece(0,f.width*.44),right=piece(f.width*.56,f.width*.44),body=piece(f.width*.44,f.width*.12);
    left.anchor.set(1,.5);right.anchor.set(0,.5);body.anchor.set(.5);
    left.x=-f.width*.06;right.x=f.width*.06;group.addChild(left,right,body);group.wings=[left,right];
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

  flyButterfly(b,time,dt,width,height) {
    if(time>=b.until) {
      const perched=b.state==='rest';b.state=perched?'flight':'rest';b.until=time+(perched?5+this.random()*8:1.5+this.random()*3);
      if(perched) {
        const perch=this.random()<.45?STATIC_PADS[Math.floor(this.random()*STATIC_PADS.length)]:SHORE[Math.floor(this.random()*SHORE.length)];
        b.targetX=clamp(perch[0]+(this.random()-.5)*50,40,width-40);b.targetY=clamp(perch[1]+(this.random()-.5)*40,40,height-40);
      }
    }
    if(b.state==='flight') {
      const dx=b.targetX-b.x,dy=b.targetY-b.y,d=Math.hypot(dx,dy);
      const desired=Math.atan2(dy,dx)+Math.sin(time*2.4+b.phase)*.23;
      b.heading+=Math.atan2(Math.sin(desired-b.heading),Math.cos(desired-b.heading))*Math.min(1,dt*4.2);
      const speed=Math.min(d*2,b.speed*(.82+.18*Math.sin(time*1.1+b.phase)));
      b.x=clamp(b.x+Math.cos(b.heading)*speed*dt,25,width-25);b.y=clamp(b.y+Math.sin(b.heading)*speed*dt,25,height-25);
      if(d<12){b.state='rest';b.until=time+2+this.random()*3;}
    }
    b.height+=((b.state==='flight'?11+Math.sin(time*2+b.phase)*4:0)-b.height)*Math.min(1,dt*3);
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
    const cold=weather.temp<6||(this.winterAmount||0)>.1;
    const day = cold?0:clamp((light - .22) / .52) * calm;
    const night = cold?0:clamp((.43 - light) / .29) * clamp(1 - rain * 1.3 - snow * 1.5);
    this.activity.day = day;
    this.activity.night = night;
    const illumination = clamp((light - .08) / .92) * (1 - cloud * .14);
    const foliageTint = mixColor(mixColor(0x40556b, 0xfff7e4, illumination),0xd3ded9,clamp(this.snowCover||0)*.65);
    const insectTint = mixColor(0x8196ac, 0xfffbe9, illumination);

    const left = this.trees[0];
    const right = this.trees[1];
    // Keep the bank canopy and hive at the visible shore when cover scaling crops
    // a narrow screen; do not let the hive disappear outside the camera.
    const view = this.viewport || { left: 0, right: width, top: 0, bottom: height };
    left.group.position.set(Math.max(width * .052, view.left - 10), Math.max(height * .225, view.top + 90));
    right.group.position.set(Math.min(width * .941, view.right + 10), Math.max(height * .256, view.top + 90));
    for (let i = 0; i < this.trees.length; i++) {
      const tree = this.trees[i];
      const sway = Math.sin(time * .51 + i * 2.1) * .66 + Math.sin(time * .97 + i) * .34;
      tree.group.rotation = sway * (.003 + wind * .0012);
      tree.group.skew.x = Math.sin(time * .39 + i) * wind * .0007;
      tree.sprite.scale.y = tree.sprite.scale.x * (1 + Math.sin(time * .64 + i * 1.7) * .0025);
      tree.sprite.tint = foliageTint;
      const winter=clamp(this.winterAmount||0);tree.sprite.alpha=1-winter;tree.winterSprite.alpha=winter;
      tree.winterSprite.visible=winter>.001;tree.sprite.visible=winter<.999;
      const base=tree.width/tree.winterSprite.texture.width;
      tree.winterSprite.scale.set(base,base*(1+Math.sin(time*.64+i*1.7)*.0025));
      tree.winterSprite.tint=mixColor(0x5d7383,0xe9f0e9,illumination);
    }

    // The left frame's hive is at about (460,551) in the original atlas.
    // Rotate its offset with the trunk pivot so departures follow the swaying hive.
    const offsetX = (366 - 282) * left.sprite.scale.x;
    const offsetY = (414 - 442) * left.sprite.scale.y;
    const c = Math.cos(left.group.rotation), s = Math.sin(left.group.rotation);
    this.hive.x = left.group.x + offsetX * c - offsetY * s;
    this.hive.y = left.group.y + offsetX * s + offsetY * c;

    const shadowAlpha = (.035 + light * .055) * (1 - snow * .5);
    for(let i=0;i<2;i++){this.treeShadows[i].position.copyFrom(this.trees[i].group.position);this.treeShadows[i].alpha=shadowAlpha;}

    for (const bee of this.bees) {
      const point = this.beePoint(bee, time, this.hive.x, this.hive.y);
      const next = this.beePoint(bee, time + .04, this.hive.x, this.hive.y);
      const sprite = bee.sprite;
      sprite.position.set(clamp(point.x, 8, width - 8), clamp(point.y, 8, height - 8));
      sprite.rotation = Math.atan2(next.y - point.y, next.x - point.x) + Math.PI / 2;
      const base = bee.size / sprite.texture.width;
      sprite.scale.set(base * (.76 + Math.abs(Math.sin(time * 66 + bee.phase)) * .24), base);
      sprite.alpha = day * point.alpha * .91;
      sprite.tint = insectTint;
      sprite.visible = sprite.alpha > .005;
    }

    for (const butterfly of this.butterflies) {
      if(day>.005)this.flyButterfly(butterfly,time,dt,width,height);
      const sprite = butterfly.sprite;
      sprite.position.set(butterfly.x,butterfly.y-butterfly.height);
      sprite.rotation=butterfly.heading+Math.PI/2;
      const base=butterfly.size/this.textures[3].width;sprite.scale.set(base);
      const wing=butterfly.state==='flight'?.18+Math.abs(Math.sin(time*(11+butterfly.index*.6)+butterfly.phase))*.82:.5+Math.sin(time*1.4+butterfly.phase)*.08;
      for(const part of sprite.wings)part.scale.x=wing;
      sprite.alpha = day * .85;
      sprite.tint = insectTint;
      sprite.visible = sprite.alpha > .005;
      butterfly.shadow.position.set(butterfly.x+3,butterfly.y+2);butterfly.shadow.alpha=day*.6;butterfly.shadow.visible=sprite.visible;
    }

    const glow = this.fireflyLayer;
    glow.visible = night > .005;
    if (glow.visible) {
      for (const fly of this.fireflies) {
        const side = fly.index % 3;
        const x = (side === 0 ? .07 + fly.x * .18 : side === 1 ? .80 + fly.x * .16 : .18 + fly.x * .62) * width
          + Math.sin(time * fly.speed + fly.phase) * 19;
        const y = (side === 2 ? .82 + fly.y * .11 : .17 + fly.y * .61) * height
          + Math.cos(time * fly.speed * .7 + fly.phase) * 12;
        const pulse = .05 + .95 * Math.pow(.5 + .5 * Math.sin(time * 1.45 + fly.phase), 5);
        const alpha = pulse * night;
        // Glows stay luminous while the foliage receives its cooler night tint.
        fly.sprite.position.set(x,y);fly.sprite.alpha=alpha;
      }
    }
    return this.activity;
  }

  snapshot(){return {beesVisible:this.bees.filter(b=>b.sprite.visible).length,butterfliesVisible:this.butterflies.filter(b=>b.sprite.visible).length,firefliesVisible:this.fireflyLayer.visible?this.fireflies.filter(f=>f.sprite.alpha>.01).length:0,winterTrees:this.trees.map(t=>t.winterSprite.alpha),winterAmount:this.winterAmount||0};}

  canopyAt(x,y,clearance=18) {
    for(const tree of this.trees) {
      const dx=x-tree.group.x,dy=y-tree.group.y,c=Math.cos(tree.group.rotation),s=Math.sin(tree.group.rotation);
      const localX=dx*c+dy*s,localY=-dx*s+dy*c;
      const width=tree.width,height=tree.width*tree.sprite.texture.height/tree.sprite.texture.width;
      const cx=(.5-tree.sprite.anchor.x)*width,cy=(.5-tree.sprite.anchor.y)*height;
      if(((localX-cx)/(width*.48+clearance))**2+((localY-cy)/(height*.44+clearance))**2<1)return true;
    }
    return false;
  }

  destroy() {
    this.container.destroy({ children: true });
    // Frames share the caller-owned atlas source; never destroy that source.
    for (const texture of this.textures) texture.destroy(false);
    for (const texture of this.winterTextures) texture.destroy(false);
  }
}
