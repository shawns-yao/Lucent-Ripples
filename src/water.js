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
const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform mediump vec4 uInputSize;
uniform vec4 uInputClamp;
uniform mediump vec4 uOutputFrame;
uniform float uTime;
uniform vec2 uWorld;
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
vec2 hash22(vec2 p) { vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yzx+33.33);return fract((p3.xx+p3.yz)*p3.zy); }
float cells(vec2 p,float t) {
  vec2 n=floor(p),f=fract(p);float a=8.,b=8.;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
    vec2 g=vec2(float(i),float(j));vec2 r=hash22(n+g);
    vec2 o=.5+.32*sin(t*.31+6.283185*r);
    float d=length(g+o-f);
    if(d<a){b=a;a=d;}else if(d<b){b=d;}
  }
  return b-a;
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
  vec2 uv=vTextureCoord;vec2 screenUV=uv*uInputSize.xy/uOutputFrame.zw;vec2 world=screenUV*uWorld;
  float t=uTime;
  vec2 flow=vec2(sin(world.y*.011+t*.42)+sin(world.y*.024-world.x*.008-t*.23),cos(world.x*.01+t*.36)+sin(world.y*.013+world.x*.009+t*.31));
  vec3 rp=ripple(world,uRipple0)+ripple(world,uRipple1)+ripple(world,uRipple2)+ripple(world,uRipple3)+ripple(world,uRipple4);
  rp+=rainRipple(world,uRainImpact0)+rainRipple(world,uRainImpact1)+rainRipple(world,uRainImpact2)+rainRipple(world,uRainImpact3)+rainRipple(world,uRainImpact4)+rainRipple(world,uRainImpact5)+rainRipple(world,uRainImpact6)+rainRipple(world,uRainImpact7)+rainRipple(world,uRainImpact8)+rainRipple(world,uRainImpact9)+rainRipple(world,uRainImpact10)+rainRipple(world,uRainImpact11)+rainRipple(world,uRainImpact12)+rainRipple(world,uRainImpact13)+rainRipple(world,uRainImpact14)+rainRipple(world,uRainImpact15);
  float gust=sin(dot(world,uWind+vec2(.2,.1))*.045-t*(.9+uWeather.z));
  vec2 shift=(flow*(.65+uWeather.z*.8)+uWind*gust*.9+rp.xy)*uInputSize.zw;
  vec4 color=texture(uTexture,clamp(uv+shift,uInputClamp.xy,uInputClamp.zw));
  vec2 w=world/175.+vec2(sin(world.y*.005+t*.16),cos(world.x*.004-t*.13))*.19;
  float line=cells(w,t);
  float caustic=exp(-line*47.0)*.115;
  float broad=exp(-line*13.0)*.045;
  float modulation=.45+.55*(.5+.5*sin(world.x*.005+world.y*.007-t*.45));
  color.rgb+=vec3(.73,.91,.64)*(caustic+broad)*modulation*(1.-uWeather.x*.85)*uWeather.y;
  color.rgb+=vec3(.77,.89,.77)*rp.z;
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
  color.rgb+=vec3(1.,.95,.72)*spot*flicker*(.28+sunPool*1.2)*sunshine;
  // A recognizable moon disk with soft crater markings, distorted along with
  // the water. The disk survives the shimmer instead of turning into stripes.
  vec2 moon=world-uMoon.xy;
  moon.x+=sin(world.y*.13+t*.55)*2.1+flow.x*.7+rp.x*.5;
  moon.y+=flow.y*.55+rp.y*.4;
  float radius=34.;
  float disk=1.-smoothstep(radius-1.,radius+1.3,length(moon));
  vec2 md=moon/radius;
  float terminator=sqrt(max(0.,1.-md.y*md.y));
  float orientation=uSun.w<.5?1.:-1.;
  float phaseMask=smoothstep(-.04,.04,md.x*orientation+(uMoon.w*2.-1.)*terminator);
  float craters=exp(-dot(md-vec2(-.25,.15),md-vec2(-.25,.15))*20.)*.14+exp(-dot(md-vec2(.32,-.2),md-vec2(.32,-.2))*32.)*.10;
  float shimmer=.92+.08*sin(world.y*.48+t*.8+flow.x);
  float nightVisibility=uMoon.z*(1.-uWeather.y);
  float halo=exp(-dot(moon,moon)/(radius*radius*3.6))*.105*uMoon.w;
  // Faint broken light lies beneath the clear circular reflection.
  vec2 trail=world-uMoon.xy-vec2(0.,65.);
  trail.x+=sin(trail.y*.065+t*.6)*4.;
  float path=exp(-pow(trail.x/46.,2.)-pow(trail.y/100.,2.));
  float broken=pow(.5+.5*sin(world.y*.48+flow.x*2.+t*.7),3.);
  color.rgb+=vec3(.88,.93,.84)*(disk*phaseMask*(1.-craters)*shimmer*.88+halo+path*broken*.105*uMoon.w)*nightVisibility;
  finalColor=vec4(color.rgb,color.a);
}`;
export function createWaterFilter() {
 const uniforms={uTime:{value:0,type:'f32'},uWorld:{value:[1672,941],type:'vec2<f32>'},uWeather:{value:[.08,1,.1,0],type:'vec4<f32>'},uWind:{value:[0,0],type:'vec2<f32>'},uMoon:{value:[1000,280,0,1],type:'vec4<f32>'},uSun:{value:[835,350,1,.5],type:'vec4<f32>'}};
 for(let i=0;i<5;i++) uniforms['uRipple'+i]={value:[0,0,-100,0],type:'vec4<f32>'};
 for(let i=0;i<16;i++) uniforms['uRainImpact'+i]={value:[0,0,-100,0],type:'vec4<f32>'};
 return new Filter({glProgram:GlProgram.from({vertex,fragment,name:'pond-water'}),resources:{waterUniforms:uniforms},padding:0});
}
