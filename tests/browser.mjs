// Run locally against `npm run dev`. This test was authored but not run in the
// cloud session, whose browser blocks loopback URLs.
import {chromium} from '@playwright/test';import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__pond?.ready);
await page.waitForTimeout(1800);assert.equal(await page.evaluate(()=>window.__pond.renderer),'webgl');
await page.screenshot({path:'artifacts/pond-desktop.png'});
await page.locator('#weather-summary').click();
for(const preset of ['rain','snow','wind','clear']){await page.locator(`[data-weather="${preset}"]`).click();await page.evaluate(()=>window.__pond.advance(12));assert.equal(await page.evaluate(()=>window.__pond.weather().preset),preset);}
await page.evaluate(()=>window.__pond.pause(true));await page.locator('[data-time="night"]').click();await page.waitForTimeout(12000);assert.ok(await page.evaluate(()=>window.__pond.weather().current.light)<.2);await page.evaluate(()=>window.__pond.pause(false));await page.evaluate(()=>window.__pond.advance(18));
assert.ok(await page.evaluate(()=>window.__pond.weather().current.light)<.2);
await page.screenshot({path:'artifacts/pond-night.png'});
assert.match(await page.locator('#celestial-note').innerText(), /预览/);
assert.ok(await page.evaluate(()=>window.__pond.sky().moon.visibility)>0);
assert.equal(await page.locator('#growth-preview, #growth-reset').count(),0);
await page.locator('[data-time="day"]').click();
const garden=await page.evaluate(()=>window.__pond.growth().map(({x,y,bornAt})=>({x,y,bornAt})));
const age=await page.evaluate(()=>window.__pond.growth()[0].age);await page.evaluate(()=>window.__pond.advance(25));
assert.ok(Math.abs(await page.evaluate(()=>window.__pond.growth()[0].age)-age)<.001);
await page.screenshot({path:'artifacts/pond-day-glints.png'});
await page.reload();await page.waitForFunction(()=>window.__pond?.ready);
assert.deepEqual(await page.evaluate(()=>window.__pond.growth().map(({x,y,bornAt})=>({x,y,bornAt}))),garden);
await page.locator('#weather-summary').click();
await page.locator('#weather-summary').click();
await page.locator('canvas').click({position:{x:770,y:430}});
assert.ok(await page.evaluate(()=>window.__pond.lastClick.selected>0));
await page.waitForTimeout(1500);await page.screenshot({path:'artifacts/pond-interaction.png'});
await page.getByRole('button',{name:'暂停动画',exact:true}).click();assert.ok(await page.evaluate(()=>window.__pond.paused));
await page.getByRole('button',{name:'继续动画',exact:true}).click();assert.ok(await page.evaluate(()=>!window.__pond.paused));
await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);await page.screenshot({path:'artifacts/pond-mobile.png'});
assert.equal(await page.locator('canvas').evaluate(el=>el.clientWidth),390);assert.deepEqual(errors,[]);await browser.close();console.log('Browser checks passed');
