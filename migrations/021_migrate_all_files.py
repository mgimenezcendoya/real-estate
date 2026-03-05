#!/usr/bin/env python3
"""
Migration 021: Move ALL existing S3 files from projects/{slug}/... to
orgs/{org_id}/projects/{slug}/... (org-hierarchical structure).

Handles: documents, obra_fotos, and any other files under projects/.
Updates DB records in documents and obra_fotos tables.
Uses server-side S3 copy (fast, no download/reupload needed).

Usage:
  DATABASE_URL=... S3_ENDPOINT_URL=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... \
  S3_BUCKET_NAME=real-state S3_PUBLIC_URL=... python migrations/021_migrate_all_files.py

Safe to run multiple times (skips already-migrated files under orgs/).
"""
import asyncio
import os

import asyncpg
import boto3
from botocore.config import Config

DATABASE_URL = os.environ["DATABASE_URL"]
S3_ENDPOINT = os.environ.get("S3_ENDPOINT_URL", "")
S3_KEY = os.environ["S3_ACCESS_KEY_ID"]
S3_SECRET = os.environ["S3_SECRET_ACCESS_KEY"]
S3_BUCKET = os.environ.get("S3_BUCKET_NAME", "real-state")
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


def list_all_objects(s3, prefix: str) -> list[str]:
    """List all S3 object keys under a prefix (handles pagination)."""
    keys = []
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=S3_BUCKET, Prefix=prefix):
        for obj in page.get("Contents", []):
            keys.append(obj["Key"])
    return keys


async def migrate():
    conn = await asyncpg.connect(DATABASE_URL)
    s3 = get_s3()

    # Build slug → org_id map from DB
    projects = await conn.fetch("SELECT slug, organization_id FROM projects WHERE slug IS NOT NULL")
    slug_to_org = {row["slug"]: str(row["organization_id"]) for row in projects if row["organization_id"]}
    print(f"Loaded {len(slug_to_org)} projects with org_id")

    # List all files under projects/
    all_keys = list_all_objects(s3, "projects/")
    print(f"Found {len(all_keys)} S3 objects under projects/")

    copied = skipped = errors = 0

    for old_key in all_keys:
        # Extract slug: projects/{slug}/...
        parts = old_key.split("/")
        if len(parts) < 3:
            print(f"  SKIP (unexpected path): {old_key}")
            skipped += 1
            continue

        slug = parts[1]
        org_id = slug_to_org.get(slug)
        if not org_id:
            print(f"  SKIP (no org for slug '{slug}'): {old_key}")
            skipped += 1
            continue

        # Build new key: orgs/{org_id}/projects/{slug}/...
        new_key = f"orgs/{org_id}/" + old_key

        try:
            # Server-side copy (no download needed)
            s3.copy_object(
                Bucket=S3_BUCKET,
                CopySource={"Bucket": S3_BUCKET, "Key": old_key},
                Key=new_key,
            )

            old_url = f"{S3_PUBLIC_URL}/{old_key}"
            new_url = f"{S3_PUBLIC_URL}/{new_key}"

            # Update documents table
            await conn.execute(
                "UPDATE documents SET file_url = $1 WHERE file_url = $2",
                new_url, old_url,
            )

            # Update obra_fotos table
            await conn.execute(
                "UPDATE obra_fotos SET file_url = $1 WHERE file_url = $2",
                new_url, old_url,
            )

            # Delete old S3 object
            s3.delete_object(Bucket=S3_BUCKET, Key=old_key)

            print(f"  OK: {old_key} → {new_key}")
            copied += 1

        except Exception as e:
            print(f"  ERROR [{old_key}]: {e}")
            errors += 1

    await conn.close()
    print(f"\nDone: {copied} migrated, {skipped} skipped, {errors} errors")


if __name__ == "__main__":
    asyncio.run(migrate())
