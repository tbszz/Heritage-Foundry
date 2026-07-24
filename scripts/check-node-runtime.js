const requiredFlag = '--use-env-proxy';

if (!process.allowedNodeEnvironmentFlags?.has(requiredFlag)) {
  console.error(
    `当前 Node.js ${process.versions.node} 不支持 ${requiredFlag}；请升级到 Node.js 22.21 或更高版本。`
  );
  process.exitCode = 1;
}
