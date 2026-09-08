import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const CYAN = 0x00b5ff, PINK = 0xff05bd, GOLD = 0xffb344;
export const bumperPoints = [[-1.5,-3.5],[1.5,-3.5],[0,-1.6]];
export type Point = [number,number,number];
const v = (p:Point) => new T.Vector3(...p);
export const rampPaths = [
  new T.CatmullRomCurve3([[3.4,.28,2.4],[4.4,.4,1.7],...Array.from({length:17},(_,i)=>{const a=i/16*Math.PI*2;return [3.45+Math.cos(a)*1.0,.45+i/16*.6,.1-Math.sin(a)*1.2]}),[4.4,1.0,-1.3],...Array.from({length:33},(_,i)=>{const a=i/32*Math.PI*2;return [3.1+Math.cos(a)*1.02,2.2+i/32*.7,-3.7-Math.sin(a)*1.0]}),[4.1,2.4,-5.1],[2.8,1.9,-6.8],[.3,.5,-7.1]].map(p=>v(p as Point))),
  new T.CatmullRomCurve3([[-3.2,.28,3.9],[-4.0,.55,1.7],[-2.2,1.15,.3],[-2.0,1.6,2.8],[-3.4,2.0,3.2],[-4.2,2.3,.9],[-3.8,2.4,-2],[-4.4,2.2,-5.0],[-2.8,1.4,-7],[-1.3,.5,-6.5]].map(p=>v(p as Point)))
];
export interface SceneAPI {
  update: (dt:number,time:number,balls:{x:number;z:number;y?:number}[],left:number,right:number,energy:number)=>void;
  flash:(x:number,z:number,color?:number)=>void;
  resize:()=>void; destroy:()=>void; setCamera:(mode:number)=>void; setQuality:(high:boolean)=>void;
  renderer:T.WebGLRenderer;
}
export function createScene(canvas:HTMLCanvasElement):SceneAPI {
  const scene=new T.Scene(); scene.background=new T.Color(0x03020c); scene.fog=new T.FogExp2(0x03020c,0);
  const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.35)); renderer.toneMapping=T.ACESFilmicToneMapping; renderer.toneMappingExposure=.9;
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=T.PCFSoftShadowMap;
  const camera=new T.PerspectiveCamera(45,1,.1,180);
  const composer=new EffectComposer(renderer); composer.addPass(new RenderPass(scene,camera));
  const bloom=new UnrealBloomPass(new T.Vector2(1024,768),.30,.26,.62); composer.addPass(bloom); composer.addPass(new OutputPass());const fxaa=new ShaderPass(FXAAShader);composer.addPass(fxaa);
  const resources:{dispose:()=>void}[]=[];
  const texLoader=new T.TextureLoader();let disposed=false;
  const chromeTexture=texLoader.load('/chrome.png');chromeTexture.colorSpace=T.SRGBColorSpace;chromeTexture.wrapS=chromeTexture.wrapT=T.RepeatWrapping;chromeTexture.anisotropy=4;resources.push(chromeTexture);
  const envScene=new T.Scene();envScene.background=new T.Color(0x262337);
  for(let i=0;i<12;i++){
    const mat=new T.MeshBasicMaterial({color:[0xffffff,0xff109c,0x03bbff,0xffb93d][i%4]});
    const m=new T.Mesh(new T.BoxGeometry(i%2?.8:4,14,.15),mat);
    const a=i/12*Math.PI*2; m.position.set(Math.sin(a)*13,3,Math.cos(a)*13);m.lookAt(0,0,0);envScene.add(m);
  }
  const pmrem=new T.PMREMGenerator(renderer);const env=pmrem.fromScene(envScene,.08);scene.environment=env.texture;resources.push(env,pmrem);
  envScene.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();(o.material as T.Material).dispose()}});
  const metal=new T.MeshStandardMaterial({color:0xb0b4c2,metalness:1,roughness:.17,envMapIntensity:2.4});
  const dark=new T.MeshStandardMaterial({map:chromeTexture,color:0xb0a9c0,metalness:.72,roughness:.27,envMapIntensity:1.1});
  metal.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor + sin(vViewPosition.y*190.0+sin(vViewPosition.x*70.0))*0.022,0.06,0.9);`)};
  const gold=new T.MeshStandardMaterial({color:0xe3b55a,metalness:1,roughness:.18,envMapIntensity:1.6});
  
  const glow=(color:number,power=1.45)=>new T.MeshBasicMaterial({color:new T.Color(color).multiplyScalar(power),toneMapped:false});
  const cyan=glow(CYAN),pink=glow(PINK),amber=glow(GOLD,1.15),white=glow(0xadf0ff,1.4);
  function mesh(g:T.BufferGeometry,m:T.Material,x=0,y=0,z=0,parent:T.Object3D=scene){const o=new T.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
  function box(w:number,h:number,d:number,m:T.Material,x:number,y:number,z:number,parent:T.Object3D=scene){return mesh(new T.BoxGeometry(w,h,d),m,x,y,z,parent)}
  function tube(points:Point[],r:number,m:T.Material,parent:T.Object3D=scene,closed=false){const c=new T.CatmullRomCurve3(points.map(v),closed);return mesh(new T.TubeGeometry(c,Math.max(32,Math.min(220,points.length*6)),r,8,closed),m,0,0,0,parent)}
  function line(a:Point,b:Point,r:number,m:T.Material,parent:T.Object3D=scene){const delta=v(b).sub(v(a));const o=mesh(new T.CylinderGeometry(r,r,delta.length(),10),m,0,0,0,parent);o.position.copy(v(a).add(v(b)).multiplyScalar(.5));o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return o}
  function ring(r:number,t:number,m:T.Material,x:number,y:number,z:number,parent:T.Object3D=scene){const o=mesh(new T.TorusGeometry(r,t,8,48),m,x,y,z,parent);o.rotation.x=-Math.PI/2;return o}
  function post(x:number,z:number,h=.7){mesh(new T.CylinderGeometry(.13,.18,h,12),metal,x,h/2,z);ring(.16,.037,gold,x,h,z);mesh(new T.SphereGeometry(.115,12,8),metal,x,h+.06,z);box(.06,h*.65,.075,cyan,x,h*.5,z+.13)}
  function label(text:string,x:number,y:number,z:number,w:number,h:number,color='#28e7ff',flat=false){
    const c=document.createElement('canvas');c.width=512;c.height=256;const q=c.getContext('2d')!;
    q.fillStyle='#020918';q.fillRect(0,0,512,256);q.strokeStyle=color;q.lineWidth=4;q.strokeRect(8,8,496,240);
    q.shadowColor=color;q.shadowBlur=5;q.fillStyle=color;q.textAlign='center';q.textBaseline='middle';
    const lines=text.split('\n');const font=Math.min(lines.length>1?96:118,470/(Math.max(...lines.map(l=>l.length))*.61));q.font=`bold ${font}px monospace`;
    lines.forEach((s,i)=>q.fillText(s,256,128+(i-(lines.length-1)/2)*102));const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;resources.push(texture);
    const m=new T.MeshBasicMaterial({map:texture});const p=mesh(new T.PlaneGeometry(w,h),m,x,y,z);if(flat)p.rotation.x=-Math.PI/2;else p.rotation.x=-.3;return p;
  }
  // Deep lacquer and subtle etched metal, with image-authored silkscreen artwork.
  const boardTex=texLoader.load('/playfield.png');boardTex.colorSpace=T.SRGBColorSpace;boardTex.anisotropy=renderer.capabilities.getMaxAnisotropy();resources.push(boardTex);
  const baseTex=boardTex.clone();baseTex.repeat.set(1,.30);baseTex.offset.set(0,.70);baseTex.needsUpdate=true;resources.push(baseTex);
  const boardMat=new T.MeshStandardMaterial({map:baseTex,emissiveMap:baseTex,emissive:0xffffff,emissiveIntensity:.06,color:0x92929f,metalness:.32,roughness:.25,envMapIntensity:.12});
  box(11,.7,21,dark,0,-.45,0);const board=mesh(new T.PlaneGeometry(10.4,20.5),boardMat,0,-.07,0);board.rotation.x=-Math.PI/2;
  const mask=document.createElement('canvas');mask.width=256;mask.height=256;const mq=mask.getContext('2d')!;const mg=mq.createRadialGradient(128,128,64,128,128,150);mg.addColorStop(0,'white');mg.addColorStop(1,'black');mq.fillStyle=mg;mq.fillRect(0,0,256,256);const mt=new T.CanvasTexture(mask);resources.push(mt);
  const artMat=new T.MeshStandardMaterial({map:boardTex,emissiveMap:boardTex,emissive:0xffffff,emissiveIntensity:.45,metalness:.25,roughness:.24,envMapIntensity:.1,transparent:true,alphaMap:mt,depthWrite:false});
  const decal=mesh(new T.PlaneGeometry(5.5,5.6),artMat,0,-.049,2.6);decal.rotation.x=-Math.PI/2;
  box(11.4,1,1.0,metal,0,-.2,10.5);box(10.8,.12,.4,dark,0,.33,10.3);
  for(const s of [-1,1]){
    box(.52,1.12,21.8,dark,s*5.5,.02,0);
    box(.12,.16,21.6,dark,s*5.65,.62,0);
    box(.10,.10,21.4,cyan,s*5.28,.54,0);
    box(.075,.1,21.7,pink,s*5.68,.44,0);
    for(let z=-10;z<10;z+=.9){mesh(new T.CylinderGeometry(.048,.048,.05,8),gold,s*5.47,.6,z)}
    tube([[s*4.6,.22,-8.4],[s*5,.22,-7],[s*4.95,.22,-2],[s*4.9,.22,4.8],[s*3.8,.22,7.6],[s*1.1,.22,9.3]],.10,metal);
    tube([[s*4.63,.30,-8.4],[s*5.02,.30,-7],[s*4.97,.30,-2],[s*4.92,.30,4.8],[s*3.82,.30,7.6],[s*1.13,.30,9.3]],.035,cyan);
    tube([[s*4.3,.32,3.5],[s*4.4,.32,5.7],[s*3.35,.32,7.15],[s*1.95,.32,7.85]],.115,metal);
    tube([[s*4.3,.42,3.5],[s*4.4,.42,5.7],[s*3.35,.42,7.15],[s*1.95,.42,7.85]],.032,pink);
  }
  // Raised spiral wireforms: a shaped metal trough, clear inlays and paired guardrails.
  rampPaths.forEach((path,idx)=>{
    const samples=path.getPoints(110);const colors=idx?pink:cyan;
    const channelMaterial=new T.MeshStandardMaterial({map:chromeTexture,color:0xd4c3e0,metalness:.65,roughness:.22,envMapIntensity:1.8});
    tube(samples.map(p=>[p.x,p.y-.22,p.z] as Point),.28,channelMaterial);
    for(let j=3;j<108;j+=5){const p=samples[j],d=path.getTangent(j/110),side=new T.Vector3(-d.z,0,d.x).normalize();line([p.x-side.x*.38,p.y-.13,p.z-side.z*.38],[p.x+side.x*.38,p.y-.13,p.z+side.z*.38],.035,metal)}
    const troughMat=new T.MeshPhysicalMaterial({map:chromeTexture,color:idx?0x170716:0x061628,metalness:.9,roughness:.16,clearcoat:1,side:T.DoubleSide});
    const verts:number[]=[];const norms:number[]=[];const uvs:number[]=[];const indices:number[]=[];
    samples.forEach((p,i)=>{const tangent=path.getTangent(i/110);const side=new T.Vector3(-tangent.z,0,tangent.x).normalize();for(const s of [-1,1]){const p2=p.clone().addScaledVector(side,s*.37);verts.push(p2.x,p2.y-.12,p2.z);norms.push(0,1,0);uvs.push((s+1)/2,i/110*3)}if(i<110){const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2)}});
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(verts,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(norms,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);mesh(geometry,troughMat);
    for(const s of [-1,1])for(const h of [0,.33,.58]){
      const pts=samples.map((p,i)=>{const d=path.getTangent(i/110);const side=new T.Vector3(-d.z,0,d.x).normalize();const pt=p.clone().addScaledVector(side,s*.42);pt.y+=h;return [pt.x,pt.y,pt.z] as Point});tube(pts,h===0?.046:.052,h===0?colors:metal);
    }
    for(let i=3;i<107;i+=6){const p=samples[i];const d=path.getTangent(i/110);const side=new T.Vector3(-d.z,0,d.x).normalize();for(const s of [-1,1]){const p1=p.clone().addScaledVector(side,s*.42);line([p1.x,p1.y,p1.z],[p1.x,p1.y+.61,p1.z],.038,gold)}if(i%12===3){line([p.x,.05,p.z],[p.x,p.y-.1,p.z],.065,metal);ring(.13,.04,amber,p.x,.13,p.z)}}
  });
  const poolCanvas=document.createElement('canvas');poolCanvas.width=128;poolCanvas.height=128;const pc=poolCanvas.getContext('2d')!;const pg=pc.createRadialGradient(64,64,0,64,64,64);pg.addColorStop(0,'rgba(255,255,255,1)');pg.addColorStop(.25,'rgba(255,255,255,.4)');pg.addColorStop(1,'rgba(255,255,255,0)');pc.fillStyle=pg;pc.fillRect(0,0,128,128);const poolMap=new T.CanvasTexture(poolCanvas);resources.push(poolMap);
  for(const [x,z,c,size]of [[-1.5,-3.5,PINK,2.5],[1.5,-3.5,PINK,2.5],[0,-1.6,PINK,2.5],[3.4,.5,CYAN,3],[-3.3,1,CYAN,2.5],[0,-7.4,CYAN,3],[-2.5,-5.4,PINK,2]]){const pm=new T.MeshBasicMaterial({map:poolMap,color:c,transparent:true,opacity:.25,blending:T.AdditiveBlending,depthWrite:false});const p=mesh(new T.PlaneGeometry(size,size),pm,x,.006,z);p.rotation.x=-Math.PI/2;p.castShadow=false}
  // Back portal, nested illuminated rings with actual depth.
  box(10.7,3.8,.6,dark,0,1.7,-10.2);
  tube([[-5.1,3.7,-10],[0,4.45,-10],[5.1,3.7,-10]],.12,metal);tube([[-5.1,3.6,-9.94],[0,4.35,-9.94],[5.1,3.6,-9.94]],.027,cyan);
  const portal=new T.Group();scene.add(portal);
  function arch(cx:number,z:number,width:number,height:number,m:T.Material,r:number,parent:T.Object3D=scene){
    const pts:Point[]=[[cx-width,.08,z],[cx-width,height-width,z]];
    for(let j=0;j<=24;j++){const a=Math.PI-j/24*Math.PI;pts.push([cx+Math.cos(a)*width,height-width+Math.sin(a)*width,z])}
    pts.push([cx+width,.08,z]);return tube(pts,r,m,parent);
  }
  for(let i=0;i<7;i++){
    const z=-7.45-i*.47,w=1.42*Math.pow(.855,i),h=3.7*Math.pow(.855,i);
    arch(0,z,w,h,metal,.15,portal);arch(0,z+.10,w-.065,h-.055,i>=4?pink:cyan,.047,portal);
    for(const side of [-1,1]){box(.23,.33,.23,gold,side*w,.17,z,portal);box(.07,h*.4,.10,cyan,side*w,h*.22,z+.15,portal)}
  }
  for(const side of [-1,1]){box(.26,2.2,2.6,dark,side*1.5,1.12,-8.7,portal);box(.13,1.7,.3,metal,side*1.6,.85,-7.4,portal);ring(.23,.035,amber,side*1.6,.11,-7.4,portal)}
  const voidMat=new T.MeshBasicMaterial({color:0x01000a});box(2.1,2.2,.12,voidMat,0,1.1,-11.2,portal);mesh(new T.TorusGeometry(.44,.055,10,48),pink,0,.64,-10.4,portal);
  for(let i=0;i<4;i++){
    const z=-5.1-i*.35;arch(-2.52,z,.64-i*.025,2.15-i*.075,metal,.11);arch(-2.52,z+.1,.59-i*.025,2.12-i*.075,pink,.036);
  }
  box(1.35,.12,1.55,dark,-2.52,.18,-5.4);box(1.2,.035,1.5,new T.MeshStandardMaterial({color:0x250521,metalness:.8,roughness:.17,emissive:0xff0088,emissiveIntensity:.15}),-2.52,.27,-5.4);
  for(let j=0;j<3;j++){const z=-6.9+j*.8;tube([[-.25,.10,z+.16],[0,.10,z-.19],[.25,.10,z+.16]],.035,j===2?pink:amber)}
  label('NEXT DIMENSION',0,2.35,-10,1.45,.65);label('WARP\nGATE',-2.75,2.2,-7.3,1.38,.9);label('ORBIT\nBONUS',4.05,1.25,-.1,1.26,.8);
  label('SKILL\nSHOT',-3.76,1.05,3.65,1.22,.78);label('LOCK  ◇ ◇ ◇',3.3,.55,4.2,1.42,.48,'#ff33dc',true);
  // Pop bumpers: turned chrome assemblies with concentric rings and glass caps.
  
  const fallbackBumpers:T.Group[]=[];
  bumperPoints.forEach(([x,z])=>{
    const group=new T.Group();group.userData.assetFallback=true;fallbackBumpers.push(group);group.position.set(x,0,z);scene.add(group);
    mesh(new T.CylinderGeometry(.61,.7,.25,48),dark,0,.125,0,group);
    ring(.61,.055,amber,0,.22,0,group);mesh(new T.CylinderGeometry(.41,.48,.47,32),metal,0,.40,0,group);
    ring(.47,.06,cyan,0,.33,0,group);mesh(new T.CylinderGeometry(.62,.42,.13,48),gold,0,.65,0,group);
    mesh(new T.CylinderGeometry(.60,.57,.13,48),new T.MeshPhysicalMaterial({color:0x580652,emissive:0xbc008b,emissiveIntensity:.5,metalness:.5,roughness:.14,clearcoat:1}),0,.76,0,group);
    ring(.56,.06,pink,0,.75,0,group);ring(.32,.027,white,0,.87,0,group);
    mesh(new T.SphereGeometry(.16,20,12),pink,0,.96,0,group);
    for(let j=0;j<4;j++)ring(.43,.018,metal,0,.35+j*.075,0,group);
    tube([[-.20,.90,0],[0,.90,-.28],[.20,.90,0],[0,.90,.28],[-.20,.90,0]],.024,white,group);
    for(let i=0;i<6;i++){const a=i*Math.PI/3;mesh(new T.SphereGeometry(.045,8,6),metal,Math.sin(a)*.56,.85,Math.cos(a)*.56,group)}
  });
  // Slingshots, inlanes and precise flipper hardware.
  for(const s of [-1,1]){
    const pts:Point[]=[[s*2.78,.22,4.2],[s*3.2,.22,6.45],[s*2.35,.22,5.94],[s*2.78,.22,4.2]];
    const sh=new T.Shape();sh.moveTo(s*2.78,4.2);sh.lineTo(s*3.2,6.45);sh.lineTo(s*2.35,5.94);sh.closePath();const g=new T.ExtrudeGeometry(sh,{depth:.28,bevelEnabled:true,bevelThickness:.10,bevelSize:.12,bevelSegments:3,steps:1});g.rotateX(Math.PI/2);mesh(g,metal,0,.48,0);
    tube(pts,.115,metal);tube(pts.map(p=>[p[0],.42,p[2]]),.055,pink);
    tube([[s*2.78,.45,4.6],[s*3.03,.45,6.1],[s*2.43,.45,5.86],[s*2.78,.45,4.6]],.025,white);
    [[s*2.8,4.12],[s*3.23,6.53],[s*2.30,5.94],[s*4.2,3.2],[s*4.6,-4.1]].forEach(([x,z])=>post(x,z,.63));
    for(let j=0;j<3;j++){const x=s*(1.38+j*.44),z=5.1-j*1.0;tube([[x-.16,.06,z+.2],[x,.06,z-.22],[x+.16,.06,z+.2],[x-.16,.06,z+.2]],.031,j===1?pink:cyan)}
  }
  for(const s of [-1,1]){
    label('BOOST',s*2.7,.615,5.62,.85,.26,'#ff22cf',true);
    for(let j=0;j<3;j++)tube([[s*2.5,.63,5.15+j*.19],[s*2.8,.63,5.02+j*.19],[s*3.0,.63,5.15+j*.19]],.026,pink);
    for(let j=0;j<2;j++){
      const z=-6.5+j*1.3;box(.45,.52,.13,dark,s*1.9,.33,z);box(.32,.26,.025,j?pink:cyan,s*1.9,.43,z+.08);
      line([s*1.35,.11,z+.2],[s*2.08,.11,z+.2],.028,gold);
    }
    label(s<0?'SYNTH SPINS':'DRIVE LOOP',s*4.1,.03,6.2,.64,.4,'#ff22cf',true);
  }
  const flippers:T.Group[]=[];
  for(const s of [-1,1]){
    const group=new T.Group();group.position.set(s*2.22,.30,7.3);scene.add(group);flippers.push(group);
    mesh(new T.CylinderGeometry(.33,.38,.4,24),gold,0,-.12,0,group);
    const shape=new T.Shape();shape.absarc(0,0,.25,Math.PI/2,Math.PI*1.5,false);shape.lineTo(1.72,-.16);shape.absarc(1.72,0,.16,-Math.PI/2,Math.PI/2,false);shape.lineTo(0,.25);
    const geom=new T.ExtrudeGeometry(shape,{depth:.21,bevelEnabled:true,bevelThickness:.09,bevelSize:.06,bevelSegments:3,steps:1});geom.rotateX(-Math.PI/2);mesh(geom,metal,0,0,0,group);
    line([.05,.29,0],[1.7,.29,0],.082,pink,group);line([.05,.37,0],[1.7,.37,0],.022,white,group);
    ring(.12,.035,cyan,0,.36,0,group);
    group.rotation.y=s<0?-.34:Math.PI+.34;
  }
  // Lit targets, posts, lane inserts and the multiball medallion.
  ring(.97,.024,pink,0,.025,.7);ring(.89,.015,cyan,0,.035,.7);
  label('MULTIBALL',0,.04,1.05,1.57,.4,'#ff2edb',true);
  for(let i=0;i<5;i++)ring(.12+i*.1,.012,cyan,0,.045,.5);
  for(const s of [-1,1])for(let i=0;i<4;i++){
    const x=s*(2.25+.18*Math.sin(i)),z=-5.6+i*1.5;post(x,z,.45);
    const disc=ring(.16,.045,i%2?pink:amber,x,.10,z+.35);disc.castShadow=false;
  }
  for(let i=0;i<4;i++){
    label(['SUPER','EXTRA','MEGA','ULTRA'][i],0,.015,5.0+i*.43,1.65,.27,'#ffcf55',true);
    mesh(new T.SphereGeometry(.075,12,8),i===3?cyan:pink,-.7,.08,5+i*.43);
  }
  label('NEON TUNNEL',0,.1,9.58,3.6,.5,'#2ce8ff',true);
  for(const side of [-1,1]){
    for(let i=0;i<8;i++){
      const z=-7.4+i*1.35,x=side*(4.57-Math.sin(i*.4)*.18);
      mesh(new T.CylinderGeometry(.19,.24,.12,16),gold,x,.16,z);
      mesh(new T.CylinderGeometry(.085,.09,.85,12),metal,x,.57,z);
      ring(.11,.038,amber,x,.94,z);mesh(new T.SphereGeometry(.13,16,8),metal,x,1.01,z);
      line([x,.4,z],[x-side*.42,.4,z],.07,metal);
    }
    for(let i=0;i<6;i++){const z=-7.5+i*2.0;box(.28,.08,.30,amber,side*5.1,.20,z)}
    tube([[side*5.0,.16,5.1],[side*4.2,.16,7.2],[side*2.4,.16,8.2]],.14,metal);
    tube([[side*5.0,.25,5.1],[side*4.2,.25,7.2],[side*2.4,.25,8.2]],.06,cyan);
  }
  // Sculpted shooter lane and spring plunger.
  tube([[4.6,.13,8.8],[4.76,.13,5],[4.78,.13,-5],[4.2,.13,-8.2],[2.4,.13,-9],[.4,.13,-8.5]],.07,metal);
  for(let i=0;i<16;i++)ring(.16,.025,metal,4.6,.3,8.9+i*.045).rotation.x=0;
  box(.14,.14,1,metal,4.6,.3,9.4);mesh(new T.SphereGeometry(.26,24,16),cyan,4.6,.3,9.9);
  // Surrounding arcade uses the supplied art on inset illuminated wall panels.
  for(const s of [-1,1]){
    const tex=texLoader.load('/reference.png');tex.colorSpace=T.SRGBColorSpace;tex.repeat.set(.195,.36);tex.offset.set(s<0?.015:.79,.56);resources.push(tex);
    const art=mesh(new T.PlaneGeometry(7.4,8),new T.MeshBasicMaterial({map:tex}),s*8.9,3.3,-2.7);art.rotation.y=-s*.12;
    for(const yy of [-.75,7.35])line([s*5.6,yy,-7.45],[s*12.2,yy,-7.45],.035,cyan);
    for(let i=0;i<5;i++){line([s*6,-1.1,-8+i*4],[s*16,-1.1,-8+i*4],.018,new T.MeshBasicMaterial({color:i%2?0x330927:0x073047}))}
  }
  const floor=mesh(new T.PlaneGeometry(150,150),new T.MeshStandardMaterial({color:0x030512,metalness:.75,roughness:.28}),0,-1.2,0);floor.rotation.x=-Math.PI/2;
  const light=new T.HemisphereLight(0xa9c5ff,0x25102d,.6);scene.add(light);
  const key=new T.DirectionalLight(0xc3dcff,1.8);key.position.set(-4,14,8);scene.add(key);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-10;key.shadow.camera.right=10;key.shadow.camera.top=12;key.shadow.camera.bottom=-12;key.shadow.bias=-.0004;
  [[-4,3,-2,CYAN,14],[4,3,-3,PINK,14],[0,3,-8,CYAN,10],[-3,2,6,PINK,8],[3,2,6,CYAN,10]].forEach(([x,y,z,c,p])=>{const l=new T.PointLight(c,p,12,2);l.position.set(x,y,z);scene.add(l)});
  const ballMat=new T.MeshStandardMaterial({color:0xffffff,metalness:1,roughness:.07,envMapIntensity:2});
  const ballMeshes=Array.from({length:4},()=>{const b=mesh(new T.SphereGeometry(.235,32,24),ballMat);b.visible=false;return b});
  const flashes:Array<{mesh:T.Mesh;life:number}>=[];
  let mode=0,high=true;
  function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);composer.setSize(w,h);fxaa.uniforms.resolution.value.set(1/(w*renderer.getPixelRatio()),1/(h*renderer.getPixelRatio()));camera.aspect=w/h;const narrow=w/h<.85;scene.scale.set(1.48,1,1.12);scene.position.z=.9;camera.fov=narrow?51:35.5;camera.position.set(mode===1?3.4:0,narrow?24:17.2,narrow?24:20.0);camera.lookAt(0,0,narrow?-.3:.1);if(mode===2){camera.position.set(0,narrow?32:31,.1);camera.lookAt(0,0,0);camera.fov=43}camera.updateProjectionMatrix()}
  // Batch static cabinet hardware by material; the physical flippers and balls stay independent.
  scene.updateMatrixWorld(true);
  const batches=new Map<T.Material,T.Mesh[]>();
  scene.traverse(o=>{if(!(o instanceof T.Mesh)||Array.isArray(o.material)||ballMeshes.includes(o))return;let parent:T.Object3D|null=o;while(parent){if(flippers.includes(parent as T.Group)||parent.userData.assetFallback)return;parent=parent.parent}if(!o.geometry.getAttribute('uv'))return;const batch=batches.get(o.material)||[];batch.push(o);batches.set(o.material,batch)});
  for(const [material,objects]of batches){if(objects.length<2)continue;const gs=objects.map(o=>{const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);return g});const merged=mergeGeometries(gs,false);if(merged){const m=new T.Mesh(merged,material);m.castShadow=true;m.receiveShadow=true;scene.add(m);objects.forEach(o=>{o.removeFromParent();o.geometry.dispose()})}gs.forEach(g=>g.dispose())}
  const ballEnv=new T.WebGLCubeRenderTarget(128,{generateMipmaps:true,minFilter:T.LinearMipmapLinearFilter});const cubeCamera=new T.CubeCamera(.1,70,ballEnv);cubeCamera.position.set(0,1.8,.5);cubeCamera.update(renderer,scene);ballMat.envMap=ballEnv.texture;ballMat.envMapIntensity=1.6;metal.envMap=ballEnv.texture;metal.envMapIntensity=1.3;gold.envMap=ballEnv.texture;gold.envMapIntensity=1.8;resources.push(ballEnv);
  const artEnvironment=texLoader.load('/reference.png',()=>{if(!disposed){scene.environment=artEnvironment;metal.envMap=null;metal.envMapIntensity=1.6;gold.envMap=null;gold.envMapIntensity=1.8;metal.needsUpdate=true;gold.needsUpdate=true}});artEnvironment.mapping=T.EquirectangularReflectionMapping;artEnvironment.colorSpace=T.SRGBColorSpace;resources.push(artEnvironment);
  scene.scale.set(1.48,1,1.12);scene.position.z=.9;
  new GLTFLoader().load('/bumper.glb',loaded=>{
    if(disposed){loaded.scene.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>m.dispose())}});return}
    loaded.scene.updateMatrixWorld(true);const groups=new Map<T.Material,T.BufferGeometry[]>();
    loaded.scene.traverse(o=>{if(!(o instanceof T.Mesh)||Array.isArray(o.material))return;
      const mat=o.material as T.MeshPhysicalMaterial;if(mat.name==='Pink luminous perimeter'){mat.emissive.setHex(PINK);mat.emissiveIntensity=3;}if(mat.name==='Rose optical acrylic'){mat.emissive.setHex(0xb400ad);mat.emissiveIntensity=.65;mat.transmission=.12;}if(mat.name==='Rose etched index'){mat.emissive.setHex(0xff5cdf);mat.emissiveIntensity=.6;}if(mat.metalness>.6){mat.envMap=env.texture;mat.envMapIntensity=1.8}
      for(const [x,z]of bumperPoints){const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);g.translate(x,0,z);for(const attr of Object.keys(g.attributes))if(!['position','normal'].includes(attr))g.deleteAttribute(attr);const list=groups.get(mat)||[];list.push(g);groups.set(mat,list)}
    });
    for(const [mat,gs]of groups){const g=mergeGeometries(gs,false);if(g)mesh(g,mat);gs.forEach(g=>g.dispose())}
    for(const fallback of fallbackBumpers){fallback.removeFromParent();fallback.traverse(o=>{if(o instanceof T.Mesh)o.geometry.dispose()})}
    loaded.scene.traverse(o=>{if(o instanceof T.Mesh)o.geometry.dispose()});
    for(const [x,z]of bumperPoints){ring(.585,.021,pink,x,.88,z);tube([[x-.22,1.035,z],[x,1.035,z-.30],[x+.22,1.035,z],[x,1.035,z+.30],[x-.22,1.035,z]],.017,white)}
    renderer.shadowMap.needsUpdate=true;
  },undefined,()=>{console.warn('Detailed bumper asset unavailable; using the built-in bumper model.');});
  renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
  resize();window.addEventListener('resize',resize);
  return {renderer,resize,setCamera(m){mode=m;resize()},setQuality(h){high=h;renderer.setPixelRatio(Math.min(devicePixelRatio,h?1.35:1));renderer.shadowMap.enabled=h;resize()},
    flash(x,z,color=PINK){const m=mesh(new T.TorusGeometry(.3,.025,6,24),new T.MeshBasicMaterial({color,transparent:true,opacity:1}),x,.15,z);m.rotation.x=-Math.PI/2;flashes.push({mesh:m,life:1})},
    update(dt,time,balls,left,right,energy){flippers[0].rotation.y=-.34+left*.85;flippers[1].rotation.y=Math.PI+.34-right*.85;
      ballMeshes.forEach((m,i)=>{m.visible=!!balls[i];if(balls[i]){m.position.set(balls[i].x,balls[i].y??.235,balls[i].z);m.rotation.x+=dt*5}});
      
      
      for(let i=flashes.length-1;i>=0;i--){const f=flashes[i];f.life-=dt*2.2;f.mesh.scale.setScalar(1+(1-f.life)*5);(f.mesh.material as T.MeshBasicMaterial).opacity=Math.max(0,f.life);if(f.life<=0){scene.remove(f.mesh);f.mesh.geometry.dispose();(f.mesh.material as T.Material).dispose();flashes.splice(i,1)}}
      bloom.strength=.30+energy*.05;
      if(high)composer.render();else renderer.render(scene,camera);
    },destroy(){disposed=true;window.removeEventListener('resize',resize);scene.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose())}});resources.forEach(r=>r.dispose());composer.passes.forEach(p=>p.dispose());composer.dispose();renderer.dispose()}
  };
}
