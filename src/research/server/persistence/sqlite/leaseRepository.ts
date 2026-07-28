import type Database from "better-sqlite3";
import { z } from "zod";
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
const MaintenanceRowSchema = z.object({
  lease_name: z.string(),
  owner_id: z.string(),
  phase: z.enum(["draining", "quiesced"]),
  fencing_token: z.number().int().positive(),
  expires_at: z.string(),
  maintenance_epoch: z.number().int().nonnegative(),
});

export function leaseJob(
  database: Database.Database,
  input: LeaseRequest,
): LeaseGrant | undefined {
  const value = database
    .transaction(() =>
      database
        .prepare(`UPDATE jobs SET
        status = 'leased', lease_owner = @ownerId,
        lease_token = lease_token + 1, lease_expires_at = @expiresAt
      WHERE job_id = @jobId AND (
        status IN ('queued', 'retry-wait') OR
        (status = 'leased' AND lease_expires_at <= @now)
      )
      RETURNING lease_owner, lease_token, lease_expires_at`)
        .get(input),
    )
    .immediate();
  if (value === undefined) return undefined;
  const row = LeaseRowSchema.parse(value);
  return {
    ownerId: row.lease_owner,
    token: row.lease_token,
    expiresAt: row.lease_expires_at,
  };
}

export function heartbeatJobLease(
  database: Database.Database,
  input: FencedJobInput & { readonly expiresAt: string },
): boolean {
  return (
    database
      .prepare(`UPDATE jobs SET lease_expires_at = @expiresAt
        WHERE job_id = @jobId AND lease_owner = @ownerId
          AND lease_token = @token AND lease_expires_at > @now`)
      .run(input).changes === 1
  );
}

export function acquireMaintenanceLease(
  database: Database.Database,
  input: MaintenanceLeaseRequest,
): MaintenanceLease | undefined {
  const value = database
    .transaction(() => {
      const current = database
        .prepare("SELECT * FROM maintenance_leases WHERE lease_name = ?")
        .get(input.name);
      if (current === undefined) {
        return database
          .prepare(`INSERT INTO maintenance_leases(
          lease_name, owner_id, phase, fencing_token, expires_at
        ) VALUES (@name, @ownerId, 'draining', 1, @expiresAt)
        RETURNING *`)
          .get(input);
      }
      const lease = MaintenanceRowSchema.parse(current);
      if (lease.expires_at > input.now) return undefined;
      return database
        .prepare(`UPDATE maintenance_leases SET
        owner_id = @ownerId, phase = 'draining',
        fencing_token = fencing_token + 1, expires_at = @expiresAt,
        completed_at = NULL
      WHERE lease_name = @name AND fencing_token = @token AND expires_at <= @now
      RETURNING *`)
        .get({ ...input, token: lease.fencing_token });
    })
    .immediate();
  if (value === undefined) return undefined;
  const row = MaintenanceRowSchema.parse(value);
  return {
    name: row.lease_name,
    ownerId: row.owner_id,
    phase: row.phase,
    token: row.fencing_token,
    expiresAt: row.expires_at,
    epoch: row.maintenance_epoch,
  };
}

export function refreshMaintenanceLease(
  database: Database.Database,
  input: MaintenanceFence & { readonly expiresAt: string },
): boolean {
  return (
    database
      .prepare(`UPDATE maintenance_leases SET expires_at = @expiresAt
        WHERE lease_name = @name AND owner_id = @ownerId
          AND fencing_token = @token AND expires_at > @now`)
      .run(input).changes === 1
  );
}

export function quiesceMaintenanceLease(
  database: Database.Database,
  input: MaintenanceFence,
): boolean {
  return (
    database
      .prepare(`UPDATE maintenance_leases SET phase = 'quiesced'
        WHERE lease_name = @name AND owner_id = @ownerId
          AND fencing_token = @token AND phase = 'draining' AND expires_at > @now`)
      .run(input).changes === 1
  );
}

export function completeMaintenanceLease(
  database: Database.Database,
  input: MaintenanceFence & { readonly completedAt: string },
): boolean {
  return (
    database
      .prepare(`UPDATE maintenance_leases SET completed_at = @completedAt
        WHERE lease_name = @name AND owner_id = @ownerId
          AND fencing_token = @token AND phase = 'quiesced' AND expires_at > @now`)
      .run(input).changes === 1
  );
}

export function releaseMaintenanceLease(
  database: Database.Database,
  input: MaintenanceFence,
): boolean {
  return (
    database
      .prepare(`UPDATE maintenance_leases SET expires_at = @now
        WHERE lease_name = @name AND owner_id = @ownerId
          AND fencing_token = @token AND expires_at > @now`)
      .run(input).changes === 1
  );
}
