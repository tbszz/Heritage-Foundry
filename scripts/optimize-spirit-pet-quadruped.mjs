#!/usr/bin/env node
// Separate output: never overwrites the currently deployed spirit-pet asset.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, stat, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT,'artifacts/spirit-pet/heritage-082');
const SOURCE = path.join(DIR,'quadruped.raw.glb');
const DEST = path.join(ROOT,'public/models/spirit-pet/shandong-tiger-quad.glb');
const LEGACY = path.join(ROOT,'public/models/spirit-pet/shandong-tiger.glb');
const hash = async p => createHash('sha256').update(await readFile(p)).digest('hex');
const legacyBefore = await hash(LEGACY);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(SOURCE);
// Blender's frame 1 is 1/30s. glTF clips must begin at zero for a clean repeat.
const times = new Set();
for (const animation of doc.getRoot().listAnimations()) {
  const start = Math.min(...animation.listSamplers().map(s=>s.getInput().getMin([])[0]));
  for (const sampler of animation.listSamplers()) {
    const input = sampler.getInput();
    if (times.has(input)) continue;
    times.add(input);
    input.setArray(Float32Array.from(input.getArray(),v=>Math.max(0,v-start)));
  }
}
await doc.transform(dedup(),prune({keepAttributes:true}),textureCompress({
  encoder:sharp,targetFormat:'webp',quality:85,resize:[2048,2048]
}));
await mkdir(path.dirname(DEST),{recursive:true});
await io.write(DEST,doc);
// Validate the serialized asset, including final sampler/accessor data.
const final = await io.read(DEST);
const root=final.getRoot();
const bytes=(await stat(DEST)).size;
assert(bytes<3_000_000,'Final asset must be <3 MB (decimal)');
assert.equal(await hash(LEGACY),legacyBefore,'Legacy pet changed');
assert(!root.listExtensionsUsed().some(e=>e.extensionName==='KHR_draco_mesh_compression'));
assert.deepEqual(root.listAnimations().map(a=>a.getName()).sort(),['idle','run','walk']);
const textures=[];
for(const texture of root.listTextures()){
  const m=await sharp(texture.getImage()).metadata();
  assert.equal(m.format,'webp');
  assert(m.width<=2048&&m.height<=2048);
  textures.push({name:texture.getName(),format:m.format,width:m.width,height:m.height,bytes:texture.getImage().length});
}
const clips=[];
for(const animation of root.listAnimations()){
  let start=Infinity,end=0,maxLoopError=0;
  const animated=new Set();
  for(const channel of animation.listChannels()){
    const s=channel.getSampler(),input=s.getInput(),output=s.getOutput();
    start=Math.min(start,input.getMin([])[0]);
    end=Math.max(end,input.getMax([])[0]);
    const a=output.getArray(),size=output.getElementSize();
    const first=Array.from(a.slice(0,size)),last=Array.from(a.slice(-size));
    const sign=channel.getTargetPath()==='rotation'&&first.reduce((sum,v,i)=>sum+v*last[i],0)<0?-1:1;
    maxLoopError=Math.max(maxLoopError,...first.map((v,i)=>Math.abs(v-last[i]*sign)));
    let variance=0;
    for(let i=size;i<a.length;i++)variance=Math.max(variance,Math.abs(a[i]-a[i%size]));
    if(variance>1e-5)animated.add(channel.getTargetNode().getName());
    if(channel.getTargetNode().getName()==='root') assert(variance<1e-6,'Root motion found');
  }
  assert(start<1e-6);
  assert(maxLoopError<2e-5,`${animation.getName()} loop mismatch ${maxLoopError}`);
  if(animation.getName()!=='idle')for(const leg of ['fore.L','fore.R','hind.L','hind.R']){
    for(const part of ['upper','lower'])assert(animated.has(leg+'.'+part),`Missing motion ${leg}.${part}`);
  }
  clips.push({name:animation.getName(),duration:end,start,channels:animation.listChannels().length,maxLoopError,animatedBones:[...animated]});
}
let maxWeightError=0,vertices=0;
for(const mesh of root.listMeshes())for(const primitive of mesh.listPrimitives()){
  const weights=primitive.getAttribute('WEIGHTS_0');
  const joints=primitive.getAttribute('JOINTS_0');
  assert(weights&&joints,'Missing skin attributes');
  const a=weights.getArray();
  vertices+=weights.getCount();
  for(let i=0;i<a.length;i+=4){
    const sum=a[i]+a[i+1]+a[i+2]+a[i+3];
    maxWeightError=Math.max(maxWeightError,Math.abs(sum-1));
    assert(a.slice(i,i+4).every(v=>Number.isFinite(v)&&v>=0&&v<=1));
  }
}
assert(maxWeightError<1e-5);
const report={file:path.relative(ROOT,DEST),bytes,megabytes:bytes/1e6,sha256:await hash(DEST),legacySha256:legacyBefore,
  clips,textures,vertices,joints:root.listSkins().map(s=>s.listJoints().length),maxWeightError,noDraco:true,forward:'+X',up:'+Y'};
await writeFile(path.join(DIR,'quad-glb-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
