"""
Seed script: crea "Edificio Maipú 1240" — demo completo para ventas.

Crea: organización, proyecto, 48 unidades, documentos, leads, conversaciones,
reservas, planes de pago, etapas de obra, pagos, financiero, inversores y alertas.

Run: python -m scripts.seed_demo_completo
Para limpiar y re-correr: python -m scripts.seed_demo_completo --reset
"""

import asyncio
import os
import sys
from datetime import date, datetime, timedelta

import asyncpg
import boto3
from botocore.config import Config
from dotenv import load_dotenv

load_dotenv()

PROJECT_NAME = "Edificio Maipú 1240"
PROJECT_SLUG = "maipu-1240"
ORG_NAME = "Demo Desarrollos S.A."

# ---------------------------------------------------------------------------
# Datos del proyecto
# ---------------------------------------------------------------------------

ORG_DATA = {
    "name": ORG_NAME,
    "contact_phone": "5491155001240",
    "contact_email": "info@demodesa.com.ar",
    "tipo": "desarrolladora",
    "cuit": "30-71234567-8",
    "activa": True,
}

PROJECT_DATA = {
    "name": PROJECT_NAME,
    "slug": PROJECT_SLUG,
    "address": "Maipú 1240",
    "neighborhood": "Retiro",
    "city": "CABA",
    "description": (
        "Edificio premium en el corazón de Retiro. 48 departamentos de 1, 2 y 3 ambientes "
        "con amenities completos, cocheras opcionales y acabados de primera categoría. "
        "Entrega estimada Q4 2026. Financiación en cuotas en USD."
    ),
    "amenities": [
        "SUM", "Terraza con parrilla", "Gimnasio", "Bicicletero",
        "Seguridad 24hs", "CCTV", "Lobby con recepción", "Cocheras"
    ],
    "total_floors": 8,
    "total_units": 48,
    "construction_start": date(2025, 3, 1),
    "estimated_delivery": date(2026, 12, 1),
    "delivery_status": "en_construccion",
    "payment_info": (
        "Anticipo 30% + 24 cuotas en USD ajustables por CAC. "
        "Saldo 20% contra escritura. Financiación hasta 36 cuotas para compradores calificados."
    ),
    "whatsapp_number": "+5491155001240",
    "status": "active",
}

# 48 unidades: 8 pisos × 6 unidades (A=1amb, B=2amb, C=2amb grande, D=3amb, E=3amb, F=solo PH)
def build_units():
    units = []
    tipologias = [
        {"suffix": "A", "bedrooms": 1, "area_base": 38,  "price_base": 68_000},
        {"suffix": "B", "bedrooms": 2, "area_base": 52,  "price_base": 95_000},
        {"suffix": "C", "bedrooms": 2, "area_base": 57,  "price_base": 105_000},
        {"suffix": "D", "bedrooms": 3, "area_base": 72,  "price_base": 135_000},
        {"suffix": "E", "bedrooms": 3, "area_base": 78,  "price_base": 148_000},
        {"suffix": "F", "bedrooms": 3, "area_base": 82,  "price_base": 158_000},
    ]
    # Estado por piso/unidad para mezcla realista
    status_map = {
        (1, "A"): "sold",   (1, "B"): "sold",   (1, "C"): "reserved",
        (1, "D"): "sold",   (1, "E"): "reserved", (1, "F"): "available",
        (2, "A"): "sold",   (2, "B"): "reserved", (2, "C"): "available",
        (2, "D"): "reserved", (2, "E"): "available", (2, "F"): "available",
        (3, "A"): "reserved", (3, "B"): "available", (3, "C"): "available",
        (3, "D"): "available", (3, "E"): "available", (3, "F"): "available",
    }
    for floor in range(1, 9):
        for t in tipologias:
            suffix = t["suffix"]
            # Piso 8 = PH: solo unidades A y B (más grandes)
            if floor == 8 and suffix in ("C", "D", "E", "F"):
                continue
            area = round(t["area_base"] + (floor - 1) * 0.5, 1)
            price = int(t["price_base"] + (floor - 1) * 1_500)
            identifier = f"{floor}{suffix}"
            if floor == 8:
                identifier = f"PH-{suffix}"
                area = round(t["area_base"] * 1.3, 1)
                price = int(t["price_base"] * 1.45)
            status = status_map.get((floor, suffix), "available")
            units.append({
                "identifier": identifier,
                "floor": floor,
                "bedrooms": t["bedrooms"],
                "area_m2": area,
                "price_usd": price,
                "status": status,
            })
    return units


UNITS = build_units()

DOCUMENTS = [
    {"doc_type": "memoria",  "filename": "memoria_descriptiva_maipu_1240.pdf"},
    {"doc_type": "precios",  "filename": "lista_precios_maipu_1240.pdf"},
    {"doc_type": "brochure", "filename": "brochure_maipu_1240.pdf"},
    {"doc_type": "plano",    "filename": "plano_tipo_pisos_1_4.pdf"},
    {"doc_type": "plano",    "filename": "plano_ph.pdf", "floor": 8},
    {"doc_type": "reglamento", "filename": "reglamento_copropiedad.pdf"},
]

DUMMY_PDF = (
    b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
    b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\n"
    b"xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n"
    b"0000000058 00000 n \n0000000115 00000 n \n"
    b"trailer<</Size 4/Root 1 0 R>>\nstartxref\n206\n%%EOF"
)

LEADS = [
    {"name": "Martín Suárez",     "phone": "5491144001001", "score": "hot",   "intent": "compra",   "bedrooms": 2, "budget_usd": 110_000, "source": "whatsapp", "tags": ["calificado", "financiacion"]},
    {"name": "Valentina Roch",    "phone": "5491144001002", "score": "hot",   "intent": "compra",   "bedrooms": 3, "budget_usd": 155_000, "source": "instagram", "tags": ["calificado", "contado"]},
    {"name": "Diego Fernández",   "phone": "5491144001003", "score": "warm",  "intent": "inversor", "bedrooms": 2, "budget_usd": 100_000, "source": "zonaprop", "tags": ["inversor"]},
    {"name": "Lucía Pereyra",     "phone": "5491144001004", "score": "warm",  "intent": "compra",   "bedrooms": 1, "budget_usd": 75_000,  "source": "whatsapp", "tags": []},
    {"name": "Carlos Menéndez",   "phone": "5491144001005", "score": "hot",   "intent": "compra",   "bedrooms": 2, "budget_usd": 105_000, "source": "referido", "tags": ["calificado", "urgente"]},
    {"name": "Sofía Villanueva",  "phone": "5491144001006", "score": "warm",  "intent": "compra",   "bedrooms": 3, "budget_usd": 145_000, "source": "whatsapp", "tags": []},
    {"name": "Andrés Castro",     "phone": "5491144001007", "score": "cold",  "intent": "compra",   "bedrooms": 2, "budget_usd": 90_000,  "source": "argenprop", "tags": []},
    {"name": "Natalia Gómez",     "phone": "5491144001008", "score": "cold",  "intent": "compra",   "bedrooms": 1, "budget_usd": 70_000,  "source": "whatsapp", "tags": []},
    {"name": "Roberto Pacheco",   "phone": "5491144001009", "score": "warm",  "intent": "inversor", "bedrooms": 2, "budget_usd": 120_000, "source": "linkedin", "tags": ["inversor"]},
    {"name": "Florencia Ibáñez",  "phone": "5491144001010", "score": "hot",   "intent": "compra",   "bedrooms": 2, "budget_usd": 98_000,  "source": "zonaprop", "tags": ["calificado"]},
    {"name": "Pablo Morales",     "phone": "5491144001011", "score": "warm",  "intent": "compra",   "bedrooms": 3, "budget_usd": 140_000, "source": "whatsapp", "tags": []},
    {"name": "Daniela Torres",    "phone": "5491144001012", "score": "cold",  "intent": "compra",   "bedrooms": 1, "budget_usd": 65_000,  "source": "argenprop", "tags": []},
    {"name": "Hernán Aguirre",    "phone": "5491144001013", "score": "hot",   "intent": "compra",   "bedrooms": 2, "budget_usd": 108_000, "source": "referido", "tags": ["calificado", "financiacion"]},
    {"name": "Camila Ríos",       "phone": "5491144001014", "score": "warm",  "intent": "compra",   "bedrooms": 2, "budget_usd": 95_000,  "source": "instagram", "tags": []},
    {"name": "Federico Bravo",    "phone": "5491144001015", "score": "cold",  "intent": "inversor", "bedrooms": 3, "budget_usd": 160_000, "source": "whatsapp", "tags": ["inversor"]},
    {"name": "María José Salazar","phone": "5491144001016", "score": "hot",   "intent": "compra",   "bedrooms": 1, "budget_usd": 72_000,  "source": "zonaprop", "tags": ["calificado"]},
    {"name": "Gustavo Herrera",   "phone": "5491144001017", "score": "warm",  "intent": "compra",   "bedrooms": 2, "budget_usd": 100_000, "source": "whatsapp", "tags": []},
    {"name": "Adriana Molina",    "phone": "5491144001018", "score": "cold",  "intent": "compra",   "bedrooms": 3, "budget_usd": 135_000, "source": "argenprop", "tags": []},
]

# Conversaciones para inbox (lead index → lista de mensajes)
# Cada mensaje: (role, sender_type, content)
CONVERSATIONS = {
    0: [  # Martín Suárez — hot, escalado a vendedor
        ("user", "lead", "Hola! Vi el edificio de Maipú y me interesa mucho. ¿Tienen disponibilidad en 2 ambientes?"),
        ("assistant", "agent", "¡Hola Martín! Sí, tenemos varias opciones de 2 ambientes disponibles en Edificio Maipú 1240. Los precios arrancan desde USD 95.000 para el piso 1 hasta USD 113.000 en pisos altos, con superficies de 52 a 59 m². ¿Tenés alguna preferencia de piso o orientación?"),
        ("user", "lead", "Me interesan los pisos altos. ¿Cuáles quedan libres?"),
        ("assistant", "agent", "En pisos altos tenés disponibles: 4B (piso 4, 54 m², USD 101.000), 5C (piso 5, 57.5 m², USD 107.500), 6B (piso 6, 55 m², USD 104.000) y 7C (piso 7, 59 m², USD 110.500). Todos con orientación norte y excelente luminosidad. ¿Querés que te mande los planos?"),
        ("user", "lead", "Sí, mandame los planos y además quiero saber cómo es la financiación"),
        ("assistant", "agent", "Te adjunto los planos de planta tipo. Sobre financiación: el esquema es 30% de anticipo + 24 cuotas mensuales en USD ajustables por índice CAC + 20% contra escritura. Por ejemplo, para una unidad de USD 100.000 el anticipo sería USD 30.000 y las cuotas de aprox USD 2.100/mes. ¿Preferís hablar con nuestro equipo comercial para armar un esquema a tu medida?"),
        ("user", "lead", "Sí, quiero hablar con alguien. ¿Cuándo podemos?"),
        ("assistant", "agent", "Perfecto, te paso con Lucía de nuestro equipo. Ella te va a contactar hoy antes de las 18hs. ¡Muchas gracias por tu interés en Maipú 1240!"),
    ],
    1: [  # Valentina Roch — hot, consulta 3 ambientes
        ("user", "lead", "Buenos días, me interesa un 3 ambientes. ¿Qué tienen disponible?"),
        ("assistant", "agent", "¡Buenos días Valentina! Tenemos 3 ambientes disponibles desde piso 3 en adelante. Superficies entre 72 y 87 m², precios desde USD 141.000 hasta USD 163.000. El edificio cuenta con SUM, terraza con parrilla, gimnasio y seguridad 24hs. ¿Tenés preferencia de piso?"),
        ("user", "lead", "¿El piso 6 está disponible? Y quisiera pagar al contado"),
        ("assistant", "agent", "El 6D (piso 6, 75 m²) está disponible a USD 154.500. Para pago al contado ofrecemos un descuento del 5%, quedando en USD 146.775. La escrituración se puede coordinar para Q1 2027 una vez finalizada la obra. ¿Querés que te envíe el contrato de reserva?"),
        ("user", "lead", "Sí, quiero avanzar con la reserva. ¿Cuál es el monto?"),
        ("assistant", "agent", "El monto de reserva es de USD 5.000 para separar la unidad mientras revisás la documentación. Se puede abonar por transferencia o efectivo. Te envío los datos de contacto del equipo para coordinar."),
    ],
    4: [  # Carlos Menéndez — hot, urgente
        ("user", "lead", "Necesito resolver algo esta semana, me vence un plazo. ¿Tienen 2 ambientes disponibles y puedo ver algo hoy?"),
        ("assistant", "agent", "Hola Carlos, entendemos la urgencia. Tenemos disponibilidad inmediata en 2 ambientes en varios pisos. Puedo conectarte con nuestro equipo para coordinar una visita a obra hoy mismo. ¿A qué hora te viene bien?"),
        ("user", "lead", "A las 17hs me viene bien"),
        ("assistant", "agent", "Perfecto, queda anotado para las 17hs. Te mando la dirección: Maipú 1240, Retiro. Preguntá por Lucía en recepción. ¡Nos vemos!"),
    ],
    9: [  # Florencia Ibáñez — hot, consulta por planos
        ("user", "lead", "Hola, quiero ver los planos del 2B antes de decidir"),
        ("assistant", "agent", "¡Claro Florencia! El plano tipo de 2 ambientes mostrando la distribución de las unidades B está en el documento que te adjunto. La unidad 3B tiene 52 m² con living-comedor integrado, cocina americana, dormitorio en suite y baño de servicio. ¿Tenés alguna duda sobre los materiales o amenities?"),
        ("user", "lead", "¿Qué materiales usan en el piso?"),
        ("assistant", "agent", "Pisos de porcelanato 60×60 en áreas sociales y parquet flotante premium en dormitorios. Mesadas de cuarzo en cocina, carpinterías de aluminio con DVH y termotanque a gas de alta eficiencia. Todo certificado bajo norma IRAM. ¿Querés coordinar una visita a obra para ver el avance?"),
    ],
}

OBRA_ETAPAS = [
    {"nombre": "Excavación y pilotaje",     "orden": 1, "peso_pct": 8.0,  "porcentaje_completado": 100},
    {"nombre": "Estructura de hormigón",    "orden": 2, "peso_pct": 22.0, "porcentaje_completado": 100},
    {"nombre": "Mampostería y tabiques",    "orden": 3, "peso_pct": 15.0, "porcentaje_completado": 80},
    {"nombre": "Instalaciones eléctricas", "orden": 4, "peso_pct": 10.0, "porcentaje_completado": 65},
    {"nombre": "Instalaciones sanitarias", "orden": 5, "peso_pct": 10.0, "porcentaje_completado": 60},
    {"nombre": "Revestimientos y pisos",   "orden": 6, "peso_pct": 18.0, "porcentaje_completado": 20},
    {"nombre": "Carpinterías",             "orden": 7, "peso_pct": 8.0,  "porcentaje_completado": 0},
    {"nombre": "Terminaciones y pintura",  "orden": 8, "peso_pct": 9.0,  "porcentaje_completado": 0},
]

SUPPLIERS = [
    {"nombre": "Hormigonera Del Plata S.A.", "cuit": "30-65432100-1", "rubro": "Hormigón elaborado",      "telefono": "01148001100"},
    {"nombre": "Instalaciones Río S.R.L.",   "cuit": "30-65432100-2", "rubro": "Instalaciones sanitarias","telefono": "01148001101"},
    {"nombre": "ElectroConstrucción S.A.",   "cuit": "30-65432100-3", "rubro": "Instalaciones eléctricas","telefono": "01148001102"},
    {"nombre": "Cerámicos Premium S.R.L.",   "cuit": "30-65432100-4", "rubro": "Revestimientos",          "telefono": "01148001103"},
    {"nombre": "Carpintería Metálica Baires", "cuit": "30-65432100-5", "rubro": "Carpinterías aluminio",  "telefono": "01148001104"},
]

INVESTORS = [
    {"nombre": "Alejandro Weinstein",  "email": "aweinstein@mail.com",  "telefono": "5491155200001", "monto_aportado_usd": 450_000, "porcentaje_participacion": 30.0, "fecha_aporte": date(2025, 2, 15)},
    {"nombre": "Grupo Familiar Rossi", "email": "jrossi@gruprossi.com", "telefono": "5491155200002", "monto_aportado_usd": 300_000, "porcentaje_participacion": 20.0, "fecha_aporte": date(2025, 3, 1)},
    {"nombre": "Inversiones del Sur",  "email": "contacto@invdelsur.ar","telefono": "5491155200003", "monto_aportado_usd": 750_000, "porcentaje_participacion": 50.0, "fecha_aporte": date(2025, 1, 20)},
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def d(days_ago: int = 0) -> date:
    return date.today() - timedelta(days=days_ago)


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=os.getenv("S3_ENDPOINT_URL"),
        aws_access_key_id=os.getenv("S3_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("S3_SECRET_ACCESS_KEY"),
        region_name=os.getenv("S3_REGION", "us-east-1"),
        config=Config(signature_version="s3v4"),
    )


async def detect_org_column(conn) -> tuple[str, str]:
    """Devuelve (tabla_org, columna_fk_en_projects)."""
    row = await conn.fetchrow(
        "SELECT table_name FROM information_schema.tables "
        "WHERE table_schema='public' AND table_name='organizations'"
    )
    if row:
        return "organizations", "organization_id"
    return "developers", "developer_id"


# ---------------------------------------------------------------------------
# Seed principal
# ---------------------------------------------------------------------------

async def seed(reset: bool = False):
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL no está definida en .env")
        sys.exit(1)

    conn = await asyncpg.connect(database_url)

    try:
        org_table, org_fk = await detect_org_column(conn)
        print(f"  Schema detectado: tabla={org_table}, FK en projects={org_fk}")

        # ------ Reset opcional ------
        if reset:
            existing = await conn.fetchrow("SELECT id FROM projects WHERE name = $1", PROJECT_NAME)
            if existing:
                proj_id = existing["id"]
                print(f"  Eliminando proyecto existente (id={proj_id})...")
                await conn.execute("DELETE FROM project_alerts WHERE project_id=$1", proj_id)
                await conn.execute("DELETE FROM investor_reports WHERE project_id=$1", proj_id)
                await conn.execute("DELETE FROM investors WHERE project_id=$1", proj_id)
                await conn.execute("DELETE FROM facturas WHERE project_id=$1", proj_id)
                await conn.execute("DELETE FROM project_expenses WHERE project_id=$1", proj_id)
                await conn.execute("DELETE FROM project_budget WHERE project_id=$1", proj_id)
                await conn.execute("DELETE FROM project_financials_config WHERE project_id=$1", proj_id)
                await conn.execute("DELETE FROM obra_payments WHERE project_id=$1", proj_id)
                await conn.execute("DELETE FROM obra_updates WHERE project_id=$1", proj_id)
                await conn.execute("DELETE FROM obra_etapas WHERE project_id=$1", proj_id)
                # reservas → payment_plans → installments → records
                res_ids = await conn.fetch("SELECT id FROM reservations WHERE project_id=$1", proj_id)
                for r in res_ids:
                    plan = await conn.fetchrow("SELECT id FROM payment_plans WHERE reservation_id=$1", r["id"])
                    if plan:
                        inst_ids = await conn.fetch("SELECT id FROM payment_installments WHERE plan_id=$1", plan["id"])
                        for inst in inst_ids:
                            await conn.execute("DELETE FROM payment_records WHERE installment_id=$1", inst["id"])
                        await conn.execute("DELETE FROM payment_installments WHERE plan_id=$1", plan["id"])
                        await conn.execute("DELETE FROM payment_plans WHERE id=$1", plan["id"])
                await conn.execute("DELETE FROM reservations WHERE project_id=$1", proj_id)
                await conn.execute("DELETE FROM conversations WHERE lead_id IN (SELECT id FROM leads WHERE project_id=$1)", proj_id)
                await conn.execute("DELETE FROM leads WHERE project_id=$1", proj_id)
                await conn.execute("DELETE FROM documents WHERE project_id=$1", proj_id)
                await conn.execute("DELETE FROM units WHERE project_id=$1", proj_id)
                await conn.execute("DELETE FROM projects WHERE id=$1", proj_id)
                print("  Proyecto eliminado. Re-creando...")
            else:
                print("  No había proyecto existente. Creando...")

        # ------ Chequeo duplicado ------
        existing = await conn.fetchrow("SELECT id FROM projects WHERE name = $1", PROJECT_NAME)
        if existing:
            print(f"El proyecto '{PROJECT_NAME}' ya existe (id={existing['id']}). Usá --reset para re-crear.")
            return

        # ============================================================
        # 1. ORGANIZACIÓN
        # ============================================================
        org = await conn.fetchrow(f"SELECT id FROM {org_table} WHERE name=$1", ORG_NAME)
        if not org:
            if org_table == "organizations":
                org = await conn.fetchrow(
                    "INSERT INTO organizations (name, contact_phone, contact_email, tipo, cuit, activa) "
                    "VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
                    ORG_DATA["name"], ORG_DATA["contact_phone"], ORG_DATA["contact_email"],
                    ORG_DATA["tipo"], ORG_DATA["cuit"], ORG_DATA["activa"],
                )
            else:
                org = await conn.fetchrow(
                    "INSERT INTO developers (name, contact_phone, contact_email) VALUES ($1,$2,$3) RETURNING id",
                    ORG_DATA["name"], ORG_DATA["contact_phone"], ORG_DATA["contact_email"],
                )
            print(f"✓ Organización creada: {ORG_NAME}")
        else:
            print(f"✓ Organización existente: {ORG_NAME} (id={org['id']})")
        org_id = org["id"]

        # ============================================================
        # 2. PROYECTO
        # ============================================================
        proj = await conn.fetchrow(
            f"""INSERT INTO projects
                ({org_fk}, name, slug, address, neighborhood, city, description,
                 amenities, total_floors, total_units, construction_start,
                 estimated_delivery, delivery_status, payment_info, whatsapp_number, status)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
               RETURNING id""",
            org_id,
            PROJECT_DATA["name"], PROJECT_DATA["slug"], PROJECT_DATA["address"],
            PROJECT_DATA["neighborhood"], PROJECT_DATA["city"], PROJECT_DATA["description"],
            PROJECT_DATA["amenities"], PROJECT_DATA["total_floors"], PROJECT_DATA["total_units"],
            PROJECT_DATA["construction_start"], PROJECT_DATA["estimated_delivery"],
            PROJECT_DATA["delivery_status"], PROJECT_DATA["payment_info"],
            PROJECT_DATA["whatsapp_number"], PROJECT_DATA["status"],
        )
        proj_id = proj["id"]
        print(f"✓ Proyecto creado: {PROJECT_NAME} (id={proj_id})")

        # ============================================================
        # 3. UNIDADES
        # ============================================================
        for u in UNITS:
            await conn.execute(
                "INSERT INTO units (project_id, identifier, floor, bedrooms, area_m2, price_usd, status) "
                "VALUES ($1,$2,$3,$4,$5,$6,$7)",
                proj_id, u["identifier"], u["floor"], u["bedrooms"],
                u["area_m2"], u["price_usd"], u["status"],
            )
        sold_count = sum(1 for u in UNITS if u["status"] == "sold")
        reserved_count = sum(1 for u in UNITS if u["status"] == "reserved")
        avail_count = sum(1 for u in UNITS if u["status"] == "available")
        print(f"✓ {len(UNITS)} unidades creadas ({avail_count} disponibles, {reserved_count} reservadas, {sold_count} vendidas)")

        # ============================================================
        # 4. DOCUMENTOS (dummy PDFs a S3)
        # ============================================================
        s3_ok = False
        try:
            s3 = get_s3_client()
            bucket = os.getenv("S3_BUCKET_NAME", "real-state")
            public_url = os.getenv("S3_PUBLIC_URL", "")
            s3_ok = bool(os.getenv("S3_ENDPOINT_URL"))
        except Exception:
            pass

        for doc in DOCUMENTS:
            key = f"projects/{PROJECT_SLUG}/{doc['filename']}"
            file_url = f"{public_url}/{key}" if s3_ok else f"https://placeholder.local/{key}"
            if s3_ok:
                try:
                    s3.put_object(Bucket=bucket, Key=key, Body=DUMMY_PDF, ContentType="application/pdf")
                except Exception as e:
                    print(f"  ⚠ S3 upload falló para {doc['filename']}: {e}")
                    file_url = f"https://placeholder.local/{key}"

            await conn.execute(
                "INSERT INTO documents (project_id, doc_type, filename, file_url, file_size_bytes, floor, source, rag_status) "
                "VALUES ($1,$2,$3,$4,$5,$6,'admin','ready')",
                proj_id, doc["doc_type"], doc["filename"], file_url,
                len(DUMMY_PDF), doc.get("floor"),
            )
        print(f"✓ {len(DOCUMENTS)} documentos cargados")

        # ============================================================
        # 5. LEADS
        # ============================================================
        lead_ids = []
        now = date.today()
        for i, lead in enumerate(LEADS):
            days_ago = (i % 14) + 1
            row = await conn.fetchrow(
                "INSERT INTO leads (project_id, phone, name, score, intent, bedrooms, budget_usd, source, tags, last_contact) "
                "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
                proj_id, lead["phone"], lead["name"], lead["score"],
                lead.get("intent"), lead.get("bedrooms"), lead.get("budget_usd"),
                lead.get("source"), lead["tags"],
                d(days_ago),
            )
            lead_ids.append(row["id"])
        print(f"✓ {len(LEADS)} leads creados")

        # ============================================================
        # 6. CONVERSACIONES (inbox)
        # ============================================================
        conv_count = 0
        for lead_idx, messages in CONVERSATIONS.items():
            lead_id = lead_ids[lead_idx]
            msg_date = d(3 - (lead_idx % 3))
            for j, (role, sender_type, content) in enumerate(messages):
                ts = datetime.combine(msg_date, datetime.min.time()) + timedelta(minutes=j * 5)
                await conn.execute(
                    "INSERT INTO conversations (lead_id, role, sender_type, content, created_at) "
                    "VALUES ($1,$2,$3,$4,$5)",
                    lead_id, role, sender_type, content, ts,
                )
                conv_count += 1
        print(f"✓ {conv_count} mensajes de conversación creados ({len(CONVERSATIONS)} hilos)")

        # ============================================================
        # 7. RESERVAS + PLANES DE PAGO + REGISTROS DE PAGO
        # ============================================================
        # Buscamos unidades vendidas/reservadas para asociar
        reserved_units = await conn.fetch(
            "SELECT id, identifier, price_usd FROM units WHERE project_id=$1 AND status IN ('reserved','sold') ORDER BY identifier",
            proj_id
        )

        reservation_data = [
            {
                "buyer_name": "Valentina Roch",
                "buyer_phone": "5491144001002",
                "buyer_email": "vroch@mail.com",
                "amount_usd": 5000,
                "payment_method": "transferencia",
                "status": "converted",
                "signed_at": d(45),
                "notes": "Compra 3 ambientes piso 6. Pago al contado con 5% descuento.",
                "lead_idx": 1,
            },
            {
                "buyer_name": "Martín Suárez",
                "buyer_phone": "5491144001001",
                "buyer_email": "msuarez@mail.com",
                "amount_usd": 5000,
                "payment_method": "transferencia",
                "status": "active",
                "signed_at": d(15),
                "notes": "Reserva 2 ambientes piso 5. Financiación 24 cuotas.",
                "lead_idx": 0,
            },
            {
                "buyer_name": "Carlos Menéndez",
                "buyer_phone": "5491144001005",
                "buyer_email": "cmenendez@mail.com",
                "amount_usd": 5000,
                "payment_method": "efectivo",
                "status": "active",
                "signed_at": d(7),
                "notes": "Urgente. 2 ambientes piso 4.",
                "lead_idx": 4,
            },
            {
                "buyer_name": "Florencia Ibáñez",
                "buyer_phone": "5491144001010",
                "buyer_email": "fibanez@mail.com",
                "amount_usd": 5000,
                "payment_method": "transferencia",
                "status": "cancelled",
                "signed_at": d(60),
                "notes": "Canceló por cambio de situación personal.",
                "lead_idx": 9,
            },
        ]

        res_ids = []
        for i, res in enumerate(reservation_data):
            unit_id = reserved_units[i]["id"] if i < len(reserved_units) else None
            unit_price = float(reserved_units[i]["price_usd"]) if i < len(reserved_units) else 100_000
            lead_id = lead_ids[res["lead_idx"]]
            row = await conn.fetchrow(
                "INSERT INTO reservations (project_id, unit_id, lead_id, buyer_name, buyer_phone, buyer_email, "
                "amount_usd, payment_method, notes, signed_at, status) "
                "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",
                proj_id, unit_id, lead_id,
                res["buyer_name"], res["buyer_phone"], res["buyer_email"],
                res["amount_usd"], res["payment_method"], res["notes"],
                res["signed_at"], res["status"],
            )
            res_ids.append({"id": row["id"], "price": unit_price, "status": res["status"]})

        print(f"✓ {len(res_ids)} reservas creadas")

        # Plan de pagos para la reserva activa (Martín Suárez, idx=1)
        active_res = res_ids[1]
        total = active_res["price"]
        anticipo = round(total * 0.30, 2)
        cuota = round((total * 0.50) / 24, 2)
        saldo = round(total * 0.20, 2)

        plan = await conn.fetchrow(
            "INSERT INTO payment_plans (reservation_id, descripcion, moneda_base, monto_total, tipo_ajuste) "
            "VALUES ($1,$2,'USD',$3,'CAC') RETURNING id",
            active_res["id"],
            "Plan 30% anticipo + 24 cuotas + 20% saldo escritura",
            total,
        )
        plan_id = plan["id"]

        # Anticipo
        inst_anticipo = await conn.fetchrow(
            "INSERT INTO payment_installments (plan_id, numero_cuota, concepto, monto, moneda, fecha_vencimiento, estado) "
            "VALUES ($1,1,'anticipo',$2,'USD',$3,'pagado') RETURNING id",
            plan_id, anticipo, d(14),
        )
        # Registrar pago del anticipo
        await conn.execute(
            "INSERT INTO payment_records (installment_id, fecha_pago, monto_pagado, moneda, metodo_pago, referencia, notas) "
            "VALUES ($1,$2,$3,'USD','transferencia','TRF-20260210','Anticipo abonado en tiempo')",
            inst_anticipo["id"], d(13), anticipo,
        )

        # Cuotas (24) — 2 ya pagadas
        for n in range(1, 25):
            vencimiento = d(15 - (n * 30))  # vencen mensualmente hacia adelante
            estado = "pagado" if n <= 2 else ("vencido" if n == 3 else "pendiente")
            inst = await conn.fetchrow(
                "INSERT INTO payment_installments (plan_id, numero_cuota, concepto, monto, moneda, fecha_vencimiento, estado) "
                "VALUES ($1,$2,'cuota',$3,'USD',$4,$5) RETURNING id",
                plan_id, n + 1, cuota, vencimiento, estado,
            )
            if n <= 2:
                await conn.execute(
                    "INSERT INTO payment_records (installment_id, fecha_pago, monto_pagado, moneda, metodo_pago) "
                    "VALUES ($1,$2,$3,'USD','transferencia')",
                    inst["id"], d(15 - (n * 30) + 2), cuota,
                )

        # Saldo final
        await conn.execute(
            "INSERT INTO payment_installments (plan_id, numero_cuota, concepto, monto, moneda, fecha_vencimiento, estado) "
            "VALUES ($1,26,'saldo',$2,'USD',$3,'pendiente')",
            plan_id, saldo, date(2026, 12, 15),
        )

        print(f"✓ Plan de pagos creado para reserva activa (anticipo + 24 cuotas + saldo)")

        # ============================================================
        # 8. OBRA — ETAPAS Y PAGOS
        # ============================================================
        supplier_ids = []
        for sup in SUPPLIERS:
            row = await conn.fetchrow(
                "INSERT INTO suppliers (nombre, cuit, rubro, telefono) VALUES ($1,$2,$3,$4) RETURNING id",
                sup["nombre"], sup["cuit"], sup["rubro"], sup["telefono"],
            )
            supplier_ids.append(row["id"])
        print(f"✓ {len(supplier_ids)} proveedores creados")

        etapa_ids = []
        for etapa in OBRA_ETAPAS:
            row = await conn.fetchrow(
                "INSERT INTO obra_etapas (project_id, nombre, orden, peso_pct, porcentaje_completado) "
                "VALUES ($1,$2,$3,$4,$5) RETURNING id",
                proj_id, etapa["nombre"], etapa["orden"],
                etapa["peso_pct"], etapa["porcentaje_completado"],
            )
            etapa_ids.append(row["id"])

        # Update de obra
        await conn.execute(
            "INSERT INTO obra_updates (project_id, fecha, etapa_id, porcentaje_avance, nota_publica, nota_interna) "
            "VALUES ($1,$2,$3,43,'Se completó la mampostería de los pisos 1 al 4. Se inician instalaciones eléctricas.',"
            "'Avance según cronograma. Sin desvíos.')",
            proj_id, d(5), etapa_ids[2],
        )
        await conn.execute(
            "INSERT INTO obra_updates (project_id, fecha, etapa_id, porcentaje_avance, nota_publica, nota_interna) "
            "VALUES ($1,$2,$3,38,'Finalizada estructura de hormigón. Comenzamos mampostería nivel 5-8.',"
            "'Hormigonera cumplió plazo. Proveedor OK.')",
            proj_id, d(25), etapa_ids[1],
        )

        # Pagos de obra
        obra_payments_data = [
            {"supplier_idx": 0, "etapa_idx": 1, "descripcion": "Certificado Nº3 — Estructura hormigón pisos 5-8", "monto_usd": 85_000, "estado": "pagado",   "fecha_pago": d(20)},
            {"supplier_idx": 1, "etapa_idx": 4, "descripcion": "Avance sanitarias — pisos 1 al 4",               "monto_usd": 42_000, "estado": "pagado",   "fecha_pago": d(10)},
            {"supplier_idx": 2, "etapa_idx": 3, "descripcion": "Instalaciones eléctricas — Media tensión",        "monto_usd": 38_000, "estado": "pendiente", "fecha_vencimiento": d(-15)},
            {"supplier_idx": 3, "etapa_idx": 5, "descripcion": "Anticipo revestimientos — pisos 1 y 2",           "monto_usd": 28_000, "estado": "pendiente", "fecha_vencimiento": d(-30)},
            {"supplier_idx": 4, "etapa_idx": 6, "descripcion": "Seña carpinterías aluminio + DVH",                "monto_usd": 55_000, "estado": "pendiente", "fecha_vencimiento": d(-45)},
        ]
        for op in obra_payments_data:
            await conn.execute(
                "INSERT INTO obra_payments (project_id, supplier_id, etapa_id, descripcion, monto_usd, estado, fecha_pago, fecha_vencimiento) "
                "VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
                proj_id,
                supplier_ids[op["supplier_idx"]],
                etapa_ids[op["etapa_idx"]],
                op["descripcion"],
                op["monto_usd"],
                op["estado"],
                op.get("fecha_pago"),
                op.get("fecha_vencimiento"),
            )
        print(f"✓ {len(OBRA_ETAPAS)} etapas de obra + {len(obra_payments_data)} pagos de obra creados")

        # ============================================================
        # 9. FINANCIERO
        # ============================================================
        # Config de tipo de cambio
        await conn.execute(
            "INSERT INTO project_financials_config (project_id, tipo_cambio_usd_ars) VALUES ($1, 1180) "
            "ON CONFLICT (project_id) DO UPDATE SET tipo_cambio_usd_ars = 1180",
            proj_id,
        )

        # Presupuesto
        budget_data = [
            {"categoria": "Terreno",           "descripcion": "Compra terreno Maipú 1240",     "monto_usd": 1_200_000},
            {"categoria": "Construcción",      "descripcion": "Costo total de obra estimado",  "monto_usd": 3_500_000},
            {"categoria": "Honorarios",        "descripcion": "Estudio de arquitectura + ing.", "monto_usd": 180_000},
            {"categoria": "Marketing",         "descripcion": "Campaña de ventas",              "monto_usd": 45_000},
            {"categoria": "Legal y escribanía","descripcion": "Honorarios legales y boletos",   "monto_usd": 60_000},
            {"categoria": "Contingencia",      "descripcion": "Reserva de contingencia 5%",     "monto_usd": 250_000},
        ]
        budget_ids = []
        for b in budget_data:
            row = await conn.fetchrow(
                "INSERT INTO project_budget (project_id, categoria, descripcion, monto_usd) "
                "VALUES ($1,$2,$3,$4) RETURNING id",
                proj_id, b["categoria"], b["descripcion"], b["monto_usd"],
            )
            budget_ids.append(row["id"])

        # Gastos reales
        expenses_data = [
            {"budget_idx": 0, "proveedor": "Escribanía Fontana", "descripcion": "Escritura de compra terreno",     "monto_usd": 1_200_000, "fecha": d(300)},
            {"budget_idx": 1, "proveedor": "Hormigonera Del Plata S.A.", "descripcion": "Certificados 1-3 estructura", "monto_usd": 210_000, "fecha": d(50)},
            {"budget_idx": 1, "proveedor": "Instalaciones Río S.R.L.",   "descripcion": "Sanitarias avance 40%",   "monto_usd": 42_000, "fecha": d(10)},
            {"budget_idx": 2, "proveedor": "Estudio GHP Arquitectos",    "descripcion": "Honorarios Q1 2026",      "monto_usd": 45_000, "fecha": d(60)},
            {"budget_idx": 3, "proveedor": "Agencia Digital BA",          "descripcion": "Campaña redes sociales enero-marzo", "monto_usd": 12_000, "fecha": d(45)},
        ]
        expense_ids = []
        for e in expenses_data:
            row = await conn.fetchrow(
                "INSERT INTO project_expenses (project_id, budget_id, proveedor, descripcion, monto_usd, fecha) "
                "VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
                proj_id, budget_ids[e["budget_idx"]], e["proveedor"],
                e["descripcion"], e["monto_usd"], e["fecha"],
            )
            expense_ids.append(row["id"])

        print(f"✓ Financiero: {len(budget_data)} ítems de presupuesto, {len(expenses_data)} gastos reales")

        # Facturas
        facturas_data = [
            {
                "tipo": "A", "numero": "A-0001-00001234",
                "proveedor": "Hormigonera Del Plata S.A.", "cuit": "30-65432100-1",
                "fecha": d(50), "monto_neto": 174_380, "monto_total": 210_000, "moneda": "USD",
                "categoria": "egreso", "estado": "vinculada",
                "notas": "Certificado Nº3 estructura", "gasto_idx": 1,
            },
            {
                "tipo": "A", "numero": "A-0001-00001235",
                "proveedor": "Instalaciones Río S.R.L.", "cuit": "30-65432100-2",
                "fecha": d(10), "monto_neto": 34_711, "monto_total": 42_000, "moneda": "USD",
                "categoria": "egreso", "estado": "vinculada",
                "notas": "Sanitarias avance 40%", "gasto_idx": 2,
            },
            {
                "tipo": "B", "numero": "B-0001-00000089",
                "proveedor": "Estudio GHP Arquitectos", "cuit": "20-28765432-1",
                "fecha": d(60), "monto_neto": 37_190, "monto_total": 45_000, "moneda": "USD",
                "categoria": "egreso", "estado": "pagada",
                "notas": "Honorarios Q1 2026", "gasto_idx": 3,
            },
            {
                "tipo": "recibo", "numero": "REC-2026-0001",
                "proveedor": "Valentina Roch", "cuit": None,
                "fecha": d(45), "monto_neto": None, "monto_total": 5_000, "moneda": "USD",
                "categoria": "ingreso", "estado": "vinculada",
                "notas": "Reserva unidad 6D", "gasto_idx": None,
            },
        ]
        for f in facturas_data:
            gasto_id = expense_ids[f["gasto_idx"]] if f["gasto_idx"] is not None else None
            await conn.execute(
                "INSERT INTO facturas (project_id, tipo, numero_factura, proveedor_nombre, cuit_emisor, "
                "fecha_emision, monto_neto, monto_total, moneda, categoria, gasto_id, estado, notas) "
                "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
                proj_id, f["tipo"], f["numero"], f["proveedor"], f["cuit"],
                f["fecha"], f.get("monto_neto"), f["monto_total"], f["moneda"],
                f["categoria"], gasto_id, f["estado"], f["notas"],
            )
        print(f"✓ {len(facturas_data)} facturas creadas")

        # ============================================================
        # 10. INVERSORES
        # ============================================================
        for inv in INVESTORS:
            await conn.execute(
                "INSERT INTO investors (project_id, nombre, email, telefono, monto_aportado_usd, porcentaje_participacion, fecha_aporte) "
                "VALUES ($1,$2,$3,$4,$5,$6,$7)",
                proj_id, inv["nombre"], inv["email"], inv["telefono"],
                inv["monto_aportado_usd"], inv["porcentaje_participacion"], inv["fecha_aporte"],
            )

        # Reporte de inversores
        reporte_html = """
        <h2>Informe de Avance — Marzo 2026</h2>
        <p>Estimados inversores,</p>
        <p>A continuación presentamos el informe de avance correspondiente al primer trimestre de 2026.</p>
        <h3>Avance de obra: 43%</h3>
        <ul>
            <li>Estructura de hormigón: <strong>100% completada</strong></li>
            <li>Mampostería: <strong>80% completada</strong></li>
            <li>Instalaciones eléctricas: <strong>65% en progreso</strong></li>
        </ul>
        <h3>Ventas</h3>
        <p>Se comercializaron 14 de 48 unidades (29%). 6 vendidas, 8 reservadas.</p>
        <h3>Próximos hitos</h3>
        <p>Finalización de instalaciones Q3 2026. Revestimientos y terminaciones Q4 2026.</p>
        """
        await conn.execute(
            "INSERT INTO investor_reports (project_id, titulo, contenido_html, periodo_desde, periodo_hasta) "
            "VALUES ($1,$2,$3,$4,$5)",
            proj_id,
            "Informe de Avance Q1 2026 — Maipú 1240",
            reporte_html.strip(),
            date(2026, 1, 1), date(2026, 3, 31),
        )
        print(f"✓ {len(INVESTORS)} inversores + 1 reporte creados")

        # ============================================================
        # 11. ALERTAS
        # ============================================================
        alerts = [
            {
                "tipo": "lead_sin_seguimiento",
                "titulo": "3 leads sin actividad hace más de 7 días",
                "descripcion": "Los leads Andrés Castro, Natalia Gómez y Adriana Molina no recibieron seguimiento en los últimos 7 días.",
                "severidad": "warning",
            },
            {
                "tipo": "pago_vencido",
                "titulo": "Cuota Nº3 de Martín Suárez vencida",
                "descripcion": "La cuota mensual del plan de pagos venció hace 3 días sin registro de cobro.",
                "severidad": "error",
            },
            {
                "tipo": "obra_sin_actualizacion",
                "titulo": "Sin actualización de obra en 5 días",
                "descripcion": "La última actualización de avance fue hace 5 días. Se recomienda actualizar el estado.",
                "severidad": "info",
            },
        ]
        for alert in alerts:
            await conn.execute(
                "INSERT INTO project_alerts (project_id, tipo, titulo, descripcion, severidad) "
                "VALUES ($1,$2,$3,$4,$5)",
                proj_id, alert["tipo"], alert["titulo"], alert["descripcion"], alert["severidad"],
            )
        print(f"✓ {len(alerts)} alertas creadas")

        # ============================================================
        # RESUMEN
        # ============================================================
        print("\n" + "="*60)
        print(f"  DEMO COMPLETO — {PROJECT_NAME}")
        print("="*60)
        print(f"  Proyecto ID:   {proj_id}")
        print(f"  Organización:  {ORG_NAME}")
        print(f"  Unidades:      {len(UNITS)} ({avail_count} disp / {reserved_count} res / {sold_count} vend)")
        print(f"  Documentos:    {len(DOCUMENTS)}")
        print(f"  Leads:         {len(LEADS)}")
        print(f"  Conversaciones:{conv_count} mensajes en {len(CONVERSATIONS)} hilos")
        print(f"  Reservas:      {len(res_ids)} (1 con plan de pagos completo)")
        print(f"  Etapas obra:   {len(OBRA_ETAPAS)} | Pagos obra: {len(obra_payments_data)}")
        print(f"  Presupuesto:   {len(budget_data)} ítems | Gastos: {len(expenses_data)}")
        print(f"  Facturas:      {len(facturas_data)}")
        print(f"  Inversores:    {len(INVESTORS)}")
        print(f"  Alertas:       {len(alerts)}")
        print("="*60)
        print(f"\n  URL del proyecto (local): http://localhost:3000/proyectos/{proj_id}")
        print()

    finally:
        await conn.close()


if __name__ == "__main__":
    reset = "--reset" in sys.argv
    if reset:
        print("⚠️  Modo reset: se eliminará el proyecto existente y se re-creará.")
    asyncio.run(seed(reset=reset))
