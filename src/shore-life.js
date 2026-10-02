import { Container, Sprite, Texture, Rectangle, Graphics } from 'pixi.js';
import { rng, WORLD } from './simulation.js';

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
  constructor(world, atlas) {
    if (!world?.addChild || !atlas?.source) {
      throw new TypeError('ShoreLife requires a Pixi container and an atlas texture');
    }

    this.container = new Container();
    this.container.label = 'shore-life';
    this.container.eventMode = 'none';
    this.shadowLayer = new Graphics();
    this.treeLayer = new Container();
    this.insectLayer = new Container();
    this.fireflyLayer = new Graphics();
    this.fireflyLayer.blendMode = 'add';
    this.container.addChild(this.shadowLayer, this.treeLayer, this.insectLayer, this.fireflyLayer);
    world.addChild(this.container);

    const sourceScaleX = atlas.width / 1254;
    const sourceScaleY = atlas.height / 1254;
    this.textures = FRAMES.map(([x, y, width, height]) => new Texture({
      source: atlas.source,
      frame: new Rectangle(x * sourceScaleX, y * sourceScaleY, width * sourceScaleX, height * sourceScaleY),
    }));
    this.trees = [
      this.makeTree(this.textures[0], 306, 282 / 506, 442 / 490),
      this.makeTree(this.textures[1], 250, 234 / 468, 429 / 460),
    ];

    // A private generator means scenery never changes the fish simulation seed.
    const random = rng(84627);
    this.bees = Array.from({ length: 7 }, (_, index) => {
      const sprite = this.makeInsect(this.textures[2]);
      return { sprite, index, phase: random() * TAU, delay: random() * 31,
        period: 20 + random() * 15, reach: 82 + random() * 140,
        drift: -.4 + random() * 1.25, size: 7.5 + random() * 2.2 };
    });
    this.butterflies = Array.from({ length: 5 }, (_, index) => {
      const sprite = this.makeInsect(this.textures[3]);
      return { sprite, index, phase: random() * TAU, speed: .13 + random() * .12,
        reach: 34 + random() * 46, size: 15 + random() * 6 };
    });
    this.fireflies = Array.from({ length: 18 }, (_, index) => ({
      index, phase: random() * TAU, speed: .23 + random() * .26,
      x: random(), y: random(), radius: .65 + random() * .65,
    }));
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

  butterflyPoint(butterfly, time, width, height) {
    const centers = [[.18, .29], [.83, .27], [.1, .76], [.79, .78], [.61, .13]];
    const center = centers[butterfly.index];
    const phase = time * butterfly.speed + butterfly.phase;
    return {
      x: center[0] * width + Math.sin(phase) * butterfly.reach
        + Math.sin(phase * 2.31 + .7) * 13,
      y: center[1] * height + Math.cos(phase * .83) * butterfly.reach * .62
        + Math.sin(phase * 1.81) * 12,
    };
  }

  update(time, weather = {}, width = WORLD.width, height = WORLD.height) {
    time = finite(time, 0);
    width = Math.max(1, finite(width, WORLD.width));
    height = Math.max(1, finite(height, WORLD.height));
    const light = clamp(finite(weather.light, 1));
    const wind = clamp(finite(weather.wind, 1.3), 0, 30);
    const rain = clamp(finite(weather.rain, 0));
    const snow = clamp(finite(weather.snow, 0));
    const cloud = clamp(finite(weather.cloud, 0));
    const calm = clamp(1 - rain * 1.35 - snow * 1.6) * clamp(1 - (wind - 5) / 12);
    const day = clamp((light - .22) / .52) * calm;
    const night = clamp((.43 - light) / .29) * clamp(1 - rain * 1.3 - snow * 1.5);
    this.activity.day = day;
    this.activity.night = night;
    const illumination = clamp((light - .08) / .92) * (1 - cloud * .14);
    const foliageTint = mixColor(0x40556b, 0xfff7e4, illumination);
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
    }

    // The left frame's hive is at about (460,551) in the original atlas.
    // Rotate its offset with the trunk pivot so departures follow the swaying hive.
    const offsetX = (366 - 282) * left.sprite.scale.x;
    const offsetY = (414 - 442) * left.sprite.scale.y;
    const c = Math.cos(left.group.rotation), s = Math.sin(left.group.rotation);
    this.hive.x = left.group.x + offsetX * c - offsetY * s;
    this.hive.y = left.group.y + offsetX * s + offsetY * c;

    this.shadowLayer.clear();
    const shadowAlpha = (.035 + light * .055) * (1 - snow * .5);
    this.shadowLayer.ellipse(left.group.x + 25, left.group.y - 13, 104, 31)
      .fill({ color: 0x253d27, alpha: shadowAlpha });
    this.shadowLayer.ellipse(right.group.x + 14, right.group.y - 12, 80, 25)
      .fill({ color: 0x253d27, alpha: shadowAlpha });

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
      const point = this.butterflyPoint(butterfly, time, width, height);
      const next = this.butterflyPoint(butterfly, time + .05, width, height);
      const sprite = butterfly.sprite;
      sprite.position.set(clamp(point.x, 12, width - 12), clamp(point.y, 12, height - 12));
      sprite.rotation = Math.atan2(next.y - point.y, next.x - point.x) + Math.PI / 2;
      const base = butterfly.size / sprite.texture.width;
      const wing = .3 + Math.abs(Math.sin(time * (7.4 + butterfly.index * .3) + butterfly.phase)) * .7;
      sprite.scale.set(base * wing, base);
      sprite.alpha = day * .85;
      sprite.tint = insectTint;
      sprite.visible = sprite.alpha > .005;
    }

    const glow = this.fireflyLayer.clear();
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
        glow.circle(x, y, 7.8).fill({ color: 0xb3ee6e, alpha: alpha * .075 });
        glow.circle(x, y, 3.3).fill({ color: 0xccff7d, alpha: alpha * .28 });
        glow.circle(x, y, fly.radius).fill({ color: 0xf5ffbc, alpha });
      }
    }
    return this.activity;
  }

  destroy() {
    this.container.destroy({ children: true });
    // Frames share the caller-owned atlas source; never destroy that source.
    for (const texture of this.textures) texture.destroy(false);
  }
}
