# GitHub Automation and Collaboration

[Repository guide](../README.md)

This directory contains repository automation and issue/PR templates. It is not application runtime code.

## Workflows

| Workflow | Trigger and role | Important boundary |
| --- | --- | --- |
| `workflows/pipeline.yml` | Pull requests, pushes to main, and manual dispatch; runs quality checks and conditional deployment | Deployment requires a main push, successful quality job, and a production-change result of true |
| `workflows/provision-test-account.yml` | Test-account provisioning workflow | Operational action; inspect inputs and target before dispatch |

The quality job installs dependencies, evaluates deterministic research fixtures, checks focused research contracts, tests CI helper scripts, typechecks, lints changed files, builds the package, and checks packaged worker startup. Read the workflow for the exact current command order and versions.

`ci-production-change.sh` uses a path allowlist to decide whether deployment is required. Not every Markdown path is exempt. In particular, adding a README under an arbitrary directory is not automatically a documentation-only deployment decision.

## Templates

`ISSUE_TEMPLATE/bug_report.md` and `feature_request.md` structure incoming work. `PULL_REQUEST_TEMPLATE.md` structures change descriptions. Follow [CONTRIBUTING.md](../CONTRIBUTING.md) for collaboration and the chosen release flow.

## Maintenance

Keep workflow commands consistent with `package.json` and the script index. A green quality job does not mean the deployment job ran: deployment may be skipped by its conditions. Record those states separately in release notes or handoffs. Do not place secrets in templates or workflow literals.
