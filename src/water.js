import { Filter, GlProgram } from 'pixi.js';
const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform mediump vec4 uInputSize;
uniform mediump vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main() {
  vec2 p=aPosition*uOutputFrame.zw+uOutputFrame.xy;
  p.x=p.x*(2.0/uOutputTexture.x)-1.0;
  p.y=p.y*(2.0*uOutputTexture.z/uOutputTexture.y)-uOutputTexture.z;
  gl_Position=vec4(p,0.0,1.0);
  vTextureCoord=aPosition*(uOutputFrame.zw*uInputSize.zw);
}`;
export const filterVertex=vertex;
const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uTerrain;
uniform sampler2D uMoonTexture;
uniform sampler2D uSurface;
uniform mediump vec4 uInputSize;
uniform vec4 uInputClamp;
uniform mediump vec4 uOutputFrame;
uniform float uTime;
uniform float uStyle;
uniform float uWinter;
uniform float uSeason;
uniform vec2 uWorld;
uniform vec2 uOrigin;
uniform vec4 uClimate; // ice, settled snow, rendering quality, temperature
uniform vec4 uLeaf0;
uniform vec4 uLeaf1;
uniform vec4 uLeaf2;
uniform vec4 uLeaf3;
uniform vec4 uLeaf4;
uniform vec4 uLeaf5;
uniform vec4 uLeaf6;
uniform vec4 uLeaf7;
uniform vec4 uWeather; // cloud, daylight, wind strength, snow
uniform vec2 uWind;
uniform vec4 uMoon; // reflected world position, horizon visibility, illuminated fraction
uniform vec4 uSun; // reflected world position, horizon visibility, moon phase
uniform vec4 uRainImpact0;
uniform vec4 uRainImpact1;
uniform vec4 uRainImpact2;
uniform vec4 uRainImpact3;
uniform vec4 uRainImpact4;
uniform vec4 uRainImpact5;
uniform vec4 uRainImpact6;
uniform vec4 uRainImpact7;
uniform vec4 uRainImpact8;
uniform vec4 uRainImpact9;
uniform vec4 uRainImpact10;
uniform vec4 uRainImpact11;
uniform vec4 uRainImpact12;
uniform vec4 uRainImpact13;
uniform vec4 uRainImpact14;
uniform vec4 uRainImpact15;

uniform vec4 uRipple0;
uniform vec4 uRipple1;
uniform vec4 uRipple2;
uniform vec4 uRipple3;
uniform vec4 uRipple4;
uniform vec4 uWake0;
uniform vec4 uWake1;
uniform vec4 uWake2;
uniform vec4 uWake3;
uniform vec4 uWake4;
uniform vec4 uWake5;
vec2 hash22(vec2 p) { vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yzx+33.33);return fract((p3.xx+p3.yz)*p3.zy); }
float noise(vec2 p) {
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash22(i).x,hash22(i+vec2(1.,0.)).x,f.x),mix(hash22(i+vec2(0.,1.)).x,hash22(i+1.).x,f.x),f.y);
}
float leafMask(vec2 p,vec4 leaf) { return leaf.z>0.?1.-smoothstep(leaf.z-3.,leaf.z+3.,length(p-leaf.xy)):0.; }
vec3 wake(vec2 p,vec4 r){
  float age=uTime-r.z;
  if(r.w<=0.||age<0.||age>2.4)return vec3(0.);
  vec2 delta=p-r.xy;float d=length(delta),front=d-(3.+age*12.);
  float wave=sin(front*.85)*exp(-front*front*.12)*sin(age/2.4*3.14159)*r.w;
  return vec3(delta/max(d,1.)*wave*.45,wave*.025);
}
vec3 ripple(vec2 p,vec4 r) {
  float age=uTime-r.z;
  if(r.w<.5||age<0.||age>5.)return vec3(0.);
  vec2 d=p-r.xy;float dist=length(d);float radius=age*73.;
  float band=exp(-pow((dist-radius)/18.,2.));
  float fade=exp(-age*.68);
  float wave=sin((dist-radius)*.20)*band*fade;
  vec2 delta=d/max(dist,1.)*wave*2.0;
  return vec3(delta,wave*.045);
}
vec3 rainRipple(vec2 p,vec4 r) {
  float age=uTime-r.z;
  if(r.w<=0.||age<0.||age>1.05)return vec3(0.);
  vec2 d=p-r.xy;float dist=length(d),radius=1.+age*25.;
  float band=exp(-pow((dist-radius)/2.3,2.));
  float wave=sin((dist-radius)*1.2)*band*(1.-age/1.05)*r.w;
  return vec3(d/max(dist,1.)*wave*.9,wave*.028);
}
void main() {
  vec2 uv=vTextureCoord;vec2 screenUV=uv*uInputSize.xy/uOutputFrame.zw;vec2 world=screenUV*uWorld+uOrigin;
  vec2 localWorld=world;
  vec4 terrain=texture(uTerrain,clamp(localWorld/vec2(1672.,941.),0.,1.));
  float leaves=max(max(max(leafMask(localWorld,uLeaf0),leafMask(localWorld,uLeaf1)),max(leafMask(localWorld,uLeaf2),leafMask(localWorld,uLeaf3))),max(max(leafMask(localWorld,uLeaf4),leafMask(localWorld,uLeaf5)),max(leafMask(localWorld,uLeaf6),leafMask(localWorld,uLeaf7))));
  float wet=mix(terrain.r,terrain.g,uWinter)*(1.-leaves);
  float grain=noise(localWorld*.021);
  // Static terrain alpha is shared with click, rain and animal surface checks.
  float ice=terrain.a*uClimate.x*wet;
  float t=uTime;
  vec2 flow=vec2(sin(world.y*.011+t*.42)+sin(world.y*.024-world.x*.008-t*.23),cos(world.x*.01+t*.36)+sin(world.y*.013+world.x*.009+t*.31));
  vec3 rp=ripple(world,uRipple0)+ripple(world,uRipple1)+ripple(world,uRipple2)+ripple(world,uRipple3)+ripple(world,uRipple4);
  rp+=wake(world,uWake0)+wake(world,uWake1)+wake(world,uWake2)+wake(world,uWake3)+wake(world,uWake4)+wake(world,uWake5);
  rp+=rainRipple(world,uRainImpact0)+rainRipple(world,uRainImpact1)+rainRipple(world,uRainImpact2)+rainRipple(world,uRainImpact3)+rainRipple(world,uRainImpact4)+rainRipple(world,uRainImpact5)+rainRipple(world,uRainImpact6)+rainRipple(world,uRainImpact7)+rainRipple(world,uRainImpact8)+rainRipple(world,uRainImpact9)+rainRipple(world,uRainImpact10)+rainRipple(world,uRainImpact11)+rainRipple(world,uRainImpact12)+rainRipple(world,uRainImpact13)+rainRipple(world,uRainImpact14)+rainRipple(world,uRainImpact15);
  float gust=sin(dot(world,uWind+vec2(.2,.1))*.045-t*(.9+uWeather.z));
  float movement=wet*(1.-smoothstep(.12,.3,ice))*(1.-uWinter*.55);
  vec2 shift=(flow*(.65+uWeather.z*.8)+uWind*gust*.9+rp.xy)*uInputSize.zw*movement;
  vec4 color=texture(uTexture,clamp(uv+shift,uInputClamp.xy,uInputClamp.zw));
  if(ice>.12){
    vec2 blur=uInputSize.zw*(1.+ice*3.);
    vec3 below=(texture(uTexture,clamp(uv+blur,uInputClamp.xy,uInputClamp.zw)).rgb+texture(uTexture,clamp(uv-blur,uInputClamp.xy,uInputClamp.zw)).rgb)*.5;
    color.rgb=mix(color.rgb,below,ice*.65);
  }
  float depth=terrain.b;
  vec3 shallow=color.rgb*vec3(1.025,1.012,.96);
  vec3 deep=color.rgb*vec3(.63,.79,.85)+vec3(.005,.018,.024);
  color.rgb=mix(color.rgb,mix(shallow,deep,depth),wet);
  vec3 seasonWater=uSeason<.5?vec3(.95,1.08,.96):uSeason<1.5?vec3(1.):uSeason<2.5?vec3(1.14,.99,.80):vec3(.78,.90,1.06);
  color.rgb=mix(color.rgb,color.rgb*seasonWater,wet*.85);
  float foliage=texture(uSurface,clamp(localWorld/vec2(1672.,941.),0.,1.)).r*(1.-uWinter);
  float leafLight=dot(color.rgb,vec3(.28,.57,.15));
  vec3 leafColor=uSeason<.5?vec3(.88,1.24,.54):vec3(1.25,.85,.32);
  float leafChange=uSeason<.5?.42:uSeason>1.5?.84:0.;
  color.rgb=mix(color.rgb,leafLight*leafColor,foliage*leafChange);
  // Two smooth spatial scales bend the light network into flowing curves.
  vec2 w=localWorld/192.;
  w+=vec2(sin(w.y*2.2+t*.19)+sin(w.x*1.6-w.y+t*.11),cos(w.x*2.1-t*.15)+sin(w.y*1.7+w.x-t*.13))*.36;
  w+=vec2(sin(w.y*4.7-t*.21),cos(w.x*4.2+t*.17))*.09;
  float caustic=0.,broad=0.;
  if(uStyle<.5){
    float line=abs(sin(w.x*2.5+sin(w.y*1.8)*1.6)+sin(w.y*2.9-w.x*.6)*.42);
    caustic=exp(-line*mix(15.,24.,uClimate.z))*.046;
    broad=exp(-line*6.0)*.012;
  }
  float curved=sin(localWorld.x*.017+localWorld.y*.009+sin(localWorld.y*.022-t*.18)*1.9+t*.24);
  float ribbon=exp(-abs(curved)*mix(54.,32.,uStyle))*noise(localWorld*.008+vec2(t*.015,0.))*mix(.025,.014,uStyle);
  float patch=smoothstep(.35,.72,noise(world*.004+vec2(t*.012,-t*.007)));
  float modulation=patch*(1.-depth*.72)*(.5+.5*(.5+.5*sin(world.x*.005+world.y*.007-t*.22)));
  color.rgb+=vec3(.73,.91,.64)*((caustic+broad)+ribbon)*modulation*(1.-uWeather.x*.85)*uWeather.y*movement;
  color.rgb+=vec3(.77,.89,.77)*rp.z*movement;
  color.rgb=mix(color.rgb,vec3(.26,.51,.45),.055);
  float vignette=smoothstep(.9,.25,length((screenUV-.5)*vec2(1.,.9)));
  color.rgb*=.96+.04*vignette;
  color.rgb*=mix(vec3(.24,.41,.50),vec3(1.),uWeather.y)*(1.-uWeather.x*.19);
  color.rgb=mix(color.rgb,color.rgb*vec3(.87,.96,1.08),uWeather.w*.4);
  // Small sunlight facets sparkle as surface normals turn toward the sun.
  // Cloud/rain dim the glints; the broader caustics above remain underwater.
  vec2 sunDelta=world-uSun.xy;
  float sunPool=exp(-pow(sunDelta.x/340.,2.)-pow(sunDelta.y/220.,2.));
  vec2 facet=(world+flow*3.)/vec2(21.,18.);
  vec2 cell=floor(facet),h=hash22(cell),point=fract(facet)-(.22+h*.56);
  float spot=exp(-dot(point*vec2(1.,1.8),point*vec2(1.,1.8))*125.);
  float flicker=pow(max(0.,sin(t*(1.1+h.x)+h.y*60.)),8.);
  float sunshine=uSun.z*uWeather.y;
  color.rgb+=vec3(1.,.95,.72)*spot*flicker*(.025+sunPool*.72)*sunshine*movement*mix(1.,.55,uStyle);
  // A broken specular footprint, not a sharp lunar photograph on the water.
  vec2 moon=world-uMoon.xy;
  moon.x+=sin(world.y*.046+t*.31)*(3.+uWeather.z*5.)+flow.x*2.;
  moon.y+=flow.y*1.2+rp.y;
  float nightVisibility=uMoon.z*(1.-uWeather.y);
  float roughness=.35+uWeather.z*.8;
  float width=17.+roughness*34.+max(0.,moon.y)*.10;
  float path=exp(-pow(moon.x/width,2.)-pow((moon.y-35.)/(68.+roughness*62.),2.));
  float wave=sin(world.y*.18+sin(world.x*.028+t*.27)*2.3+flow.x*.8-t*.65);
  float fragments=pow(max(0.,wave),6.)*(.28+.72*noise(vec2(world.x*.11,world.y*.035)+vec2(t*.08,0.)));
  vec2 moonUV=moon/vec2(58.,44.)+.5;
  float reference=texture(uMoonTexture,clamp(moonUV,0.,1.)).r;
  float center=exp(-pow(moon.x/24.,2.)-pow(moon.y/17.,2.));
  float halo=exp(-pow(moon.x/62.,2.)-pow(moon.y/105.,2.))*.028;
  float moonLight=(path*fragments*.48+center*(.025+fragments*.20)*(.35+reference*.65)+halo)*uMoon.w*nightVisibility;
  color.rgb+=vec3(.82,.89,.91)*moonLight*movement;
  // Thin translucent ice retains some bottom detail and subdued light below it.
  float cloud=noise(localWorld*.013+vec2(23.,8.));
  vec2 crackCell=floor(localWorld/155.),crackHash=hash22(crackCell),cp=fract(localWorld/155.)-.5;
  float angle=crackHash.x*6.28318;vec2 axis=vec2(cos(angle),sin(angle));
  float along=dot(cp,axis),across=abs(dot(cp,vec2(-axis.y,axis.x)));
  float crack=(1.-smoothstep(.0015,.005,across))*(1.-smoothstep(.17,.34,abs(along)))*step(.67,crackHash.y);
  float frost=pow(noise(localWorld*.045),5.)*.07+pow(noise(localWorld*.19),7.)*.015;
  vec3 iceColor=vec3(.66,.78,.83)*(.32+.68*uWeather.y);
  float iceCoverage=smoothstep(.27,.31,ice);
  float opacity=.34+cloud*.13+smoothstep(.45,.9,ice)*.25;
  color.rgb=mix(color.rgb,iceColor,iceCoverage*opacity);
  float rim=iceCoverage*(1.-smoothstep(.32,.39,ice));
  color.rgb+=vec3(.59,.73,.79)*rim*.28*(.25+.75*uWeather.y);
  color.rgb+=vec3(.73,.84,.87)*(frost+crack*.22)*iceCoverage*(.25+.75*uWeather.y);
  float ground=1.-wet;
  float settled=ground*uClimate.y*(.08+.34*pow(noise(localWorld*.075),2.));
  settled+=ice*max(uClimate.y,uWinter*.22)*pow(grain,3.)*.32;
  color.rgb=mix(color.rgb,vec3(.82,.86,.83)*(.48+.52*uWeather.y),clamp(settled,0.,.78));
  finalColor=vec4(color.rgb,color.a);
}`;
export function createWaterFilter(terrain,moonTexture,surface) {
 const uniforms={uTime:{value:0,type:'f32'},uStyle:{value:0,type:'f32'},uWinter:{value:0,type:'f32'},uWorld:{value:[1672,941],type:'vec2<f32>'},uOrigin:{value:[0,0],type:'vec2<f32>'},uClimate:{value:[0,0,1,20],type:'vec4<f32>'},uWeather:{value:[.08,1,.1,0],type:'vec4<f32>'},uWind:{value:[0,0],type:'vec2<f32>'},uMoon:{value:[1000,280,0,1],type:'vec4<f32>'},uSun:{value:[835,350,1,.5],type:'vec4<f32>'}};
 uniforms.uSeason={value:1,type:'f32'};
 for(let i=0;i<8;i++)uniforms['uLeaf'+i]={value:[0,0,0,0],type:'vec4<f32>'};
 for(let i=0;i<5;i++) uniforms['uRipple'+i]={value:[0,0,-100,0],type:'vec4<f32>'};
 for(let i=0;i<6;i++) uniforms['uWake'+i]={value:[0,0,-100,0],type:'vec4<f32>'};
 for(let i=0;i<16;i++) uniforms['uRainImpact'+i]={value:[0,0,-100,0],type:'vec4<f32>'};
 return new Filter({glProgram:GlProgram.from({vertex,fragment,name:'pond-water'}),resources:{waterUniforms:uniforms,uTerrain:terrain.source,uMoonTexture:moonTexture.source,uSurface:surface.source},padding:0,resolution:'inherit'});
}
