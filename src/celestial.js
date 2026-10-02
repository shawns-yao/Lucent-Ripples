/*!
 * Astronomical formulas adapted from SunCalc 1.9.0 (BSD-2-Clause).
 * Copyright (c) 2014, Vladimir Agafonkin. All rights reserved.
 * https://github.com/mourner/suncalc/tree/v1.9.0
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

// Offline, low-order SunCalc 1.9 model, not the higher-precision SunCalc 2 model.
// Sun altitude is geometric; Moon altitude includes standard atmospheric
// refraction. Lunar parallax, terrain, observer elevation, actual pressure and
// temperature are omitted. These are approximate decorative sky positions,
// not navigation, eclipse prediction, or precise rise/set calculations.
// Azimuth is converted to clockwise FROM NORTH; all exported angles are radians.
const PI = Math.PI, TAU = 2 * PI, RAD = PI / 180, DAY_MS = 86400000;
const {sin, cos, tan, asin, acos, atan2} = Math;
const OBLIQUITY = 23.4397 * RAD;
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const wrap = angle => ((angle % TAU) + TAU) % TAU;
const smooth = (lo, hi, value) => { const t = clamp((value - lo) / (hi - lo)); return t * t * (3 - 2 * t); };
const unitWeather = value => Number.isFinite(value) ? clamp(value) : 0;

export const REFERENCE_LOCATION = Object.freeze({lat:39.9, lon:116.4, label:'北京参考坐标（未选择位置）'});

function resolveLocation(location) {
  if (location && Number.isFinite(location.lat) && Number.isFinite(location.lon)
      && Math.abs(location.lat) <= 90 && Math.abs(location.lon) <= 180) {
    return {lat:location.lat, lon:location.lon, label:location.label || '所选位置', isReference:false};
  }
  return {...REFERENCE_LOCATION, isReference:true};
}

function rightAscension(longitude, latitude) {
  return atan2(sin(longitude) * cos(OBLIQUITY) - tan(latitude) * sin(OBLIQUITY), cos(longitude));
}
function declination(longitude, latitude) {
  return asin(clamp(sin(latitude) * cos(OBLIQUITY) + cos(latitude) * sin(OBLIQUITY) * sin(longitude), -1, 1));
}
function sunCoordinates(days) {
  const anomaly = RAD * (357.5291 + .98560028 * days);
  const center = RAD * (1.9148 * sin(anomaly) + .02 * sin(2 * anomaly) + .0003 * sin(3 * anomaly));
  const longitude = anomaly + center + RAD * 102.9372 + PI;
  return {ra:rightAscension(longitude, 0), dec:declination(longitude, 0)};
}
function moonCoordinates(days) {
  const longitude = RAD * (218.316 + 13.176396 * days);
  const anomaly = RAD * (134.963 + 13.064993 * days);
  const argument = RAD * (93.272 + 13.229350 * days);
  const correctedLongitude = longitude + RAD * 6.289 * sin(anomaly);
  const latitude = RAD * 5.128 * sin(argument);
  return {ra:rightAscension(correctedLongitude, latitude), dec:declination(correctedLongitude, latitude), distance:385001 - 20905 * cos(anomaly)};
}
function horizontal(coordinates, days, location, refracted = false) {
  const latitude = location.lat * RAD;
  const hourAngle = RAD * (280.16 + 360.9856235 * days + location.lon) - coordinates.ra;
  const geometricAltitude = asin(clamp(sin(latitude) * sin(coordinates.dec) + cos(latitude) * cos(coordinates.dec) * cos(hourAngle), -1, 1));
  const safeAltitude = Math.max(0, geometricAltitude);
  const refraction = refracted ? .0002967 / tan(safeAltitude + .00312536 / (safeAltitude + .08901179)) : 0;
  return {
    altitude:geometricAltitude + refraction,
    geometricAltitude,
    azimuth:wrap(atan2(sin(hourAngle), cos(hourAngle) * sin(latitude) - tan(coordinates.dec) * cos(latitude)) + PI),
  };
}
function lunarIllumination(sun, moon) {
  const elongation = acos(clamp(sin(sun.dec) * sin(moon.dec) + cos(sun.dec) * cos(moon.dec) * cos(sun.ra - moon.ra), -1, 1));
  const incidence = atan2(149598000 * sin(elongation), moon.distance - 149598000 * cos(elongation));
  const brightLimbAngle = atan2(cos(sun.dec) * sin(sun.ra - moon.ra), sin(sun.dec) * cos(moon.dec) - cos(sun.dec) * sin(moon.dec) * cos(sun.ra - moon.ra));
  return {illumination:(1 + cos(incidence)) / 2, phase:.5 + .5 * incidence * (brightLimbAngle < 0 ? -1 : 1) / PI, brightLimbAngle};
}

/**
 * Fixed north-up artistic angular projection, NOT a calibrated optical camera.
 * x is east/right, y is south/down; zenith projects to the pond center. The
 * horizontal unit direction maps to a fixed ellipse inside the painted water.
 * Coordinates are normalized to the unscaled world texture, before its TILT
 * and cover/crop transform. Multiply by WORLD.width/height for world pixels.
 * Renderer ripples may distort the reflection, but must not animate its center
 * independently of these sky angles. Below-horizon callers must use visibility.
 */
export function projectReflection(altitude, azimuth) {
  const horizontalRadius = cos(altitude);
  return {x:.5 + .30 * sin(azimuth) * horizontalRadius, y:.45 - .25 * cos(azimuth) * horizontalRadius};
}

function renderBody(position, strength) {
  const {altitude, azimuth} = position;
  return {
    ...position,
    aboveHorizon:altitude > 0,
    visibility:altitude <= 0 ? 0 : smooth(0, 7 * RAD, altitude) * strength,
    direction:{x:sin(azimuth) * cos(altitude), y:-cos(azimuth) * cos(altitude), z:sin(altitude)},
    reflection:projectReflection(altitude, azimuth),
  };
}

/**
 * Pure snapshot. Pass the wall-clock Date, never the simulation's animation
 * counter. location is the selected weather.location {lat,lon}; if absent or
 * invalid, reference coordinates are explicitly identified in the result.
 * weather contains normalized cloud/rain/snow; these attenuate light but never
 * move celestial bodies. Day/night modes are fixed illustrative previews and
 * deliberately override real time, horizon and Moon phase, with explicit labels.
 */
export function celestialAt({date = new Date(), location = null, timeMode = 'auto', weather = {}} = {}) {
  const timestamp = date instanceof Date ? date.getTime() : NaN;
  if (!Number.isFinite(timestamp)) throw new TypeError('celestialAt needs a valid Date');
  if (!['auto', 'day', 'night'].includes(timeMode)) throw new RangeError('Unknown celestial time mode');
  const resolved = resolveLocation(location);
  const cloud = unitWeather(weather.cloud), rain = unitWeather(weather.rain), snow = unitWeather(weather.snow);
  const transmission = (1 - .94 * cloud) * (1 - .68 * rain) * (1 - .5 * snow);
  const isPreview = timeMode !== 'auto';
  let sunPosition, moonPosition, illumination;
  if (isPreview) {
    const day = timeMode === 'day';
    sunPosition = {altitude:(day ? 55 : -30) * RAD, geometricAltitude:(day ? 55 : -30) * RAD, azimuth:145 * RAD};
    moonPosition = {altitude:(day ? -30 : 48) * RAD, geometricAltitude:(day ? -30 : 48) * RAD, azimuth:75 * RAD};
    illumination = {illumination:1, phase:.5, brightLimbAngle:0};
  } else {
    const days = timestamp / DAY_MS + 2440587.5 - 2451545;
    const sun = sunCoordinates(days), moon = moonCoordinates(days);
    sunPosition = horizontal(sun, days, resolved);
    moonPosition = {...horizontal(moon, days, resolved, true), distance:moon.distance};
    illumination = lunarIllumination(sun, moon);
  }
  const darkness = 1 - smooth(-6 * RAD, 4 * RAD, sunPosition.altitude);
  return {
    timestamp,
    location:resolved,
    isReferenceLocation:resolved.isReference,
    mode:timeMode,
    isPreview,
    label:isPreview
      ? timeMode === 'day' ? '白昼预览 · 固定示意太阳方位' : '夜景预览 · 满月示意（非当前月相）'
      : `${resolved.label} · 实时天体近似方位`,
    daylight:isPreview ? timeMode === 'day' ? 1 : .12 : .12 + .88 * smooth(-6 * RAD, 20 * RAD, sunPosition.altitude),
    transmission,
    sun:renderBody(sunPosition, transmission),
    moon:{...renderBody(moonPosition, transmission * Math.sqrt(illumination.illumination) * darkness), ...illumination},
  };
}
