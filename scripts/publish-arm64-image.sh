#!/usr/bin/env bash
# 本地构建 linux/arm64 并推送到 ghcr.io，再与 CI 的 amd64 合成 multi-arch 标签。
#
# 推荐流程：
#   1. git push origin main          # 触发 CI 推 :amd64-<sha>
#   2. 等 CI build job 成功
#   3. ./scripts/publish-arm64-image.sh
#      → 推 :arm64-latest / :arm64-<sha>
#      → imagetools 合成 :latest / :<sha>（amd64 + arm64）
#
# 用法：
#   ./scripts/publish-arm64-image.sh           # 当前 HEAD
#   ./scripts/publish-arm64-image.sh <sha>     # 指定 commit（需工作树/上下文一致时慎用）
#   ./scripts/publish-arm64-image.sh --manifest-only [sha]
#      # 仅合成 multi-arch（arm/amd 都已推过时）
#
# 前置：
#   - 本机 Docker Desktop（arm64 Mac 原生构建最快）
#   - 已登录 ghcr.io：echo $GHCR_TOKEN | docker login ghcr.io -u USER --password-stdin
#     （token 需 write:packages）
set -euo pipefail

manifest_only=0
sha=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --manifest-only) manifest_only=1; shift ;;
    -h|--help)
      sed -n '2,25p' "$0"
      exit 0
      ;;
    -*)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
    *)
      sha="$1"
      shift
      ;;
  esac
done

remote="$(git config --get remote.origin.url)"
case "$remote" in
  git@github.com:*) repository="${remote#git@github.com:}" ;;
  https://github.com/*) repository="${remote#https://github.com/}" ;;
  *) echo "Unsupported origin remote: $remote" >&2; exit 1 ;;
esac

repository="${repository%.git}"
repository="$(printf '%s' "$repository" | tr '[:upper:]' '[:lower:]')"
image="ghcr.io/$repository"
sha="${sha:-$(git rev-parse HEAD)}"

amd_ref="$image:amd64-$sha"
arm_ref="$image:arm64-$sha"

image_exists() {
  docker buildx imagetools inspect "$1" >/dev/null 2>&1
}

create_manifest() {
  if ! image_exists "$amd_ref"; then
    cat >&2 <<EOF
ERROR: 找不到 $amd_ref
请先 push main 并等 GitHub Actions 推完 amd64，再重跑本脚本。
仅想先推 arm 时，可暂时只用 :arm64-latest（板子可 pin 该标签）。
合成 multi-arch 可稍后执行：
  $0 --manifest-only $sha
EOF
    exit 1
  fi
  if ! image_exists "$arm_ref"; then
    echo "ERROR: 找不到 $arm_ref（请先完整跑一遍本脚本，不要 --manifest-only）" >&2
    exit 1
  fi

  echo "合成 multi-arch: $image:latest / $image:$sha"
  echo "  ← $amd_ref"
  echo "  ← $arm_ref"
  docker buildx imagetools create \
    --tag "$image:latest" \
    --tag "$image:$sha" \
    "$amd_ref" \
    "$arm_ref"
  echo "完成。板子: docker pull $image:latest && docker compose up -d app"
}

if [[ "$manifest_only" -eq 1 ]]; then
  create_manifest
  exit 0
fi

echo "构建并推送 arm64: $arm_ref + $image:arm64-latest (EW_VERSION=$sha)"
docker buildx build --platform linux/arm64 \
  --build-arg "EW_VERSION=$sha" \
  --tag "$image:arm64-latest" \
  --tag "$arm_ref" \
  --push .

create_manifest
