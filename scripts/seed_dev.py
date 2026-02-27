"""
Seed script: inserts a demo developer, project, and units into the database.
Run: python -m scripts.seed_dev
"""

import asyncio
import os
import sys

import asyncpg
from dotenv import load_dotenv

load_dotenv()

DEVELOPER = {
    "name": "Demo Developer SA",
    "contact_phone": "5491100000000",
    "contact_email": "demo@example.com",
}

PROJECT = {
    "name": "Torre Palermo",
    "whatsapp_number": "+14155238886",
    "status": "active",
}

UNITS = [
    {"identifier": "1A", "floor": 1, "bedrooms": 1, "area_m2": 38, "price_usd": 62000, "status": "available"},
    {"identifier": "2B", "floor": 2, "bedrooms": 2, "area_m2": 55, "price_usd": 89000, "status": "available"},
    {"identifier": "3A", "floor": 3, "bedrooms": 2, "area_m2": 58, "price_usd": 95000, "status": "available"},
    {"identifier": "4C", "floor": 4, "bedrooms": 3, "area_m2": 78, "price_usd": 128000, "status": "available"},
    {"identifier": "5A", "floor": 5, "bedrooms": 2, "area_m2": 55, "price_usd": 98000, "status": "reserved"},
    {"identifier": "6B", "floor": 6, "bedrooms": 3, "area_m2": 82, "price_usd": 145000, "status": "available"},
    {"identifier": "PH", "floor": 7, "bedrooms": 4, "area_m2": 120, "price_usd": 210000, "status": "available"},
]


async def seed():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL not set in .env")
        sys.exit(1)

    conn = await asyncpg.connect(database_url)

    try:
        existing = await conn.fetchrow("SELECT id FROM projects WHERE name = $1", PROJECT["name"])
        if existing:
            print(f"Project '{PROJECT['name']}' already exists (id={existing['id']}). Skipping seed.")
            return

        dev = await conn.fetchrow(
            "INSERT INTO developers (name, contact_phone, contact_email) VALUES ($1, $2, $3) RETURNING id",
            DEVELOPER["name"],
            DEVELOPER["contact_phone"],
            DEVELOPER["contact_email"],
        )
        dev_id = dev["id"]
        print(f"Created developer: {DEVELOPER['name']} (id={dev_id})")

        proj = await conn.fetchrow(
            "INSERT INTO projects (developer_id, name, whatsapp_number, status) VALUES ($1, $2, $3, $4) RETURNING id",
            dev_id,
            PROJECT["name"],
            PROJECT["whatsapp_number"],
            PROJECT["status"],
        )
        proj_id = proj["id"]
        print(f"Created project: {PROJECT['name']} (id={proj_id})")

        for unit in UNITS:
            await conn.execute(
                """
                INSERT INTO units (project_id, identifier, floor, bedrooms, area_m2, price_usd, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                """,
                proj_id,
                unit["identifier"],
                unit["floor"],
                unit["bedrooms"],
                unit["area_m2"],
                unit["price_usd"],
                unit["status"],
            )
        print(f"Created {len(UNITS)} units")

        print("\nSeed complete!")
        print(f"  Project ID: {proj_id}")
        print(f"  Developer ID: {dev_id}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(seed())
