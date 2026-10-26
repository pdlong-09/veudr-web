"""Upload the new veudr-link.js and bump its version in the vigil nginx site (cache-busting), with backup and nginx -t."""
import os, time, paramiko
HERE = os.path.dirname(os.path.abspath(__file__)); SITE = "/etc/nginx/sites-available/vigil"; stamp = time.strftime("%Y%m%d-%H%M%S")
c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(os.environ["VPS_HOST"], username="root", password=os.environ["VPS_PW"], timeout=30, allow_agent=False, look_for_keys=False)
def run(cmd, check=True):
    _, o, e = c.exec_command(cmd, timeout=120); out, err, rc = o.read().decode(), e.read().decode(), o.channel.recv_exit_status()
    if check and rc: raise SystemExit(f"FAILED ({rc}) {cmd}\n{out}{err}")
    return out + err
sftp = c.open_sftp(); conf = sftp.open(SITE).read().decode()
old = '<script src="/__veudr/veudr-link.js?v=2" defer></script>'
assert conf.count(old) == 1
new = conf.replace(old, '<script src="/__veudr/veudr-link.js?v=3" defer></script>')
run(f"cp -a {SITE} /root/nginx-vigil.bak-{stamp}")
sftp.put(os.path.join(HERE, "veudr-link.js"), "/var/www/vigil-addon/veudr-link.js")
with sftp.open(SITE, "w") as f: f.write(new)
t = run("nginx -t 2>&1", check=False)
if "test is successful" not in t:
    run(f"cp -a /root/nginx-vigil.bak-{stamp} {SITE}"); raise SystemExit("nginx -t failed, restored: " + t)
run("systemctl reload nginx"); print(run(f"diff /root/nginx-vigil.bak-{stamp} {SITE}", check=False))
c.close()
