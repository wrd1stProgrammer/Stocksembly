"""Publish provider configuration without placing credentials in SSM commands."""
import json
import os
import pathlib
import subprocess
import tempfile

keys = [
    "INSIGHTSENTRY_RAPIDAPI_HOST", "INSIGHTSENTRY_RAPIDAPI_KEY",
    "WHOP_API_BASE", "WHOP_API_KEY", "WHOP_COMPANY_ID", "WHOP_PRODUCT_ID",
    "WHOP_PLAN_PRO_ANNUAL_ID", "WHOP_PLAN_PRO_MONTHLY_ID",
    "WHOP_PLAN_PRO_MONTHLY_LIVE_TEST_ID", "WHOP_PLAN_ULTRA_ANNUAL_ID",
    "WHOP_PLAN_ULTRA_MONTHLY_ID", "WHOP_SANDBOX", "WHOP_WEBHOOK_SECRET",
    "META_CONVERSIONS_API_ACCESS_TOKEN", "META_GRAPH_API_VERSION", "META_PIXEL_ID",
]
values = {key: os.environ[key] for key in keys}
if any("\n" in value or "\r" in value for value in values.values()):
    raise SystemExit("Provider configuration must contain single-line values")
with tempfile.TemporaryDirectory() as directory:
    path = pathlib.Path(directory) / "providers.json"
    path.write_text(json.dumps(values))
    path.chmod(0o600)
    subprocess.run([
        "aws", "secretsmanager", "put-secret-value",
        "--secret-id", "stocksembly/prod/providers",
        "--secret-string", f"file://{path}",
        "--query", "ARN", "--output", "text",
    ], check=True)
