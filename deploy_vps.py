"""Deploy public/ to the VPS that serves veudr.vigil.green (nginx, static files).

    VPS_HOST=<ip> VPS_PW=<root password> python webapp/deploy_vps.py            # upload what changed and switch to it
    VPS_HOST=<ip> VPS_PW=<root password> python webapp/deploy_vps.py --nginx    # also (re)install the nginx site
    ... --full                                                                   # send every file again

Compares the MD5 of every file in public/ with the live release and uploads only what changed (one tar.gz over SFTP).
The new release /var/www/veudr/releases/<time> starts as a hard-link copy of the live one; changed files are unlinked
before being written, so the live release is never modified, and removed files are deleted. Then the symlink
/var/www/veudr/current is switched in one atomic step, so the site never shows a half-copied release. The last three
releases are kept for a quick rollback (ln -sfn <older release> /var/www/veudr/current). The nginx site only serves
veudr.vigil.green; the other sites on the server are not touched. No credential is stored anywhere.
"""
from __future__ import annotations

import hashlib
import os
import sys
import tarfile
import tempfile
import time
from pathlib import Path

import paramiko

PUBLIC = Path(__file__).resolve().parent / "public"
BASE = "/var/www/veudr"
SITE = "/etc/nginx/sites-available/veudr"
NGINX = r"""# veudr.vigil.green: static vEUDR site (deployed by webapp/deploy_vps.py). Cloudflare proxies HTTPS to this port 80,
# as for vigil.green. Mirrors public/_headers and the 404 handling of the Cloudflare deployment.
server {
    listen 80;
    server_name veudr.vigil.green;

    root /var/www/veudr/current;
    index index.html;
    access_log /var/log/nginx/veudr_access.log;
    error_log /var/log/nginx/veudr_error.log;

    gzip on;
    gzip_types text/css application/javascript application/json application/geo+json application/x-protobuf text/csv image/svg+xml;
    gzip_min_length 1024;

    error_page 404 /404.html;

    location / {
        try_files $uri $uri/ =404;
    }
    location ~ \.geojson$ {
        types { } default_type application/geo+json;
        add_header Cache-Control "public, max-age=3600";
    }
    location ~ ^/data/lots/.+\.pbf$ {
        types { } default_type application/x-protobuf;
        add_header Cache-Control "public, max-age=604800";
        try_files $uri =404;
    }
    location /sheets/ {
        add_header Cache-Control "public, max-age=604800";
        try_files $uri =404;
    }
    location = /index.html { add_header Cache-Control "no-cache"; }
    location = /app.js { add_header Cache-Control "no-cache"; }
    location = /style.css { add_header Cache-Control "no-cache"; }
    location = /_headers { return 404; }
    location ~ /\. { return 404; }
}
"""


def run(c: paramiko.SSHClient, cmd: str) -> str:
    _, o, e = c.exec_command(cmd, timeout=900)
    out, err, rc = o.read().decode(), e.read().decode(), o.channel.recv_exit_status()
    if rc:
        raise SystemExit(f"remote command failed ({rc}): {cmd}\n{out}\n{err}")
    return out


def local_manifest() -> dict[str, str]:
    return {p.relative_to(PUBLIC).as_posix(): hashlib.md5(p.read_bytes()).hexdigest() for p in sorted(PUBLIC.rglob("*")) if p.is_file()}


def put_list(sftp, items: list[str], remote: str):
    """Upload a NUL-separated path list (safe for any file name) for xargs -0."""
    with sftp.open(remote, "wb") as f:
        f.write(("\0".join(items) + "\0").encode("utf-8"))


def main():
    host, pw = os.environ["VPS_HOST"], os.environ["VPS_PW"]
    stamp = time.strftime("%Y%m%d-%H%M%S")
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(host, username="root", password=pw, timeout=30, allow_agent=False, look_for_keys=False)
    sftp = c.open_sftp()
    rel, cur, inc = f"{BASE}/releases/{stamp}", f"{BASE}/current", f"{BASE}/incoming"
    mine = local_manifest()
    has_cur = run(c, f"test -d {cur} && echo yes || echo no").strip() == "yes"
    theirs: dict[str, str] = {}
    if has_cur and "--full" not in sys.argv:
        for line in run(c, f"cd {cur} && find . -type f -print0 | xargs -0 -r md5sum").splitlines():
            h, path = line.split(maxsplit=1)
            theirs[path[2:] if path.startswith("./") else path] = h
    send = [p for p, h in mine.items() if theirs.get(p) != h]
    drop = [p for p in theirs if p not in mine]
    print(f"{len(mine)} files: {len(send)} to upload, {len(drop)} to delete", flush=True)
    if not send and not drop and "--nginx" not in sys.argv:
        print("nothing to do", flush=True)
        return
    run(c, f"mkdir -p {BASE}/releases {inc} && " + (f"cp -al {cur}/. {rel}" if theirs else f"mkdir -p {rel}"))
    if send:
        with tempfile.TemporaryDirectory() as tmp:
            tgz = Path(tmp) / f"veudr-{stamp}.tar.gz"
            with tarfile.open(tgz, "w:gz", compresslevel=6) as tar:
                for p in send:
                    tar.add(PUBLIC / p, arcname=p)
            t0, last = time.time(), [time.time()]

            def progress(done, total):
                if time.time() - last[0] > 15:
                    last[0] = time.time()
                    print(f"  uploaded {done / 1e6:.0f}/{total / 1e6:.0f} MB ({done / max(time.time() - t0, 1) / 1e6:.2f} MB/s)", flush=True)
            sftp.put(str(tgz), f"{inc}/{tgz.name}", callback=progress)
            print(f"uploaded {tgz.stat().st_size / 1e6:.1f} MB in {time.time() - t0:.0f} s", flush=True)
        put_list(sftp, send, f"{inc}/send-{stamp}")
        # unlink the hard links first so the live release keeps its own copies, then unpack
        run(c, f"cd {rel} && xargs -0 -r rm -f < {inc}/send-{stamp} && tar -xzf {inc}/{tgz.name} -C {rel} && rm -f {inc}/{tgz.name} {inc}/send-{stamp}")
    if drop:
        put_list(sftp, drop, f"{inc}/drop-{stamp}")
        run(c, f"cd {rel} && xargs -0 -r rm -f < {inc}/drop-{stamp} && rm -f {inc}/drop-{stamp}")
    run(c, f"find {rel} -type d -exec chmod 755 {{}} + && find {rel} -type f -exec chmod 644 {{}} +")
    n = int(run(c, f"find {rel} -type f | wc -l").strip())
    if n != len(mine):
        raise SystemExit(f"release {rel} has {n} files, expected {len(mine)}: not switching")
    run(c, f"ln -sfn {rel} {BASE}/current.new && mv -T {BASE}/current.new {cur}")
    run(c, f"cd {BASE}/releases && ls -1d */ | sort | head -n -3 | xargs -r rm -rf")
    print(f"release {stamp} live: {n} files", flush=True)
    if "--nginx" in sys.argv:
        with sftp.open(SITE, "w") as f:
            f.write(NGINX)
        run(c, f"ln -sfn {SITE} /etc/nginx/sites-enabled/veudr && nginx -t 2>&1 && systemctl reload nginx")
        print("nginx site installed and reloaded", flush=True)
    print(run(c, "curl -s -o /dev/null -w 'local check: %{http_code} ' -H 'Host: veudr.vigil.green' http://127.0.0.1/ && "
                 "curl -s -o /dev/null -w 'vigil.green: %{http_code}\\n' -H 'Host: vigil.green' http://127.0.0.1/"), end="")
    sftp.close()
    c.close()


if __name__ == "__main__":
    main()
