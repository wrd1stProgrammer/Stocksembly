try {
  const worker = await import("./briefingWorker.js");
  await worker.runBriefingWorkerProcess(process.argv.slice(2));
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      kind: "briefing_worker_error",
      message: error instanceof Error ? error.message : "unknown",
    })}\n`,
  );
  process.exitCode = 1;
}
