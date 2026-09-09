# Historical Quality Evidence

[Repository guide](../README.md)

This directory contains selected evidence intentionally committed to Git. It is different from the ignored `.stocksembly-verification/` workspace used by current diagnostic commands.

## Current collection

`quality-gates/` contains comparator, integrity and valuation red/green text logs, plus `nvidia-real-run-scorecard.md`. These files record earlier experiments and evaluations.

## How to interpret the evidence

A red log records a failing condition at a particular point in development; a green log records a later observation. Neither establishes that today's code passes the same check. A scorecard is a historical result, not a live production metric.

When using a record in a review, identify the command, revision and input context available in the record. If that information is missing, state the limitation rather than assigning it to the current commit.

## Adding or cleaning records

Commit only evidence useful for future review, with its provenance. Keep bulk captures, credentials, raw private research data and temporary database copies out of this archive. Current local outputs should normally remain in ignored directories.

This pass retained the historical records and added a clear entry point. No runtime consumer was established for these records in the reviewed build path, but historical usefulness was not equated with runtime usage.
