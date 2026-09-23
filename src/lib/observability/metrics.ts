import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import * as Sentry from "@sentry/node";
import type { Pool } from "pg";

const INTERVAL_MS = 60_000;
export function metricsEnabled(): boolean {
  return (
    Sentry.isInitialized() && process.env["SENTRY_METRICS_ENABLED"] !== "false"
  );
}

/** In-process counters only: no database queries or separate polling requests. */
export function startRuntimeMetrics(): void {
  if (!metricsEnabled()) return;
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  let previousCpu = process.cpuUsage();
  let previousTime = performance.now();
  const timer = setInterval(() => {
    if (!metricsEnabled()) {
      clearInterval(timer);
      delay.disable();
      return;
    }
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    const now = performance.now();
    Sentry.metrics.gauge("process.memory.rss", memory.rss, { unit: "byte" });
    Sentry.metrics.gauge("process.memory.heap_used", memory.heapUsed, {
      unit: "byte",
    });
    Sentry.metrics.gauge(
      "process.cpu.utilization",
      (cpu.user + cpu.system - previousCpu.user - previousCpu.system) /
        ((now - previousTime) * 1_000),
    );
    const p99 = delay.percentile(99) / 1_000_000;
    if (Number.isFinite(p99))
      Sentry.metrics.gauge("process.event_loop.delay.p99", p99, {
        unit: "millisecond",
      });
    previousCpu = cpu;
    previousTime = now;
    delay.reset();
  }, INTERVAL_MS);
  timer.unref();
}

export function observePool(
  pool: Pick<
    Pool,
    "totalCount" | "idleCount" | "waitingCount" | "options" | "ending"
  >,
  name: "accounts" | "research" | "other",
) {
  let acquisitions = 0;
  let failures = 0;
  let totalWait = 0;
  let maxWait = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const attributes = { pool: name };
  // Start lazily: pool construction can precede instrumentation registration.
  return (durationMs: number, failed: boolean) => {
    if (!metricsEnabled()) return;
    acquisitions++;
    failures += Number(failed);
    totalWait += durationMs;
    maxWait = Math.max(maxWait, durationMs);
    timer ??= setInterval(() => {
      if (pool.ending || !metricsEnabled()) {
        clearInterval(timer);
        timer = undefined;
        return;
      }
      Sentry.metrics.gauge("db.pool.connections", pool.totalCount, {
        attributes,
      });
      Sentry.metrics.gauge("db.pool.idle", pool.idleCount, { attributes });
      Sentry.metrics.gauge("db.pool.waiting", pool.waitingCount, {
        attributes,
      });
      Sentry.metrics.gauge("db.pool.limit", pool.options.max ?? 10, {
        attributes,
      });
      if (acquisitions) {
        Sentry.metrics.count("db.pool.acquisitions", acquisitions, {
          attributes,
        });
        Sentry.metrics.gauge("db.pool.acquire.mean", totalWait / acquisitions, {
          unit: "millisecond",
          attributes,
        });
        Sentry.metrics.gauge("db.pool.acquire.max", maxWait, {
          unit: "millisecond",
          attributes,
        });
      }
      if (failures)
        Sentry.metrics.count("db.pool.acquire.failures", failures, {
          attributes,
        });
      acquisitions = failures = totalWait = maxWait = 0;
    }, INTERVAL_MS);
    timer.unref();
  };
}
