import { z } from "zod";
import type { ResearchDatabase } from "./database";
import type {
  FencedJobInput,
  LeaseGrant,
  LeaseRequest,
  MaintenanceFence,
  MaintenanceLease,
  MaintenanceLeaseRequest,
} from "./types";

const LeaseRowSchema = z.object({
  lease_owner: z.string(),
  lease_token: z.number().int().positive(),
  lease_expires_at: z.string(),
});
export async function leaseJob(
  pool: ResearchDatabase,
  input: LeaseRequest,
): Promise<LeaseGrant | undefined> {
  const result = await pool.query(
    `WITH candidate AS (
    SELECT job_id FROM research.jobs WHERE job_id = $1 AND (
      status IN ('queued', 'retry-wait') OR (status = 'leased' AND lease_expires_at <= $2)
    ) FOR UPDATE SKIP LOCKED
  ) UPDATE research.jobs AS job SET status = 'leased', lease_owner = $3,
      lease_token = lease_token + 1, lease_expires_at = $4
    FROM candidate WHERE job.job_id = candidate.job_id
    RETURNING job.lease_owner, job.lease_token, job.lease_expires_at`,
    [input.jobId, input.now, input.ownerId, input.expiresAt],
  );
  if (!result.rows[0]) return undefined;
  const row = LeaseRowSchema.parse(result.rows[0]);
  return {
    ownerId: row.lease_owner,
    token: row.lease_token,
    expiresAt: row.lease_expires_at,
  };
}
export async function heartbeatJobLease(
  pool: ResearchDatabase,
  input: FencedJobInput & {
    readonly expiresAt: string;
  },
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE research.jobs SET lease_expires_at = $1
    WHERE job_id = $2 AND lease_owner = $3 AND lease_token = $4 AND lease_expires_at > $5`,
    [input.expiresAt, input.jobId, input.ownerId, input.token, input.now],
  );
  return result.rowCount === 1;
}
const MaintenanceRowSchema = z.object({
  lease_name: z.string(),
  owner_id: z.string(),
  phase: z.enum(["draining", "quiesced"]),
  fencing_token: z.number().int().positive(),
  expires_at: z.string(),
  maintenance_epoch: z.number().int().nonnegative(),
});
export async function acquireMaintenanceLease(
  pool: ResearchDatabase,
  input: MaintenanceLeaseRequest,
): Promise<MaintenanceLease | undefined> {
  const result = await pool.query(
    `INSERT INTO research.maintenance_leases (
    lease_name, owner_id, phase, fencing_token, expires_at
  ) VALUES ($1, $2, 'draining', 1, $3)
  ON CONFLICT (lease_name) DO UPDATE SET owner_id = EXCLUDED.owner_id,
    phase = 'draining', fencing_token = maintenance_leases.fencing_token + 1,
    expires_at = EXCLUDED.expires_at, completed_at = NULL
  WHERE maintenance_leases.expires_at <= $4
  RETURNING *`,
    [input.name, input.ownerId, input.expiresAt, input.now],
  );
  if (!result.rows[0]) return undefined;
  const row = MaintenanceRowSchema.parse(result.rows[0]);
  return {
    name: row.lease_name,
    ownerId: row.owner_id,
    phase: row.phase,
    token: row.fencing_token,
    expiresAt: row.expires_at,
    epoch: row.maintenance_epoch,
  };
}
export async function refreshMaintenanceLease(
  pool: ResearchDatabase,
  input: MaintenanceFence & {
    readonly expiresAt: string;
  },
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE research.maintenance_leases SET expires_at = $1
    WHERE lease_name = $2 AND owner_id = $3 AND fencing_token = $4 AND expires_at > $5`,
    [input.expiresAt, input.name, input.ownerId, input.token, input.now],
  );
  return result.rowCount === 1;
}
export async function quiesceMaintenanceLease(
  pool: ResearchDatabase,
  input: MaintenanceFence,
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE research.maintenance_leases SET phase = 'quiesced'
    WHERE lease_name = $1 AND owner_id = $2 AND fencing_token = $3 AND expires_at > $4 AND phase = 'draining'`,
    [input.name, input.ownerId, input.token, input.now],
  );
  return result.rowCount === 1;
}
export async function completeMaintenanceLease(
  pool: ResearchDatabase,
  input: MaintenanceFence & {
    readonly completedAt: string;
  },
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE research.maintenance_leases SET completed_at = $1
    WHERE lease_name = $2 AND owner_id = $3 AND fencing_token = $4 AND expires_at > $5 AND phase = 'quiesced'`,
    [input.completedAt, input.name, input.ownerId, input.token, input.now],
  );
  return result.rowCount === 1;
}
export async function releaseMaintenanceLease(
  pool: ResearchDatabase,
  input: MaintenanceFence,
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE research.maintenance_leases SET expires_at = $1
    WHERE lease_name = $2 AND owner_id = $3 AND fencing_token = $4 AND expires_at > $1`,
    [input.now, input.name, input.ownerId, input.token],
  );
  return result.rowCount === 1;
}
