import assert from 'node:assert/strict';

// The adapter loads the packaged HTML and uses only public host callbacks.
export async function runWallpaperSettingsChecks(ui) {
  const apply = properties => ui.host(`wallpaperPropertyListener.applyUserProperties(${JSON.stringify(properties)})`);
  const results = [];
  assert.equal(await ui.read('__pond.ready'), true);
  assert.equal(await ui.read('__pond.wallpaper().enabled'), true);
  for (const [season, density, expected] of [['summer', 100, 44], ['summer', 50, 22], ['winter', 50, 5], ['winter', 0, 0], ['spring', 100, 32], ['autumn', 50, 14]]) {
    await apply({pondseason:{value:season}, pondfishdensity:{value:density}});
    const state = await ui.read('__pond.seasonScene()');
    assert.equal(state.activeFish, expected);
    assert.equal(state.visibleFish, expected);
    results.push({season, density, fish:state.activeFish});
  }
  await apply({pondfishdensity:{value:'invalid'}, pondeffects:{value:'invalid'}});
  assert.equal(await ui.read('__pond.wallpaper().fishdensity'), 50);
  assert.equal(await ui.read('__pond.wallpaper().effects'), 'high');
  await ui.host('wallpaperPropertyListener.setPaused(true)');
  const pausedFrames = await ui.read('__pond.frames');
  await apply({pondfishdensity:{value:0}, pondeffects:{value:'low'}});
  await ui.wait(500);
  assert.equal(await ui.read('__pond.frames'), pausedFrames);
  assert.equal(await ui.read('__pond.seasonScene().visibleFish'), 0);
  assert.equal(await ui.read('__pond.wallpaper().effectStrength'), .35);
  await ui.host('wallpaperPropertyListener.setPaused(false)');
  await apply({pondseason:{value:'summer'}, pondfishdensity:{value:100}, pondweather:{value:'rain'}, pondtime:{value:'day'}});
  for (let i=0; i<100; i++) {
    if (await ui.read('__pond.weather().current.rain') > .99) break;
    await ui.wait(200);
  }
  assert.ok(await ui.read('__pond.weather().current.rain') > .99);
  for (const [effects, strength] of [['low',.35], ['medium',.65], ['high',1]]) {
    await apply({pondeffects:{value:effects}});
    const state = await ui.read('({settings:__pond.wallpaper(),rain:__pond.precipitationBudget(),weather:__pond.weather().current})');
    assert.equal(state.settings.effectStrength, strength);
    const expected = Math.floor(state.weather.rain * state.rain.rainBudget * state.settings.particleQuality);
    assert.ok(Math.abs(state.rain.rainCount - expected) <= 2);
    results.push({effects, rainCount:state.rain.rainCount, strength});
  }
  await apply({pondfps:{value:60}});
  await ui.host('wallpaperPropertyListener.applyGeneralProperties({fps:24})');
  assert.equal(await ui.read('__pond.wallpaper().tickerFPS'), 24);
  await ui.host('wallpaperPropertyListener.applyGeneralProperties({fps:0})');
  await apply({pondweather:{value:'clear'}, pondfishdensity:{value:100}, pondeffects:{value:'high'}, pondfps:{value:30}});
  assert.equal(await ui.read('__pond.wallpaper().tickerFPS'), 30);
  return {type:'定向测试', results, pausedUpdates:true, hostFPS:true};
}
