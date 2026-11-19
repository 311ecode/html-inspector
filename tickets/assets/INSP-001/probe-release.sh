#!/usr/bin/env bash
# End-to-end probe of the INSP-001 release mechanics against a throwaway repo:
#   create GitHub repo → push the (text) distribution tree + tag over SSH →
#   create Release → upload both zips + sha256 → verify downloads → delete repo.
set -euo pipefail

DASH="$HOME/dev/menu-dashboard"
ORG="311ecode"
TOKEN="$(sed -nE "s/^GITHUB_TEST_TOKEN='(.*)'\$/\1/p" "$HOME/bash.sh/state" | tail -1)"
[[ -n "$TOKEN" ]] || { echo "FATAL: no GITHUB_TEST_TOKEN in state"; exit 1; }
NAME="html-inspector-release-probe-$(date +%s)"
WORK="$(mktemp -d /tmp/probe-repo.XXXXXX)"
TAG="v0.4.11"
API="https://api.github.com"
REPO_ID=""

cleanup() {
  set +e
  if [[ -n "$REPO_ID" ]]; then
    code=$(curl -sS -m 30 -o /dev/null -w '%{http_code}' -X DELETE \
      -H "Authorization: Bearer $TOKEN" "$API/repos/$ORG/$NAME")
    echo "cleanup: DELETE $ORG/$NAME -> HTTP $code"
  fi
  [[ -d "$WORK/.git" ]] && { cd /; rm -rf "$WORK"; }
}
trap cleanup EXIT

echo "== 1. create repo $ORG/$NAME (public) =="
code=$(curl -sS -m 30 -o /tmp/.probe_repo.json -w '%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN" -H 'Accept: application/vnd.github+json' \
  "$API/user/repos" \
  -d "{\"name\":\"$NAME\",\"private\":false,\"description\":\"throwaway probe for the html-inspector release flow\"}")
echo "POST /user/repos -> HTTP $code"
[[ "$code" == "201" ]] || { cat /tmp/.probe_repo.json; exit 1; }
REPO_ID=$(python3 -c 'import json;print(json.load(open("/tmp/.probe_repo.json"))["id"])')
echo "repo id: $REPO_ID"

echo "== 2. build the committed distribution tree (text only) =="
mkdir -p "$WORK/registry/inspector"
cp -r "$DASH/registry/inspector/0.4.11" "$DASH/registry/inspector/v1" "$WORK/registry/inspector/"
cp "$DASH/registry/index.json" "$WORK/registry/index.json"
cat > "$WORK/README.md" <<'EOF'
# html-inspector — release-flow probe

Throwaway repository created by the INSP-001 mechanics probe. Text tree = registry;
binary zips live on the Release, never in git.
EOF
du -sh "$WORK/registry"

echo "== 3. git init, commit, tag, push over SSH =="
cd "$WORK"
git init -q -b main
git add -A
git -c user.name="Fleet Debugger" -c user.email="imre@local" commit -q -m "release: v0.4.11 probe"
git tag "$TAG"
git remote add origin "git@github.com:$ORG/$NAME.git"
export GIT_SSH_COMMAND="SSH_AUTH_SOCK= ssh -F /dev/null -i $HOME/.ssh/id_ed25519"
git push -q origin main
git push -q origin "$TAG"
echo "pushed main + $TAG; remote tips:"
git ls-remote origin | sed 's#\t# #'

echo "== 4. create the Release for $TAG =="
code=$(curl -sS -m 30 -o /tmp/.probe_rel.json -w '%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN" -H 'Accept: application/vnd.github+json' \
  "$API/repos/$ORG/$NAME/releases" \
  -d "{\"tag_name\":\"$TAG\",\"name\":\"Release $TAG (probe)\",\"body\":\"INSP-001 mechanics probe\"}")
echo "POST /releases -> HTTP $code"
[[ "$code" == "201" ]] || { cat /tmp/.probe_rel.json; exit 1; }
REL_ID=$(python3 -c 'import json;print(json.load(open("/tmp/.probe_rel.json"))["id"])')
echo "release id: $REL_ID"

echo "== 5. upload the distribution zips + sha256 =="
for f in /tmp/probe-dist/*.zip /tmp/probe-dist/*.zip.sha256; do
  asset=$(basename "$f")
  code=$(curl -sS -m 60 -o /tmp/.probe_asset.json -w '%{http_code}' -X POST \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/octet-stream' \
    --data-binary "@$f" \
    "https://uploads.github.com/repos/$ORG/$NAME/releases/$REL_ID/assets?name=$asset")
  echo "upload $asset -> HTTP $code"
  [[ "$code" == "201" ]] || { cat /tmp/.probe_asset.json; exit 1; }
done

echo "== 6. verify the published release (names, sizes, hashes) =="
curl -sS -m 30 -H "Authorization: Bearer $TOKEN" "$API/repos/$ORG/$NAME/releases/tags/$TAG" \
  -o /tmp/.probe_verify.json
python3 - <<'PY'
import json
d = json.load(open('/tmp/.probe_verify.json'))
print('tag:', d['tag_name'], '| assets:', len(d['assets']))
for a in d['assets']:
    print(f"  {a['name']:<44} {a['size']:>8} B  state={a['state']}")
PY
mkdir -p /tmp/probe-dl
for f in /tmp/probe-dist/*.zip; do
  asset=$(basename "$f")
  url=$(python3 -c "import json;d=json.load(open('/tmp/.probe_verify.json'));print([a['browser_download_url'] for a in d['assets'] if a['name']=='$asset'][0])")
  curl -sSL -m 60 "$url" -o "/tmp/probe-dl/$asset"
  local_sha=$(sha256sum "$f" | awk '{print $1}')
  dl_sha=$(sha256sum "/tmp/probe-dl/$asset" | awk '{print $1}')
  [[ "$local_sha" == "$dl_sha" ]] && echo "  ✓ $asset round-trip sha256 identical" || { echo "  ✗ $asset hash mismatch"; exit 1; }
done

echo "== 7. clean up =="
code=$(curl -sS -m 30 -o /dev/null -w '%{http_code}' -X DELETE \
  -H "Authorization: Bearer $TOKEN" "$API/repos/$ORG/$NAME")
echo "DELETE repo -> HTTP $code"
REPO_ID=""
code=$(curl -sS -m 30 -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$API/repos/$ORG/$NAME")
echo "verify gone -> HTTP $code"
rm -f /tmp/.probe_repo.json /tmp/.probe_rel.json /tmp/.probe_asset.json /tmp/.probe_verify.json
rm -rf /tmp/probe-dl
echo "PROBE OK"
