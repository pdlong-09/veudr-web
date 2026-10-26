"""Install the vEUDR header link on vigil.green: upload the script, add (never remove) a few lines to the vigil nginx
site, test, reload; restore the backup if nginx -t fails.  VPS_HOST=<ip> VPS_PW=... python apply.py"""
import os, sys, time, paramiko
HERE = os.path.dirname(os.path.abspath(__file__)); SITE = "/etc/nginx/sites-available/vigil"; stamp = time.strftime("%Y%m%d-%H%M%S")
c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(os.environ["VPS_HOST"], username="root", password=os.environ["VPS_PW"], timeout=30, allow_agent=False, look_for_keys=False)
def run(cmd, check=True):
    _, o, e = c.exec_command(cmd, timeout=120); out, err, rc = o.read().decode(), e.read().decode(), o.channel.recv_exit_status()
    if check and rc: raise SystemExit(f"FAILED ({rc}) {cmd}\n{out}{err}")
    return out + err
sftp = c.open_sftp()
conf = sftp.open(SITE).read().decode()
if "vEUDR" in conf: sys.exit("already installed")
loc = "    location / {\n        proxy_pass http://127.0.0.1:3000;\n"
assert conf.count(loc) == 1, "anchor 'location /' not found exactly once"
new = conf.replace(loc, loc + """        # vEUDR: add the header link script to HTML pages (the app itself is unchanged); uncompressed upstream so sub_filter can see </body>
        proxy_set_header Accept-Encoding "";
        sub_filter '</body>' '<script src="/__veudr/veudr-link.js" defer></script></body>';
        sub_filter_once on;
""")
srv = "    access_log /var/log/nginx/vigil_access.log;\n"
assert new.count(srv) == 1
new = new.replace(srv, srv + """    # vEUDR: the header link script, and gzip by nginx for what Next.js no longer compresses itself
    location = /__veudr/veudr-link.js { alias /var/www/vigil-addon/veudr-link.js; default_type application/javascript; add_header Cache-Control "public, max-age=600"; }
    gzip_proxied any;
    gzip_types text/css application/javascript text/javascript application/json text/x-component image/svg+xml text/plain;
""")
run(f"cp -a {SITE} /root/nginx-vigil.bak-{stamp} && mkdir -p /var/www/vigil-addon")
sftp.put(os.path.join(HERE, "veudr-link.js"), "/var/www/vigil-addon/veudr-link.js"); run("chmod 644 /var/www/vigil-addon/veudr-link.js")
with sftp.open(SITE, "w") as f: f.write(new)
t = run("nginx -t 2>&1", check=False)
if "test is successful" not in t:
    run(f"cp -a /root/nginx-vigil.bak-{stamp} {SITE}"); print(t); raise SystemExit("nginx -t failed: backup restored, nginx not reloaded")
run("systemctl reload nginx"); print(f"installed; backup at /root/nginx-vigil.bak-{stamp}")
print(run(f"diff /root/nginx-vigil.bak-{stamp} {SITE}", check=False))
print(run("for p in / /about /map /publication /contact /__veudr/veudr-link.js; do curl -s -o /tmp/x -w \"%{http_code} \" -H 'Host: vigil.green' http://127.0.0.1$p; grep -c veudr-link /tmp/x | tr '\n' ' '; echo \"<- $p\"; done"))
c.close()
