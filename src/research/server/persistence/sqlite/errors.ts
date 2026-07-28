export class SqliteConfigurationError extends Error {
  public readonly setting: string;

  public constructor(setting: string, actual: unknown) {
    super(`SQLite setting ${setting} has unexpected value ${String(actual)}`);
    this.name = "SqliteConfigurationError";
    this.setting = setting;
  }
}

export class MigrationIntegrityError extends Error {
  public readonly version: number;

  public constructor(version: number, reason: string) {
    super(`SQLite migration ${version} failed integrity validation: ${reason}`);
    this.name = "MigrationIntegrityError";
    this.version = version;
  }
}

export class StateConflictError extends Error {
  public readonly identity: string;

  public constructor(identity: string, reason: string) {
    super(`Durable state conflict for ${identity}: ${reason}`);
    this.name = "StateConflictError";
    this.identity = identity;
  }
}

export class LaunchReservationError extends Error {
  public readonly attemptId: string;

  public constructor(attemptId: string, reason: string) {
    super(`Launch reservation ${attemptId} rejected: ${reason}`);
    this.name = "LaunchReservationError";
    this.attemptId = attemptId;
  }
}

export class IdempotencyConflictError extends Error {
  public readonly scope: string;
  public readonly key: string;

  public constructor(scope: string, key: string) {
    super(
      `Idempotency key ${scope}/${key} was reused with a different request`,
    );
    this.name = "IdempotencyConflictError";
    this.scope = scope;
    this.key = key;
  }
}

export class UnsafePersistenceValueError extends Error {
  public readonly path: string;

  public constructor(path: string, reason: string) {
    super(`Unsafe persistence value at ${path}: ${reason}`);
    this.name = "UnsafePersistenceValueError";
    this.path = path;
  }
}
