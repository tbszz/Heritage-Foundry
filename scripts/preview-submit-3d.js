// 提交图片到本地 TripoSR sidecar 并轮询直到产出 GLB
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:7861';
const KEY = process.env.LOCAL_3D_API_KEY;
const imagePath = process.argv[2] || path.resolve(__dirname, '../public/assets/generated/preview-ref-vase.jpg');
const outPath = process.argv[3] || path.resolve(__dirname, '../public/models/preview-vase-triposr.glb');

const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` };

async function main() {
  const buf = fs.readFileSync(imagePath);
  const ext = path.extname(imagePath).slice(1).replace('jpg', 'jpeg');
  const image_url = `data:image/${ext};base64,${buf.toString('base64')}`;

  const res = await fetch(`${BASE}/v1/image-to-3d`, {
    method: 'POST', headers, body: JSON.stringify({ image_url })
  });
  if (!res.ok) throw new Error(`submit failed: ${res.status} ${await res.text()}`);
  const task = await res.json();
  console.log('task created:', task.id);

  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const s = await (await fetch(`${BASE}/v1/image-to-3d/${task.id}`, { headers })).json();
    console.log(`status: ${s.status} progress: ${s.progress ?? '-'}%`);
    if (s.status === 'succeeded') {
      const glb = await fetch(`${BASE}${s.model_url}`, { headers });
      if (!glb.ok) throw new Error(`download failed: ${glb.status}`);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, Buffer.from(await glb.arrayBuffer()));
      console.log('GLB saved:', outPath, fs.statSync(outPath).size, 'bytes');
      return;
    }
    if (s.status === 'failed') throw new Error(`task failed: ${s.error || JSON.stringify(s)}`);
  }
  throw new Error('timeout waiting for task');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
