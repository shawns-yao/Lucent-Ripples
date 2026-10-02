import test from 'node:test';
import assert from 'node:assert/strict';
import { Container, Texture, TextureSource } from 'pixi.js';
import { ShoreLife } from '../src/shore-life.js';

const clear = { light: 1, wind: 1.3, rain: 0, snow: 0, cloud: .08 };
function fixture(t) {
  const source = new TextureSource({ width: 1254, height: 1254 });
  const atlas = new Texture({ source });
  const world = new Container();
  const shore = new ShoreLife(world, atlas);
  t.after(() => {
    if (!shore.container.destroyed) shore.destroy();
    atlas.destroy(true);
    world.destroy();
  });
  return { source, atlas, world, shore };
}

test('shore construction keeps finite particle counts and valid atlas frames', t => {
  const { shore, world, atlas } = fixture(t);
  assert.equal(world.children.length, 1);
  assert.equal(shore.trees.length, 2);
  assert.equal(shore.bees.length, 7);
  assert.equal(shore.butterflies.length, 5);
  assert.equal(shore.fireflies.length, 18);
  for (const texture of shore.textures) {
    const frame = texture.frame;
    assert.ok(frame.x >= 0 && frame.y >= 0 && frame.width > 0 && frame.height > 0);
    assert.ok(frame.right <= atlas.width && frame.bottom <= atlas.height);
  }
});

test('day and night switch insects, fireflies, and tree color independently', t => {
  const { shore } = fixture(t);
  shore.update(22, clear);
  const daylightTint = shore.trees[0].sprite.tint;
  assert.equal(shore.activity.day, 1);
  assert.equal(shore.activity.night, 0);
  assert.equal(shore.fireflyLayer.visible, false);
  assert.ok(shore.butterflies.every(({ sprite }) => sprite.visible));
  shore.update(22, { ...clear, light: .12 });
  assert.equal(shore.activity.day, 0);
  assert.equal(shore.activity.night, 1);
  assert.equal(shore.fireflyLayer.visible, true);
  assert.notEqual(shore.trees[0].sprite.tint, daylightTint);
  assert.ok([...shore.bees, ...shore.butterflies].every(({ sprite }) => !sprite.visible));
});

test('shore trajectories are deterministic and do not depend on intervening updates', t => {
  const { shore } = fixture(t);
  const snapshot = () => [...shore.bees, ...shore.butterflies].map(({ sprite }) => [
    sprite.x, sprite.y, sprite.rotation, sprite.scale.x, sprite.scale.y, sprite.alpha,
  ]);
  shore.update(22, clear);
  const first = snapshot();
  shore.update(137, { ...clear, light: .12 });
  shore.update(22, clear);
  assert.deepEqual(snapshot(), first);
  const another = fixture(t).shore;
  another.update(22, clear);
  assert.deepEqual(another.bees.map(({ sprite }) => [sprite.x, sprite.y]),
    shore.bees.map(({ sprite }) => [sprite.x, sprite.y]));
});

test('rain, snow, and strong wind suppress daytime insect activity', t => {
  const { shore } = fixture(t);
  for (const storm of [{ rain: .8 }, { snow: .8 }, { wind: 22 }]) {
    shore.update(120, { ...clear, ...storm });
    assert.equal(shore.activity.day, 0);
    assert.ok([...shore.bees, ...shore.butterflies].every(({ sprite }) => !sprite.visible));
  }
  shore.update(120, { ...clear, light: .12, rain: .9 });
  assert.equal(shore.activity.night, 0);
  assert.equal(shore.fireflyLayer.visible, false);
});

test('shore insects stay finite and in bounds over 240 seconds', t => {
  const { shore } = fixture(t);
  for (let time = 0; time < 240; time += .31) {
    shore.update(time, { ...clear, light: time % 2 ? 1 : .12, wind: 10 }, 1672, 941);
    for (const { sprite } of [...shore.bees, ...shore.butterflies]) {
      for (const value of [sprite.x, sprite.y, sprite.rotation, sprite.alpha, sprite.scale.x, sprite.scale.y]) {
        assert.ok(Number.isFinite(value));
      }
      assert.ok(sprite.x >= 0 && sprite.x <= 1672);
      assert.ok(sprite.y >= 0 && sprite.y <= 941);
    }
  }
  assert.equal(shore.bees.length, 7);
  assert.equal(shore.butterflies.length, 5);
  assert.equal(shore.fireflies.length, 18);
});

test('shore cleanup removes owned objects but preserves the shared atlas source', t => {
  const { shore, world, source } = fixture(t);
  shore.destroy();
  assert.equal(world.children.length, 0);
  assert.equal(shore.container.destroyed, true);
  assert.ok(!source.destroyed);
});

test('cover-cropped narrow screens keep the hive inside the visible camera', t => {
  const { shore } = fixture(t);
  for (const viewport of [{left:158,right:1514,top:0,bottom:941},{left:635,right:1037,top:0,bottom:941},{left:0,right:1672,top:255,bottom:686}]) {
    shore.viewport=viewport;
    for(let time=0;time<120;time+=1.7){shore.update(time,{...clear,wind:10});assert.ok(shore.hive.x>viewport.left&&shore.hive.x<viewport.right);assert.ok(shore.hive.y>viewport.top&&shore.hive.y<viewport.bottom);}
  }
});
