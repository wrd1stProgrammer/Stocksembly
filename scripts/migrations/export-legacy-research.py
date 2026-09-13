#!/usr/bin/env python3
"""One-time offline transfer utility. Never imported by application runtime."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3


def quote(name):
    return '"' + name.replace('"', '""') + '"'


def export_database(source, destination, ledger=False):
    connection = sqlite3.connect(source.resolve().as_uri() + '?mode=ro', uri=True)
    connection.execute('BEGIN')
    try:
        if connection.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('Source database integrity check failed')
        if connection.execute('PRAGMA foreign_key_check').fetchone() is not None:
            raise RuntimeError('Source database has foreign-key violations')
        version = None if ledger else connection.execute('SELECT max(version) FROM schema_migrations').fetchone()[0]
        if not ledger and version != 32:
            raise RuntimeError('Expected research source schema version 32; inspect version mapping before transfer')
        tables = connection.execute("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('schema_migrations', 'maintenance_leases') ORDER BY name").fetchall()
        results = []
        for (name,) in tables:
            if ledger and name not in ('news_events', 'news_candidate_classifications'):
                raise RuntimeError('Unexpected news ledger table: ' + name)
            columns = [{'name': row[1], 'type': row[2]} for row in connection.execute('PRAGMA table_info(' + quote(name) + ')')]
            filename = name + '.jsonl'
            path = destination / filename
            count = 0
            digest = hashlib.sha256()
            with path.open('xb') as output:
                os.chmod(path, 0o600)
                for row in connection.execute('SELECT * FROM ' + quote(name) + ' ORDER BY rowid'):
                    # Decimal strings avoid losing SQLite's 64-bit integer values
                    # in JavaScript JSON.parse before PostgreSQL type checking.
                    values = []
                    for value in row:
                        if value is None or isinstance(value, str):
                            values.append(value)
                        elif isinstance(value, int):
                            values.append(str(value))
                        elif isinstance(value, float):
                            values.append(format(value, '.17g'))
                        else:
                            raise RuntimeError('Unexpected binary value in ' + name)
                    line = (json.dumps(values, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')
                    output.write(line)
                    digest.update(line)
                    count += 1
            results.append({'name': name, 'file': filename, 'columns': columns, 'rows': count, 'sha256': digest.hexdigest()})
        return version, results
    finally:
        connection.rollback()
        connection.close()


def main():
    parser = argparse.ArgumentParser(description='Export a consistent read-only legacy research snapshot; drain writers before the final cutover export.')
    parser.add_argument('--research', required=True, type=Path)
    parser.add_argument('--news', type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    args.output.mkdir(mode=0o700, parents=False, exist_ok=False)
    version, tables = export_database(args.research, args.output)
    if args.news:
        _, news = export_database(args.news, args.output, ledger=True)
        tables.extend(news)
    manifest = {'format': 'stocksembly-research-transfer-v1', 'sourceSchemaVersion': version, 'newsIncluded': args.news is not None, 'tables': tables}
    raw = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    path = args.output / 'manifest.json'
    path.write_bytes(raw)
    os.chmod(path, 0o600)
    print(json.dumps({'tables': len(tables), 'rows': sum(table['rows'] for table in tables), 'manifestSha256': hashlib.sha256(raw).hexdigest()}))


if __name__ == '__main__':
    main()
