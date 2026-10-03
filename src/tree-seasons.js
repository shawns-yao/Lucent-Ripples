import { Filter, GlProgram } from 'pixi.js';
import { filterVertex } from './water.js';

const STORAGE_KEY='pond-tree-season';
const SEASONS={auto:'随日期',spring:'春',summer:'夏',autumn:'秋',winter:'冬'};
const COLORS={spring:[.76,1.16,.46,.78],summer:[.58,.94,.43,.66],autumn:[1.26,.89,.28,.90],winter:[1,1,1,0]};
const fragment=`
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uFoliage;
void main(){
  vec4 color=texture(uTexture,vTextureCoord);
  float green=smoothstep(.94,1.04,color.g/max(color.r,.001))*smoothstep(1.13,1.55,color.g/max(color.b,.001));
  float light=dot(color.rgb,vec3(.299,.587,.114));
  color.rgb=mix(color.rgb,light*uFoliage.rgb,green*uFoliage.a);
  finalColor=color;
}`;

export function createFoliageFilter(){
  return new Filter({glProgram:GlProgram.from({vertex:filterVertex,fragment,name:'seasonal-foliage'}),resources:{seasonUniforms:{uFoliage:{value:COLORS.summer.slice(),type:'vec4<f32>'}}},padding:0,resolution:'inherit'});
}
export function setFoliageSeason(filter,season){
  const values=filter.resources.seasonUniforms.uniforms.uFoliage,color=COLORS[season]||COLORS.summer;
  for(let i=0;i<4;i++)values[i]=color[i];
}

export function setupTreeSeasons(onChange){
  let mode='auto',resolved='summer',wasOverridden=false;
  try{const saved=localStorage.getItem(STORAGE_KEY);if(Object.hasOwn(SEASONS,saved))mode=saved;}catch{ /* Seasonal previews also work without storage. */ }
  const section=document.createElement('div');section.className='season-controls';
  const label=document.createElement('p');label.textContent='树木季节';
  const group=document.createElement('div');group.id='season-options';group.setAttribute('role','group');group.setAttribute('aria-label','树木季节');
  const status=document.createElement('p');status.className='season-status';status.setAttribute('role','status');status.hidden=true;
  const buttons=Object.entries(SEASONS).map(([key,name])=>{
    const button=document.createElement('button');button.type='button';button.textContent=name;button.dataset.season=key;
    button.addEventListener('click',()=>select(key));
    group.append(button);return button;
  });
  section.append(label,group,status);document.querySelector('.appearance-controls').after(section);
  function refresh(){for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.season===mode));}
  function select(key){if(!Object.hasOwn(SEASONS,key))return;mode=key;try{localStorage.setItem(STORAGE_KEY,key);}catch{ /* Keep the selected preview in memory. */ }refresh();onChange();}
  refresh();
  return {
    select,
    current(date,cold){
      const month=date.getMonth();
      const calendar=month<2||month===11?'winter':month<5?'spring':month<8?'summer':'autumn';
      resolved=cold?'winter':mode==='auto'?calendar:mode;
      const overridden=cold&&mode!=='auto'&&mode!=='winter';
      if(overridden!==wasOverridden){status.hidden=!overridden;status.textContent=overridden?'低温天气下显示冬季树景':'';wasOverridden=overridden;}
      return resolved;
    },
    snapshot:()=>({mode,resolved}),
  };
}
