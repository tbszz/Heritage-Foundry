#!/usr/bin/env node
/**
 * 一次性脚本：使用腾讯混元 3D Pro API 生成非遗 GLB 模型
 * 用法：
 *   node scripts/generate-hunyuan-3d.js [prompt] [output-filename]
 * 环境变量：
 *   HUNYUAN_SECRET_ID   - 必填
 *   HUNYUAN_SECRET_KEY  - 必填
 */
require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const SECRET_ID = process.env.HUNYUAN_SECRET_ID;
const SECRET_KEY = process.env.HUNYUAN_SECRET_KEY;
const HOST = 'ai3d.tencentcloudapi.com';
const SERVICE = 'ai3d';
const VERSION = '2025-05-13';
const REGION = process.env.HUNYUAN_REGION || 'ap-guangzhou';
const ACTION_SUBMIT = 'SubmitHunyuanTo3DProJob';
const ACTION_QUERY = 'QueryHunyuanTo3DProJob';
const ACTION_SUBMIT_RAPID = 'SubmitHunyuanTo3DRapidJob';
const ACTION_QUERY_RAPID = 'QueryHunyuanTo3DRapidJob';

if (!SECRET_ID || !SECRET_KEY) {
  console.error('错误：请先在 .env 中配置 HUNYUAN_SECRET_ID 和 HUNYUAN_SECRET_KEY');
  console.error('  - HUNYUAN_SECRET_ID    = 腾讯云 API 密钥的 SecretId');
  console.error('  - HUNYUAN_SECRET_KEY   = 腾讯云 API 密钥的 SecretKey');
  process.exit(1);
}

function sha256Hex(message) {
  return crypto.createHash('sha256').update(message).digest('hex');
}

function hmacSha256(key, message) {
  return crypto.createHmac('sha256', key).update(message).digest();
}

function buildAuthorization(payload, action, timestamp) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const payloadHash = sha256Hex(payload);

  const canonicalHeaders =
    `content-type:application/json; charset=utf-8\n` +
    `host:${HOST}\n` +
    `x-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';

  const canonicalRequest =
    `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const credentialScope = `${date}/${SERVICE}/tc3_request`;
  const stringToSign =
    `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;

  const secretDate = hmacSha256(`TC3${SECRET_KEY}`, date);
  const secretService = hmacSha256(secretDate, SERVICE);
  const secretSigning = hmacSha256(secretService, 'tc3_request');
  const signature = crypto
    .createHmac('sha256', secretSigning)
    .update(stringToSign)
    .digest('hex');

  return `TC3-HMAC-SHA256 Credential=${SECRET_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function callTencentCloud(action, payload) {
  return new Promise((resolve, reject) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const body = JSON.stringify(payload);
    const authorization = buildAuthorization(body, action, timestamp);

    const req = https.request(
      {
        hostname: HOST,
        port: 443,
        method: 'POST',
        path: '/',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json; charset=utf-8',
          Host: HOST,
          'X-TC-Action': action,
          'X-TC-Timestamp': String(timestamp),
          'X-TC-Version': VERSION,
          'X-TC-Region': REGION
        }
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          try {
            const parsed = JSON.parse(text);
            if (parsed.Response && parsed.Response.Error) {
              const err = parsed.Response.Error;
              reject(new Error(`[${err.Code}] ${err.Message}`));
              return;
            }
            resolve(parsed.Response || parsed);
          } catch (err) {
            reject(new Error(`无法解析响应: ${text.slice(0, 500)}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function downloadToFile(url, outputPath, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error('重定向次数过多'));
      return;
    }
    const target = new URL(url);
    const client = target.protocol === 'http:' ? require('http') : https;
    client
      .get(url, (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
          response.resume();
          const next = response.headers.location;
          if (!next) {
            reject(new Error('重定向缺少 Location 头'));
            return;
          }
          downloadToFile(next, outputPath, redirectCount + 1).then(resolve, reject);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`下载失败，状态码 ${response.statusCode}`));
          return;
        }
        const file = fs.createWriteStream(outputPath);
        response.pipe(file);
        file.on('finish', () => {
          file.close(() => resolve());
        });
      })
      .on('error', (err) => {
        fs.promises.unlink(outputPath).catch(() => {});
        reject(err);
      });
  });
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const useRapid =
    process.argv.includes('--rapid') ||
    String(process.env.HUNYUAN_VARIANT || '').toLowerCase() === 'rapid';
  const defaultPrompt =
    '中国结挂饰, 大红色丝绸编织的传统中国结, 流苏装饰, 高细节纹理, 居中构图, 纯色背景, 3D渲染';
  const prompt = args[0] || defaultPrompt;
  const outputName = args[1] || (useRapid ? 'hunyuan-rapid-chinese-knot.glb' : 'hunyuan-chinese-knot.glb');
  const modelsDir = path.join(__dirname, '..', 'public', 'models');
  const outputPath = path.join(modelsDir, outputName);

  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }

  const submitAction = useRapid ? ACTION_SUBMIT_RAPID : ACTION_SUBMIT;
  const queryAction = useRapid ? ACTION_QUERY_RAPID : ACTION_QUERY;

  console.log(`▶ 提交混元 3D ${useRapid ? '极速版' : '专业版'} 任务`);
  console.log('  提示词:', prompt);
  console.log('  目标文件:', outputPath);

  const submitPayload = useRapid
    ? { Prompt: prompt, ResultFormat: 'GLB', EnablePBR: true }
    : { Prompt: prompt, EnablePBR: true, FaceCount: Number(process.env.HUNYUAN_FACE_COUNT) || 100000, GenerateType: 'Normal' };

  const submitResult = await callTencentCloud(submitAction, submitPayload);

  const jobId = submitResult.JobId;
  if (!jobId) {
    throw new Error('提交任务未返回 JobId');
  }
  console.log('  JobId:', jobId);
  console.log('  RequestId:', submitResult.RequestId);

  console.log('▶ 轮询任务状态（每 5 秒一次，最多 6 分钟）');
  let result = null;
  for (let i = 0; i < 72; i += 1) {
    await sleep(5000);
    result = await callTencentCloud(queryAction, { JobId: jobId });
    const status = result.Status;
    const credits = result.ResultCreditConsumed != null ? `, 已消耗 ${result.ResultCreditConsumed} 积分` : '';
    console.log(`  [${i + 1}] Status=${status}${credits}`);
    if (status === 'DONE' || status === 'FAIL') break;
  }

  if (!result || result.Status !== 'DONE') {
    throw new Error(
      `任务未成功完成: ${result?.ErrorMessage || 'STATUS=' + (result?.Status || 'UNKNOWN')}`
    );
  }

  if (result.ResultCreditConsumed) {
    console.log(`💰 本次消耗 ${result.ResultCreditConsumed} 积分（控制台查看余额：https://console.cloud.tencent.com/ai3d ）`);
  }

  const files = Array.isArray(result.ResultFile3Ds) ? result.ResultFile3Ds : [];
  console.log('▶ 生成结果文件:');
  for (const f of files) {
    console.log(`  - Type=${f.Type}  Preview=${f.PreviewImageUrl || '(无)'}`);
    console.log(`    Url=${f.Url}`);
  }

  const glbFile =
    files.find((f) => String(f.Type || '').toUpperCase() === 'GLB') || files[0];
  if (!glbFile || !glbFile.Url) {
    throw new Error('未在结果中找到可下载的 3D 文件 URL');
  }

  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }
  console.log('▶ 下载文件:', glbFile.Url);
  await downloadToFile(glbFile.Url, outputPath);
  const size = fs.statSync(outputPath).size;
  console.log(`✅ 完成！文件已保存到 ${outputPath}（${(size / 1024).toFixed(1)} KB）`);
}

main().catch((err) => {
  console.error('❌ 生成失败:', err.message);
  process.exit(1);
});
