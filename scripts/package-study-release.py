#!/usr/bin/env python3
"""将当前工作区打成可在生产板本机构建的源码包，不包含配置凭据和构建缓存。"""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile

root = Path(__file__).resolve().parent.parent
allowed = ["Dockerfile", ".dockerignore", "backend", "frontend", "web",
           "scripts/backup-production-study.sh", "scripts/deploy_production_study.py", "scripts/web_updater"]
listed = subprocess.check_output(["git","ls-files","-z","-co","--exclude-standard","--",*allowed],cwd=root).split(b"\0")
files = sorted({item.decode() for item in listed if item})
files = [name for name in files if not any(part.startswith(".env") or part in
         {"node_modules","target","dist","__pycache__",".DS_Store"} for part in Path(name).parts)
         and not name.endswith((".pyc",".tsbuildinfo"))]
for name in files:
    if (root/name).is_symlink():
        raise RuntimeError("发布包不接受符号链接："+name)
digest = hashlib.sha256()
for name in files:
    digest.update(name.encode()+b"\0")
    with (root/name).open("rb") as source:
        for block in iter(lambda:source.read(1024*1024),b""):
            digest.update(block)
release = "study-v2-"+digest.hexdigest()[:16]
output = root/"releases"
output.mkdir(exist_ok=True)
archive_path = output/(release+".tar.gz")
manifest = json.dumps({"release":release,"source_sha256":digest.hexdigest(),"files":len(files),"paths":files},indent=2).encode()
with tarfile.open(archive_path,"w:gz") as archive:
    for name in files:
        archive.add(root/name,arcname=release+"/"+name,recursive=False)
    entry = tarfile.TarInfo(release+"/release.json")
    entry.size=len(manifest)
    archive.addfile(entry,io.BytesIO(manifest))
checksum = hashlib.sha256(archive_path.read_bytes()).hexdigest()
Path(str(archive_path)+".sha256").write_text(checksum+"  "+archive_path.name+"\n")
print("RELEASE="+release)
print("ARCHIVE="+str(archive_path))
print("SHA256="+checksum)
print("SIZE_MB="+str(round(archive_path.stat().st_size/1024/1024,1)))
