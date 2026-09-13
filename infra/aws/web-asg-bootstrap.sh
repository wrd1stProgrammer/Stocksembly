#!/usr/bin/env bash
set -euo pipefail
umask 077
region=us-east-1
bucket=stocksembly-prod-359463332817-us-east-1
export AWS_DEFAULT_REGION="$region"
dnf install -y docker nginx
systemctl enable --now docker amazon-ssm-agent
install -d -m 0700 /etc/stocksembly /opt/stocksembly/container
install -d -m 0700 -o ec2-user -g ec2-user /var/lib/stocksembly/research
aws secretsmanager get-secret-value --secret-id stocksembly/prod/web-bootstrap --query SecretString --output text > /run/stocksembly-web-config.json
python3 - <<'PY'
import json, pathlib
config = json.loads(pathlib.Path('/run/stocksembly-web-config.json').read_text())
for key, name in [('awsEnv','aws.env'),('appEnv','app.env')]:
    path = pathlib.Path('/etc/stocksembly') / name
    path.write_text(config[key])
    path.chmod(0o600)
pathlib.Path('/run/stocksembly-web-config.json').unlink()
PY
aws s3 cp "s3://$bucket/operations/web/role-deploy.sh" /usr/local/bin/stocksembly-role-deploy --only-show-errors
chmod 0755 /usr/local/bin/stocksembly-role-deploy
aws s3 cp "s3://$bucket/operations/web/web-alb-nginx.conf" /etc/nginx/conf.d/stocksembly-alb.conf --only-show-errors
nginx -t
systemctl enable --now nginx
touch /etc/stocksembly/asg-web
image="$(aws ssm get-parameter --name /stocksembly/prod/web/image --query Parameter.Value --output text)"
/usr/local/bin/stocksembly-role-deploy web "$image"
