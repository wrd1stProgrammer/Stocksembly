"""Update bootstrap only after a successful web rollout, using the CI role."""
import json
import os
import re


def prepare_config(config, environment):
    """Keep stable infrastructure settings; inject the CI runtime configuration."""
    result = dict(config)
    for name in ("awsEnv", "appEnv"):
        lines = []
        for line in config[name].splitlines():
            key = line.partition("=")[0]
            if key in {"NODE_OPTIONS", "NODE_PATH", "LD_PRELOAD", "LD_LIBRARY_PATH", "PATH", "BASH_ENV", "ENV"}:
                raise ValueError("Unsafe bootstrap environment key")
            if re.match(r"^(WHOP_|INSIGHTSENTRY_|META_|GA4_|SENTRY_)", key):
                continue
            if key.startswith("STOCKSEMBLY_ADMIN_ANALYTICS_"):
                continue
            lines.append(line)
        result[name] = "\n".join(lines) + "\n"
    values = {
        "SENTRY_DSN": environment.get("SENTRY_DSN", ""),
        "SENTRY_RELEASE": environment["GITHUB_SHA"],
        "SENTRY_TRACES_SAMPLE_RATE": environment.get("SENTRY_TRACES_SAMPLE_RATE", "0.1"),
        "SENTRY_PROFILE_SESSION_SAMPLE_RATE": environment.get("SENTRY_PROFILE_SESSION_SAMPLE_RATE", "1"),
        "SENTRY_METRICS_ENABLED": environment.get("SENTRY_METRICS_ENABLED", "true"),
        "STOCKSEMBLY_ADMIN_ANALYTICS_READS_ENABLED": "true",
        "STOCKSEMBLY_ADMIN_ANALYTICS_WRITES_ENABLED": "true",
    }
    for key, value in values.items():
        if "\n" in value or "\r" in value:
            raise ValueError("Invalid runtime configuration")
        result["appEnv"] += f"{key}={value}\n"
    return result


if __name__ == "__main__":
    import boto3

    client = boto3.client("secretsmanager")
    secret = os.environ.get("WEB_BOOTSTRAP_SECRET_ARN", "stocksembly/prod/web-bootstrap")
    current = client.get_secret_value(SecretId=secret)
    config = prepare_config(json.loads(current["SecretString"]), os.environ)
    client.put_secret_value(SecretId=secret, SecretString=json.dumps(config))
    print("Web bootstrap configuration updated")
