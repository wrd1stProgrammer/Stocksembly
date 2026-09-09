# Coding-agent instructions

[Repository guide](../README.md) · [Cleanup decisions](../docs/repository-cleanup.md)

This directory contains instructions for AI tools used by developers. It does not define Stocksembly's investment analysts, committee representatives, or model execution stages. Product-agent roles live in [roleRegistry.ts](../src/research/domain/roleRegistry.ts); execution orchestration lives in [workflow](../src/research/workflow/).

## Contents and entry points

| File | Purpose | Consumer |
| --- | --- | --- |
| [React Doctor skill](skills/react-doctor/SKILL.md) | React diagnosis and remediation workflow | A coding assistant when the skill is selected |
| [Rule explanation reference](skills/react-doctor/references/explain.md) | Guidance for understanding diagnostics and configuration | Linked from the skill |

## Relationship to the CLI

`pnpm doctor` in `package.json` invokes `npx react-doctor@latest`. Reading the skill is not required to run the CLI. Conversely, the presence of this directory does not cause the web server or either worker to run React Doctor.

The [CI pipeline](../.github/workflows/pipeline.yml) does not invoke React Doctor as a required step. This is an optional development tool, not a publication gate. Because the command selects `@latest`, record the resolved tool version when retaining diagnostic evidence.

## Maintenance

Keep explanatory references consistent with the skill entrypoint. Review command examples against `package.json`. External playbook links describe a development workflow; they are not application dependencies. Documentation cleanup does not require running those playbooks or applying automated React fixes.

If the team retires the tool, review the skill, its reference file, the package command, and local coding-tool configuration together. This review retained the skill because its development purpose is identifiable; it is not obsolete product-agent code.
