#!/usr/bin/env node
// Exercise the actual final GLB with Three.js AnimationMixer and CPU skinning.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DIR=path.join(ROOT,'artifacts/spirit-pet/heritage-082');
const bytes=await fs.readFile(path.join(ROOT,'public/models/spirit-pet/shandong-tiger-quad.glb'));
const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
const offset=20+bytes.readUInt32LE(12);
const bin=bytes.subarray(offset+8,offset+8+bytes.readUInt32LE(offset));
// Omit only material/image resources in this headless CPU check. Skin + clips intact.
delete json.images;delete json.textures;delete json.samplers;delete json.materials;
for(const m of json.meshes)for(const p of m.primitives)delete p.material;
json.extensionsUsed=(json.extensionsUsed||[]).filter(x=>x!=='EXT_texture_webp');
json.extensionsRequired=(json.extensionsRequired||[]).filter(x=>x!=='EXT_texture_webp');
json.buffers[0].uri='data:application/octet-stream;base64,'+bin.toString('base64');
globalThis.ProgressEvent ??= class ProgressEvent {constructor(type,init){this.type=type;Object.assign(this,init);}};
const gltf=await new GLTFLoader().parseAsync(JSON.stringify(json),'');
const mesh=gltf.scene.getObjectByProperty('isSkinnedMesh',true);
assert(mesh);
gltf.scene.updateMatrixWorld(true);
const pos=mesh.geometry.attributes.position,weights=mesh.geometry.attributes.skinWeight,joints=mesh.geometry.attributes.skinIndex;
const pawSets={};
const keys=['fore.L','fore.R','hind.L','hind.R'];
const component=(attr,i,j)=>attr[['getX','getY','getZ','getW'][j]](i);
for(const key of keys){
  const joint=mesh.skeleton.bones.findIndex(b=>b.name===THREE.PropertyBinding.sanitizeNodeName(key+'.paw'));
  const ids=[];
  for(let i=0;i<pos.count;i++)for(let j=0;j<4;j++){
    const bindY=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld).y;
    if(component(joints,i,j)===joint&&component(weights,i,j)>.95&&bindY<.04)ids.push(i);
  }
  assert(ids.length>20,`Insufficient rigid paw vertices ${key}`);
  pawSets[key]=[...new Set(ids)];
}
const pt=new THREE.Vector3();
function skin(i){pt.fromBufferAttribute(pos,i);mesh.applyBoneTransform(i,pt);return pt.applyMatrix4(mesh.matrixWorld);}
const results=[];
for(const clip of gltf.animations){
  const mixer=new THREE.AnimationMixer(gltf.scene);
  const action=mixer.clipAction(clip);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
  const frames=[];let minY=Infinity,maxY=-Infinity;
  for(let frame=0;frame<=120;frame++){
    const time=clip.duration*frame/120;
    mixer.setTime(time);gltf.scene.updateMatrixWorld(true);mesh.skeleton.update();
    const paws={};
    for(const key of keys){
      const ids=pawSets[key];let y=Infinity,x=0,z=0;
      for(const id of ids){skin(id);assert(Number.isFinite(pt.x+pt.y+pt.z));y=Math.min(y,pt.y);x+=pt.x;z+=pt.z;}
      paws[key]={soleY:y,x:x/ids.length,z:z/ids.length};
    }
    for(let i=0;i<pos.count;i++){skin(i);assert(Number.isFinite(pt.x+pt.y+pt.z));minY=Math.min(minY,pt.y);maxY=Math.max(maxY,pt.y);}
    frames.push({time,paws});
  }
  const perLeg={};
  for(const key of keys){
    // Same phases as the rig script: walk is a diagonal trot, run a rotary gallop.
    const phase=clip.name==='run'?{'fore.L':0,'fore.R':.1,'hind.L':.5,'hind.R':.6}[key]:key==='fore.L'||key==='hind.R'?0:.5;
    const duty=clip.name==='walk'?.62:clip.name==='run'?.43:1;
    const samples=frames.filter((f,i)=>i<120&&((i/120+phase)%1)<duty).map(f=>f.paws[key]);
    perLeg[key]={vertices:pawSets[key].length,minSoleY:Math.min(...frames.map(f=>f.paws[key].soleY)),maxSoleY:Math.max(...frames.map(f=>f.paws[key].soleY)),stanceSoleRange:Math.max(...samples.map(p=>p.soleY))-Math.min(...samples.map(p=>p.soleY)),stride:Math.max(...frames.map(f=>f.paws[key].x))-Math.min(...frames.map(f=>f.paws[key].x))};
    assert(perLeg[key].stanceSoleRange<.003,`Contact instability ${clip.name} ${key}: ${JSON.stringify(perLeg[key])}`);
    if(clip.name!=='idle')assert(perLeg[key].stride>.065,`No visible paw stride ${key}`);
  }
  assert(minY>-.012,`Ground penetration ${clip.name} ${minY}`);
  assert(maxY<1,'Exploded mesh bounds');
  results.push({clip:clip.name,duration:clip.duration,samples:frames.length,minY,maxY,perLeg,frames});
  mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);
}
await fs.writeFile(path.join(DIR,'quad-three-validation.json'),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results.map(({frames,...r})=>r),null,2));
