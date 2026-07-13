#!/usr/bin/env bash
set -euo pipefail

remote="$(git config --get remote.origin.url)"
case "$remote" in
  git@github.com:*) repository="${remote#git@github.com:}" ;;
  https://github.com/*) repository="${remote#https://github.com/}" ;;
  *) echo "Unsupported origin remote: $remote" >&2; exit 1 ;;
esac

repository="${repository%.git}"
repository="$(printf '%s' "$repository" | tr '[:upper:]' '[:lower:]')"
image="ghcr.io/$repository"
sha="$(git rev-parse HEAD)"

docker buildx build --platform linux/arm64 \
  --build-arg "EW_VERSION=$sha" \
  --tag "$image:arm64-latest" \
  --tag "$image:arm64-$sha" \
  --push .

docker buildx imagetools create \
  --tag "$image:latest" \
  --tag "$image:$sha" \
  "$image:amd64-$sha" \
  "$image:arm64-$sha"
