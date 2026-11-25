'use strict';
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const sharp = require('sharp');
let running = false;

function ready(env) {
  return Boolean(env.FASHN_PYTHON && env.FASHN_WEIGHTS &&
    existsSync(env.FASHN_PYTHON) && existsSync(path.join(env.FASHN_WEIGHTS, 'model.safetensors')));
}

async function render(env, person, garments) {
  if (running) throw Object.assign(Error('本机正在处理另一张试穿图，请稍后重试'), {status:409});
  running = true;
  let folder;
  try {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), 'weave-fit-vton-'));
    const personPath = path.join(folder, 'person.png');
    await sharp(person, {limitInputPixels:25e6}).rotate().resize(1200, 1536, {fit:'inside',withoutEnlargement:true}).png().toFile(personPath);
    const args = [path.join(__dirname, 'scripts', 'fashn-inference.py'), path.resolve(env.FASHN_WEIGHTS), personPath];
    const output = path.join(folder, 'result.png');
    args.push(output);
    for (const [index, garment] of garments.entries()) {
      const garmentPath = path.join(folder, 'garment-'+index+'.png');
      await sharp(garment.data, {limitInputPixels:25e6}).rotate().resize(1200,1200,{fit:'inside',withoutEnlargement:true}).flatten({background:'#fff'}).png().toFile(garmentPath);
      args.push(garment.category, garmentPath);
    }
    await promisify(execFile)(path.resolve(env.FASHN_PYTHON), args, {
      timeout:600000,
      windowsHide:true,
      env:{...process.env, PYTHONUTF8:'1', HF_HUB_OFFLINE:'1'}
    });
    return await sharp(output, {limitInputPixels:8e6}).webp({quality:94}).toBuffer();
  } catch {
    throw Object.assign(Error('本机试穿失败，请检查 FASHN 安装、模型文件和可用显存'), {status:502});
  } finally {
    try { if (folder) await fs.rm(folder,{recursive:true,force:true}); }
    finally { running = false; }
  }
}

module.exports = { ready, render };
