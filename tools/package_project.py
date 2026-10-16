"""只打包显式列出的 iOS 项目文件；不读取凭据、测试、node_modules。"""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parent.parent
SCRIPT_NAME = "Cloudflare Workers Meter"
SOURCE = ROOT / "scripts" / SCRIPT_NAME
FILES = ("script.json", "index.tsx", "widget.tsx", "core.ts", "api.ts", "storage.ts", "service.ts", "views.tsx", "ai.ts", "ai-views.tsx", "README.md")


def package():
    SOURCE.joinpath("README.md").write_bytes(ROOT.joinpath("README.md").read_bytes())
    metadata = json.loads(SOURCE.joinpath("script.json").read_text(encoding="utf-8"))
    assert metadata["name"] == SOURCE.name
    assert all(metadata.get(name) for name in ("name", "icon", "color", "version"))
    for name in FILES:
        assert SOURCE.joinpath(name).is_file(), name
    output = ROOT / "dist"
    output.mkdir(exist_ok=True)
    archive = output / (SCRIPT_NAME + ".zip")
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
        for name in FILES:
            bundle.write(SOURCE / name, SCRIPT_NAME + "/" + name)
    with zipfile.ZipFile(archive) as bundle:
        assert bundle.testzip() is None
        assert set(bundle.namelist()) == {SCRIPT_NAME + "/" + name for name in FILES}
        for name in FILES:
            assert bundle.read(SCRIPT_NAME + "/" + name) == (SOURCE / name).read_bytes()
        joined = b"\n".join(bundle.read(name) for name in bundle.namelist())
        assert b"secret-sentinel" not in joined and b"test-only-secret" not in joined
        assert not any("node_modules" in name or "tests/" in name for name in bundle.namelist())
    checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
    (output / "SHA256SUMS.txt").write_text(checksum + "  " + archive.name + "\n", encoding="utf-8")
    manifest = {"archive": archive.name, "version": metadata["version"], "bytes": archive.stat().st_size, "sha256": checksum, "files": list(FILES), "verified": "ZIP CRC, exact source contents, allowlisted files"}
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # GitHub 固定下载路径：只复制已经通过白名单和源码一致性检查的安装包。
    releases = ROOT / "releases"
    releases.mkdir(exist_ok=True)
    remote_archive = releases / "cloudflare-workers-meter.zip"
    remote_archive.write_bytes(archive.read_bytes())
    (releases / "SHA256SUMS.txt").write_text(checksum + "  " + remote_archive.name + "\n", encoding="utf-8")
    remote_manifest = {**manifest, "archive": remote_archive.name, "remoteSource": metadata.get("remoteResource", {}).get("url")}
    (releases / "manifest.json").write_text(json.dumps(remote_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    package()
