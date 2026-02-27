"""
Seed script: inserts Manzanares 2088 project with units and dummy documents.
Run: python -m scripts.seed_manzanares
"""

import asyncio
import os
import sys

import asyncpg
import boto3
from botocore.config import Config
from dotenv import load_dotenv

load_dotenv()

PROJECT = {
    "name": "Manzanares 2088",
    "whatsapp_number": "+14155238886",
    "status": "active",
}

UNITS = [
    {"identifier": "1A", "floor": 1, "bedrooms": 1, "area_m2": 35, "price_usd": 58000, "status": "available"},
    {"identifier": "1B", "floor": 1, "bedrooms": 2, "area_m2": 50, "price_usd": 78000, "status": "available"},
    {"identifier": "2A", "floor": 2, "bedrooms": 2, "area_m2": 52, "price_usd": 82000, "status": "available"},
    {"identifier": "2B", "floor": 2, "bedrooms": 2, "area_m2": 55, "price_usd": 86000, "status": "reserved"},
    {"identifier": "3A", "floor": 3, "bedrooms": 3, "area_m2": 72, "price_usd": 115000, "status": "available"},
    {"identifier": "3B", "floor": 3, "bedrooms": 3, "area_m2": 75, "price_usd": 120000, "status": "available"},
    {"identifier": "4A", "floor": 4, "bedrooms": 3, "area_m2": 78, "price_usd": 130000, "status": "available"},
    {"identifier": "PH", "floor": 5, "bedrooms": 4, "area_m2": 110, "price_usd": 195000, "status": "available"},
]

DOCUMENTS = [
    {"doc_type": "brochure", "filename": "brochure_manzanares_2088.pdf"},
    {"doc_type": "precios", "filename": "lista_precios_manzanares_2088.pdf"},
    {"doc_type": "plano", "filename": "plano_1A.pdf", "unit_identifier": "1A", "floor": 1},
    {"doc_type": "plano", "filename": "plano_2B.pdf", "unit_identifier": "2B", "floor": 2},
    {"doc_type": "plano", "filename": "plano_3A.pdf", "unit_identifier": "3A", "floor": 3},
    {"doc_type": "plano", "filename": "plano_PH.pdf", "unit_identifier": "PH", "floor": 5},
    {"doc_type": "memoria", "filename": "memoria_descriptiva_manzanares_2088.pdf"},
]

DUMMY_PDF = (
    b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
    b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\n"
    b"xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n"
    b"0000000058 00000 n \n0000000115 00000 n \n"
    b"trailer<</Size 4/Root 1 0 R>>\nstartxref\n206\n%%EOF"
)


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=os.getenv("S3_ENDPOINT_URL"),
        aws_access_key_id=os.getenv("S3_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("S3_SECRET_ACCESS_KEY"),
        region_name=os.getenv("S3_REGION", "us-east-1"),
        config=Config(signature_version="s3v4"),
    )


async def seed():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL not set in .env")
        sys.exit(1)

    conn = await asyncpg.connect(database_url)
    s3 = get_s3_client()
    bucket = os.getenv("S3_BUCKET_NAME", "real-state")
    public_url = os.getenv("S3_PUBLIC_URL")
    project_slug = "manzanares-2088"

    try:
        existing = await conn.fetchrow("SELECT id FROM projects WHERE name = $1", PROJECT["name"])
        if existing:
            print(f"Project '{PROJECT['name']}' already exists (id={existing['id']}). Skipping.")
            return

        dev = await conn.fetchrow("SELECT id FROM developers LIMIT 1")
        if not dev:
            dev = await conn.fetchrow(
                "INSERT INTO developers (name, contact_phone, contact_email) VALUES ($1, $2, $3) RETURNING id",
                "Demo Developer SA", "5491100000000", "demo@example.com",
            )
        dev_id = dev["id"]

        # Torre Palermo uses the same whatsapp number, update it to remove conflict
        await conn.execute(
            "UPDATE projects SET whatsapp_number = NULL WHERE whatsapp_number = $1 AND name != $2",
            PROJECT["whatsapp_number"], PROJECT["name"],
        )

        proj = await conn.fetchrow(
            "INSERT INTO projects (developer_id, name, whatsapp_number, status) VALUES ($1, $2, $3, $4) RETURNING id",
            dev_id, PROJECT["name"], PROJECT["whatsapp_number"], PROJECT["status"],
        )
        proj_id = proj["id"]
        print(f"Created project: {PROJECT['name']} (id={proj_id})")

        for unit in UNITS:
            await conn.execute(
                "INSERT INTO units (project_id, identifier, floor, bedrooms, area_m2, price_usd, status) VALUES ($1, $2, $3, $4, $5, $6, $7)",
                proj_id, unit["identifier"], unit["floor"], unit["bedrooms"],
                unit["area_m2"], unit["price_usd"], unit["status"],
            )
        print(f"Created {len(UNITS)} units")

        for doc in DOCUMENTS:
            key = f"projects/{project_slug}/{doc['filename'].lower()}"

            s3.put_object(
                Bucket=bucket,
                Key=key,
                Body=DUMMY_PDF,
                ContentType="application/pdf",
            )

            file_url = f"{public_url}/{key}"

            await conn.execute(
                """
                INSERT INTO documents (project_id, doc_type, filename, file_url, file_size_bytes, unit_identifier, floor, source, rag_status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, 'admin', 'ready')
                """,
                proj_id, doc["doc_type"], doc["filename"], file_url, len(DUMMY_PDF),
                doc.get("unit_identifier"), doc.get("floor"),
            )
            print(f"  Uploaded: {doc['filename']}")

        print(f"\nSeed complete!")
        print(f"  Project ID: {proj_id}")
        print(f"  Documents: {len(DOCUMENTS)}")
        print(f"  Units: {len(UNITS)}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(seed())
