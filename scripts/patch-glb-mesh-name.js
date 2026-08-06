// 一键改名 GLB 内 mesh 节点为 'texture-target'，对齐 KHR_materials_specular
// 让 AI 贴图链路能直接识别 Hunyuan 输出的 GLB
const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, '..', 'patch-result.log');
const logLines = [];
function log(msg) {
  logLines.push(msg);
  console.log(msg);
}

try {
  const target = path.join(__dirname, '..', 'public', 'models', process.argv[2] || 'chinese-knot-hunyuan.glb');
  log(`Patching: ${target}`);
  const buf = fs.readFileSync(target);

  const JSON_TAG = Buffer.from('JSON');
  const BIN_TAG = Buffer.from('BIN\u0000');

  const jsonChunkStart = buf.indexOf(JSON_TAG) - 4;
  const binChunkStart = buf.indexOf(BIN_TAG) - 4;
  if (jsonChunkStart < 0 || binChunkStart < 0) {
    throw new Error('不是有效的 GLB 文件');
  }

  const jsonChunkLength = buf.readUInt32LE(jsonChunkStart);
  const jsonBuf = buf.slice(jsonChunkStart + 8, jsonChunkStart + 8 + jsonChunkLength);
  const gltf = JSON.parse(jsonBuf.toString('utf8'));

  let renamed = 0;
  for (const mesh of gltf.meshes || []) {
    if (mesh.name && mesh.name !== 'texture-target') {
      log(`  mesh "${mesh.name}" -> "texture-target"`);
      mesh.name = 'texture-target';
      renamed += 1;
    } else if (!mesh.name) {
      mesh.name = 'texture-target';
      renamed += 1;
    }
  }
  for (const node of gltf.nodes || []) {
    if (node.mesh != null && (!node.name || node.name === 'convert' || node.name === 'material')) {
      node.name = 'texture-target';
    }
  }

  const newJsonStr = JSON.stringify(gltf);
  const newJsonBuf = Buffer.from(newJsonStr, 'utf8');
  const jsonPad = (4 - (newJsonBuf.length % 4)) % 4;
  const paddedJson = jsonPad > 0 ? Buffer.concat([newJsonBuf, Buffer.alloc(jsonPad, 0x20)]) : newJsonBuf;

  const binChunkLength = buf.readUInt32LE(binChunkStart);
  const binBuf = buf.slice(binChunkStart + 8, binChunkStart + 8 + binChunkLength);
  const binPad = (4 - (binBuf.length % 4)) % 4;
  const paddedBin = binPad > 0 ? Buffer.concat([binBuf, Buffer.alloc(binPad, 0)]) : binBuf;

  const totalLength = 12 + 8 + paddedJson.length + 8 + paddedBin.length;
  const out = Buffer.alloc(totalLength);
  out.writeUInt32LE(0x46546C67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(totalLength, 8);
  out.writeUInt32LE(paddedJson.length, 12);
  JSON_TAG.copy(out, 16);
  paddedJson.copy(out, 20);
  out.writeUInt32LE(paddedBin.length, 20 + paddedJson.length);
  BIN_TAG.copy(out, 24 + paddedJson.length);
  paddedBin.copy(out, 28 + paddedJson.length);

  fs.writeFileSync(target, out);
  log(`✅ 重命名 ${renamed} 个 mesh 节点,文件已更新: ${target} (${(out.length/1024).toFixed(1)} KB)`);
} catch (err) {
  log(`❌ 失败: ${err.message}`);
  log(err.stack);
  process.exit(1);
} finally {
  fs.writeFileSync(logFile, logLines.join('\n'), 'utf8');
}

