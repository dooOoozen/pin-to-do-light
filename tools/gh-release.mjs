/* Publishes a GitHub release with one asset.

   Two things this deliberately does not do: put the token on a command line (the process list on
   Windows shows other users' arguments, and it lands in shell history), and use fetch (this
   machine reaches GitHub through a local proxy that resets Node's CONNECT, while curl through the
   same proxy works). So the token comes out of the git credential manager into a netrc file that
   is deleted on the way out, and every request is curl -n.

     node tools/gh-release.mjs --tag v0.1.0 --name "v0.1.0 预发布" \
       --body tools/release-notes-v0.1.0.md \
       --asset "src-tauri/target/release/bundle/nsis/Pin To-Do_0.1.0_x64-setup.exe" --prerelease
*/
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, statSync, rmSync } from "node:fs";

const REPO = process.env.GH_REPO || "dooOoozen/pin-to-do-light";
/* which route works changes between sessions — the local proxy has been both required and broken —
   so every request is tried direct first and then through the proxy, and the route that worked is
   printed. Set GH_PROXY to "" to pin the direct route. */
const PROXY = process.env.GH_PROXY === undefined ? "http://127.0.0.1:7897" : process.env.GH_PROXY;
const argv = process.argv.slice(2);
const val = (k) => { const i = argv.indexOf(k); return i < 0 || i + 1 >= argv.length ? "" : argv[i + 1]; };
const tag = val("--tag"), name = val("--name"), bodyFile = val("--body"), asset = val("--asset");
const prerelease = argv.includes("--prerelease");
if (!tag || !asset) { console.log("need --tag and --asset"); process.exit(2); }

function token() {
  /* the helper chain is cleared and re-added per call — left at the system default this hangs on a
     credential-helper-selector window instead of returning the stored token */
  const out = execFileSync("git",
    ["-c", "credential.helper=", "-c", "credential.helper=manager", "credential", "fill"],
    { input: "protocol=https\nhost=github.com\n\n", encoding: "utf8" });
  const m = /^password=(.*)$/m.exec(out);
  if (!m) throw new Error("credential helper gave no password");
  return m[1].trim();
}

const netrc = ".git/gh-release-netrc";
const tok = token();
writeFileSync(netrc,
  "machine api.github.com login x password " + tok + "\n" +
  "machine uploads.github.com login x password " + tok + "\n", { mode: 0o600 });

function curl(args, bodyFile) {
  const base = ["-sS", "--fail-with-body", "-m", "120", "-n", "--netrc-file", netrc,
    "-H", "Accept: application/vnd.github+json", "-H", "X-GitHub-Api-Version: 2022-11-28"];
  if (bodyFile) base.push("--data-binary", "@" + bodyFile);
  let first = null;
  for (const via of PROXY ? [[], ["-x", PROXY]] : [[], []]) {
    try {
      const out = execFileSync("curl", base.concat(via, args), { encoding: "utf8", maxBuffer: 1 << 26 });
      console.log("route=" + (via.length ? "proxy" : "direct"));
      return out;
    } catch (e) {
      if (!first) first = e;
      /* a transport failure retries on the other route; an HTTP 4xx carries a body and is final */
      if (e && e.stdout && String(e.stdout).length) throw e;
    }
  }
  throw first;
}

try {
  const fname = asset.split(/[\\/]/).pop();
  const size = statSync(asset).size;
  let rel = null;
  if (argv.includes("--replace")) {
    const list = JSON.parse(curl(["https://api.github.com/repos/" + REPO + "/releases?per_page=30"]));
    rel = list.find((r) => r.tag_name === tag) || null;
    if (rel) {
      for (const a of rel.assets || []) {
        curl(["-X", "DELETE", a.url]);
        console.log("deleted old asset=" + a.name);
      }
    }
  }
  if (!rel) {
    const payload = ".git/gh-release-body.json";
    writeFileSync(payload, JSON.stringify({
      tag_name: tag,
      target_commitish: "main",
      name: name || tag,
      body: bodyFile ? readFileSync(bodyFile, "utf8") : "",
      draft: false,
      prerelease
    }));
    rel = JSON.parse(curl(["-H", "Content-Type: application/json",
      "-X", "POST", "https://api.github.com/repos/" + REPO + "/releases"], payload));
    rmSync(payload, { force: true });
    console.log("release id=" + rel.id + " tag=" + rel.tag_name + " prerelease=" + rel.prerelease);
  } else {
    console.log("reusing release id=" + rel.id + " tag=" + rel.tag_name);
  }
  console.log("page=" + rel.html_url);

  const up = rel.upload_url.replace(/\{[^}]*\}/g, "") + "?name=" + encodeURIComponent(fname);
  const a = JSON.parse(curl(["-H", "Content-Type: application/octet-stream",
    "-X", "POST", up], asset));
  console.log("asset=" + a.name + " bytes=" + a.size + "/" + size + " state=" + a.state);
  console.log("download=" + a.browser_download_url);
  if (a.size !== size) console.log("!! SIZE-MISMATCH");
} finally {
  rmSync(netrc, { force: true });
}
