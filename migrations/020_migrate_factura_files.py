#!/usr/bin/env python3
"""
Migration 020: Move existing factura PDFs from old S3 paths to org-hierarchical path.

Usage:
  DATABASE_URL=... S3_ENDPOINT_URL=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... \
  S3_BUCKET_NAME=realia-docs S3_PUBLIC_URL=... python migrations/020_migrate_factura_files.py

Safe to run multiple times (skips already-migrated files).
"""
import asyncio
import os
import time
from datetime import datetime

import asyncpg
import boto3
import httpx
from botocore.config import Config

DATABASE_URL = os.environ["DATABASE_URL"]
S3_ENDPOINT = os.environ.get("S3_ENDPOINT_URL", "")
S3_KEY = os.environ["S3_ACCESS_KEY_ID"]
S3_SECRET = os.environ["S3_SECRET_ACCESS_KEY"]
S3_BUCKET = os.environ.get("S3_BUCKET_NAME", "realia-docs")
S3_PUBLIC_URL = os.environ.get("S3_PUBLIC_URL", "").rstrip("/")
S3_REGION = os.environ.get("S3_REGION", "us-east-1")


def get_s3():
    return boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=S3_KEY,
        aws_secret_access_key=S3_SECRET,
        region_name=S3_REGION,
        config=Config(signature_version="s3v4"),
    )


async def migrate():
    conn = await asyncpg.connect(DATABASE_URL)
    s3 = get_s3()

    rows = await conn.fetch(
        """
        SELECT f.id, f.file_url, p.slug AS project_slug, p.organization_id
        FROM facturas f
        JOIN projects p ON p.id = f.project_id
        WHERE f.file_url IS NOT NULL
        """
    )

    print(f"Found {len(rows)} facturas with file_url")
    migrated = skipped = errors = 0

    async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
        for row in rows:
            file_url: str = row["file_url"]
            org_id = str(row["organization_id"]) if row["organization_id"] else None
            project_slug = row["project_slug"]
            factura_id = str(row["id"])

            # Skip if not in our S3 bucket
            if not S3_PUBLIC_URL or not file_url.startswith(S3_PUBLIC_URL):
                print(f"  SKIP (external URL) [{factura_id}]: {file_url}")
                skipped += 1
                continue

            old_key = file_url[len(S3_PUBLIC_URL):].lstrip("/")

            # Skip if already under the new hierarchy
            if org_id and old_key.startswith(f"orgs/{org_id}/"):
                print(f"  SKIP (already migrated) [{factura_id}]")
                skipped += 1
                continue

            if not org_id:
                print(f"  SKIP (no organization_id) [{factura_id}]")
                skipped += 1
                continue

            try:
                # Download from old location
                resp = await client.get(file_url)
                resp.raise_for_status()
                file_bytes = resp.content

                # Build new key
                filename = old_key.rsplit("/", 1)[-1]
                now = datetime.utcnow()
                ts = int(time.time())
                new_key = (
                    f"orgs/{org_id}/projects/{project_slug}/facturas/"
                    f"{now.year}/{now.month:02d}/{ts}_{filename}"
                )

                # Upload to new location
                s3.put_object(
                    Bucket=S3_BUCKET,
                    Key=new_key,
                    Body=file_bytes,
                    ContentType="application/pdf",
                )

                new_url = f"{S3_PUBLIC_URL}/{new_key}"

                # Update DB
                await conn.execute(
                    "UPDATE facturas SET file_url = $1 WHERE id = $2",
                    new_url,
                    row["id"],
                )

                # Delete old file
                s3.delete_object(Bucket=S3_BUCKET, Key=old_key)

                print(f"  OK [{factura_id}]: {old_key} → {new_key}")
                migrated += 1

            except Exception as e:
                print(f"  ERROR [{factura_id}]: {e}")
                errors += 1

    await conn.close()
    print(f"\nDone: {migrated} migrated, {skipped} skipped, {errors} errors")


if __name__ == "__main__":
    asyncio.run(migrate())
