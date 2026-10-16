#!/usr/bin/env python3
"""Install only pinned OCR assets into this extension; no system packages changed."""
import base64
import hashlib
import io
import json
from pathlib import Path
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1] / 'ocr'
LOCK = json.loads((ROOT / 'assets-manifest.json').read_text())
ASSETS = ROOT / 'assets'

def digest(data):
    return hashlib.sha256(data).hexdigest()

def valid(item):
    path = ASSETS / item['path']
    return path.is_file() and path.stat().st_size == item['bytes'] and digest(path.read_bytes()) == item['sha256']

def download(url, limit):
    print('下载:', url, flush=True)
    with urllib.request.urlopen(url, timeout=120) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError('下载超过预期大小限制')
    return data

def save(item, data):
    if len(data) != item['bytes'] or digest(data) != item['sha256']:
        raise ValueError('来源文件校验失败: ' + item['path'])
    path = ASSETS / item['path']
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + '.download')
    temp.write_bytes(data)
    if path.exists():
        backup = path.with_name(path.name + '.backup-' + digest(path.read_bytes())[:12])
        if not backup.exists():
            backup.write_bytes(path.read_bytes())
    temp.replace(path)

for item in LOCK['files']:
    if not valid(item):
        save(item, download(item['url'], item['bytes']))
runtime = LOCK['runtime']
if any(not valid(item) for item in runtime['members']):
    data = download(runtime['url'], 64 * 1024 * 1024)
    actual = 'sha512-' + base64.b64encode(hashlib.sha512(data).digest()).decode()
    if actual != runtime['integrity']:
        raise ValueError('ONNX Runtime 安装包校验失败')
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
        for item in runtime['members']:
            if not valid(item):
                save(item, archive.extractfile(item['member']).read(item['bytes'] + 1))
if digest((ROOT / LOCK['dictionary']['path']).read_bytes()) != LOCK['dictionary']['sha256']:
    raise ValueError('本地字符字典校验失败')
print('模型、字典及运行时校验通过；本地 OCR 已就绪。')
