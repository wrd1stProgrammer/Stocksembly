"""Run once with an administrator role before merging provider-secret deployment."""
import json
import os
import boto3

region = os.environ.get("AWS_REGION", "us-east-1")
session = boto3.Session(region_name=region)
secrets = session.client("secretsmanager")
name = "stocksembly/prod/providers"
try:
    arn = secrets.describe_secret(SecretId=name)["ARN"]
except secrets.exceptions.ResourceNotFoundException:
    arn = secrets.create_secret(Name=name, Description="Stocksembly provider environment")["ARN"]
iam = session.client("iam")
roles = {
    os.environ["WEB_RUNTIME_ROLE"]: ["secretsmanager:GetSecretValue"],
    os.environ["WORKER_RUNTIME_ROLE"]: ["secretsmanager:GetSecretValue"],
    os.environ["DEPLOY_ROLE"]: ["secretsmanager:PutSecretValue"],
}
for role, actions in roles.items():
    iam.put_role_policy(RoleName=role, PolicyName="stocksembly-provider-secret",
        PolicyDocument=json.dumps({"Version": "2012-10-17", "Statement": [
            {"Effect": "Allow", "Action": actions, "Resource": arn}
        ]}))
print("Provider secret and role-scoped permissions configured.")
