import type { ResearchDatabase } from "../persistence/postgres/database";

export function sessionRevocations(database: ResearchDatabase) {
  return {
    async isRevoked(key: string): Promise<boolean> {
      const result = await database.query(
        "SELECT 1 FROM auth_session_revocations WHERE session_key = $1 AND expires_at > now()",
        [key],
      );
      return result.rows.length > 0;
    },
    async revoke(key: string, expiresAt: number): Promise<void> {
      await database.query(
        `INSERT INTO auth_session_revocations(session_key, expires_at) VALUES ($1, to_timestamp($2))
         ON CONFLICT (session_key) DO UPDATE SET expires_at = GREATEST(auth_session_revocations.expires_at, EXCLUDED.expires_at)`,
        [key, expiresAt],
      );
      await database.query(
        "DELETE FROM auth_session_revocations WHERE expires_at < now()",
      );
    },
  };
}
