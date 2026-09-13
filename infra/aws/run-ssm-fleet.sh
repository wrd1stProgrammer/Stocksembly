#!/usr/bin/env bash
set -euo pipefail
# Run serially so a future multi-instance fleet retains healthy serving capacity.
parameters="$1"
mode="${2:-quiet}"
read -r -a instances <<< "${INSTANCE_IDS:?No deployment instances resolved}"
[[ ${#instances[@]} -gt 0 ]] || exit 78
for instance in "${instances[@]}"; do
  target_group=""
  if [[ "$mode" == deploy && "${RUNTIME_ROLE:-}" == web && ${#instances[@]} -gt 1 ]]; then
    target_group="$(aws ssm get-parameter --name /stocksembly/prod/web/target-group --query Parameter.Value --output text)"
    aws elbv2 deregister-targets --target-group-arn "$target_group" --targets "Id=$instance"
    aws elbv2 wait target-deregistered --target-group-arn "$target_group" --targets "Id=$instance"
  fi
  restore_target() {
    if [[ -n "$target_group" ]]; then
      aws elbv2 register-targets --target-group-arn "$target_group" --targets "Id=$instance"
    fi
  }
  trap restore_target EXIT
  command_id="$(aws ssm send-command --instance-ids "$instance" --document-name AWS-RunShellScript --timeout-seconds 2400 --parameters "file://$parameters" --query Command.CommandId --output text)"
  status=Pending
  for attempt in {1..480}; do
    status="$(aws ssm get-command-invocation --command-id "$command_id" --instance-id "$instance" --query Status --output text 2>/dev/null || true)"
    case "$status" in Success|Failed|Cancelled|TimedOut|Cancelling) break ;; esac
    sleep 5
  done
  if [[ "$mode" == deploy ]]; then
    aws ssm get-command-invocation --command-id "$command_id" --instance-id "$instance" --query '{status:Status,stdout:StandardOutputContent,stderr:StandardErrorContent}'
  fi
  [[ "$status" == Success ]] || { echo "Deployment command failed: $instance $status" >&2; exit 1; }
  restore_target
  trap - EXIT
  if [[ -n "$target_group" ]]; then
    aws elbv2 wait target-in-service --target-group-arn "$target_group" --targets "Id=$instance"
  fi
done
