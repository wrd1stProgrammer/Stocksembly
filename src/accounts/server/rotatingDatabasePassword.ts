export type DatabasePasswordLoader = () => Promise<string>;

export function rotatingDatabasePassword(
  initialPassword: string,
  loadLatestPassword: DatabasePasswordLoader,
): DatabasePasswordLoader {
  let lastKnownPassword = initialPassword;

  return async () => {
    try {
      lastKnownPassword = await loadLatestPassword();
    } catch {
      // An already-open database remains usable during a short Secrets Manager
      // outage. New connections can fall back to the last verified password.
    }
    return lastKnownPassword;
  };
}
