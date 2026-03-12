"""
Generate realistic PDF documents for Edificio Maipú 1240 and upload to Supabase Storage.
Also updates document records in the database with the real file URLs.

Run: python -m scripts.generate_pdfs_maipu_1240
"""

import asyncio
import io
import os
import sys

import asyncpg
import boto3
from botocore.config import Config
from dotenv import load_dotenv
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    HRFlowable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

load_dotenv()

WIDTH, HEIGHT = A4
PROJECT_NAME   = "Edificio Maipú 1240"
PROJECT_SLUG   = "maipu-1240"
PROJECT_ADDRESS = "Maipú 1240, Retiro, CABA"
DEVELOPER      = "Demo Desarrollos S.A."
DELIVERY       = "Diciembre 2026"

# Paleta premium
NAVY   = colors.HexColor("#1B2A4A")
GOLD   = colors.HexColor("#B8966E")
LIGHT  = colors.HexColor("#F7F5F2")
GREY   = colors.HexColor("#8A8A8A")
RED    = colors.HexColor("#C0392B")

styles = getSampleStyleSheet()

TITLE  = ParagraphStyle("T", parent=styles["Title"],   fontSize=24, spaceAfter=6,  textColor=NAVY, fontName="Helvetica-Bold")
SUBT   = ParagraphStyle("S", parent=styles["Normal"],  fontSize=13, spaceAfter=16, textColor=GOLD, fontName="Helvetica-Oblique")
H1     = ParagraphStyle("H1", parent=styles["Heading1"], fontSize=14, spaceAfter=6, spaceBefore=14, textColor=NAVY, fontName="Helvetica-Bold")
H2     = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=11, spaceAfter=4, spaceBefore=8,  textColor=NAVY, fontName="Helvetica-Bold")
BODY   = ParagraphStyle("B",  parent=styles["Normal"],  fontSize=9.5, leading=14, spaceAfter=4)
SMALL  = ParagraphStyle("Sm", parent=styles["Normal"],  fontSize=7.5, textColor=GREY, leading=11)
LABEL  = ParagraphStyle("L",  parent=styles["Normal"],  fontSize=8, textColor=GREY, fontName="Helvetica-Bold", spaceAfter=2)
PRICE  = ParagraphStyle("P",  parent=styles["Normal"],  fontSize=13, textColor=RED,  fontName="Helvetica-Bold")


def _header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(GREY)
    canvas.drawString(2 * cm, HEIGHT - 1.3 * cm, f"{PROJECT_NAME} — {DEVELOPER}")
    canvas.drawRightString(WIDTH - 2 * cm, HEIGHT - 1.3 * cm, "Documento confidencial · No reproducir sin autorización")
    # línea divisoria
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(0.5)
    canvas.line(2 * cm, HEIGHT - 1.5 * cm, WIDTH - 2 * cm, HEIGHT - 1.5 * cm)
    canvas.line(2 * cm, 1.4 * cm, WIDTH - 2 * cm, 1.4 * cm)
    canvas.setFont("Helvetica", 7)
    canvas.drawCentredString(WIDTH / 2, 0.8 * cm, f"© 2026 {DEVELOPER}  ·  Maipú 1240, Retiro, CABA  ·  ventas@demodesa.com.ar  ·  +54 11 5500-1240")
    canvas.restoreState()


def _doc(story: list) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        topMargin=2.2 * cm, bottomMargin=2.2 * cm,
        leftMargin=2.5 * cm, rightMargin=2.5 * cm,
    )
    doc.build(story, onFirstPage=_header_footer, onLaterPages=_header_footer)
    return buf.getvalue()


def _divider():
    return HRFlowable(width="100%", thickness=0.5, color=GOLD, spaceAfter=8, spaceBefore=4)


def _box_table(data, col_widths, header_bg=NAVY):
    t = Table(data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), header_bg),
        ("TEXTCOLOR",     (0, 0), (-1, 0), colors.white),
        ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, -1), 8.5),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.white, LIGHT]),
        ("GRID",          (0, 0), (-1, -1), 0.4, colors.HexColor("#DDDDDD")),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
    ]))
    return t


# ---------------------------------------------------------------------------
# UNIDADES (para usar en brochure + lista de precios)
# ---------------------------------------------------------------------------

UNITS = [
    # Piso 1
    {"id": "1A", "fl": 1, "bed": 1, "m2": 38.0,  "price": 68_000,  "status": "Vendido",     "orient": "Norte"},
    {"id": "1B", "fl": 1, "bed": 2, "m2": 52.0,  "price": 95_000,  "status": "Vendido",     "orient": "Noreste"},
    {"id": "1C", "fl": 1, "bed": 2, "m2": 57.0,  "price": 105_000, "status": "Reservado",   "orient": "Este"},
    {"id": "1D", "fl": 1, "bed": 3, "m2": 72.0,  "price": 135_000, "status": "Vendido",     "orient": "Norte"},
    {"id": "1E", "fl": 1, "bed": 3, "m2": 78.0,  "price": 148_000, "status": "Reservado",   "orient": "Noreste"},
    {"id": "1F", "fl": 1, "bed": 3, "m2": 82.0,  "price": 158_000, "status": "Disponible",  "orient": "Noroeste"},
    # Piso 2
    {"id": "2A", "fl": 2, "bed": 1, "m2": 38.5,  "price": 69_500,  "status": "Vendido",     "orient": "Norte"},
    {"id": "2B", "fl": 2, "bed": 2, "m2": 52.5,  "price": 96_500,  "status": "Reservado",   "orient": "Noreste"},
    {"id": "2C", "fl": 2, "bed": 2, "m2": 57.5,  "price": 106_500, "status": "Disponible",  "orient": "Este"},
    {"id": "2D", "fl": 2, "bed": 3, "m2": 72.5,  "price": 136_500, "status": "Reservado",   "orient": "Norte"},
    {"id": "2E", "fl": 2, "bed": 3, "m2": 78.5,  "price": 149_500, "status": "Disponible",  "orient": "Noreste"},
    {"id": "2F", "fl": 2, "bed": 3, "m2": 82.5,  "price": 159_500, "status": "Disponible",  "orient": "Noroeste"},
    # Piso 3
    {"id": "3A", "fl": 3, "bed": 1, "m2": 39.0,  "price": 71_000,  "status": "Reservado",   "orient": "Norte"},
    {"id": "3B", "fl": 3, "bed": 2, "m2": 53.0,  "price": 98_000,  "status": "Disponible",  "orient": "Noreste"},
    {"id": "3C", "fl": 3, "bed": 2, "m2": 58.0,  "price": 108_000, "status": "Disponible",  "orient": "Este"},
    {"id": "3D", "fl": 3, "bed": 3, "m2": 73.0,  "price": 138_000, "status": "Disponible",  "orient": "Norte"},
    {"id": "3E", "fl": 3, "bed": 3, "m2": 79.0,  "price": 151_000, "status": "Disponible",  "orient": "Noreste"},
    {"id": "3F", "fl": 3, "bed": 3, "m2": 83.0,  "price": 161_000, "status": "Disponible",  "orient": "Noroeste"},
    # Piso 4
    {"id": "4A", "fl": 4, "bed": 1, "m2": 39.5,  "price": 72_500,  "status": "Disponible",  "orient": "Norte"},
    {"id": "4B", "fl": 4, "bed": 2, "m2": 53.5,  "price": 99_500,  "status": "Disponible",  "orient": "Noreste"},
    {"id": "4C", "fl": 4, "bed": 2, "m2": 58.5,  "price": 109_500, "status": "Disponible",  "orient": "Este"},
    {"id": "4D", "fl": 4, "bed": 3, "m2": 73.5,  "price": 139_500, "status": "Disponible",  "orient": "Norte"},
    {"id": "4E", "fl": 4, "bed": 3, "m2": 79.5,  "price": 152_500, "status": "Disponible",  "orient": "Noreste"},
    {"id": "4F", "fl": 4, "bed": 3, "m2": 83.5,  "price": 162_500, "status": "Disponible",  "orient": "Noroeste"},
    # Piso 5
    {"id": "5A", "fl": 5, "bed": 1, "m2": 40.0,  "price": 74_000,  "status": "Disponible",  "orient": "Norte"},
    {"id": "5B", "fl": 5, "bed": 2, "m2": 54.0,  "price": 101_000, "status": "Disponible",  "orient": "Noreste"},
    {"id": "5C", "fl": 5, "bed": 2, "m2": 59.0,  "price": 111_000, "status": "Disponible",  "orient": "Este"},
    {"id": "5D", "fl": 5, "bed": 3, "m2": 74.0,  "price": 141_000, "status": "Disponible",  "orient": "Norte"},
    {"id": "5E", "fl": 5, "bed": 3, "m2": 80.0,  "price": 154_000, "status": "Disponible",  "orient": "Noreste"},
    {"id": "5F", "fl": 5, "bed": 3, "m2": 84.0,  "price": 164_000, "status": "Disponible",  "orient": "Noroeste"},
    # Piso 6
    {"id": "6A", "fl": 6, "bed": 1, "m2": 40.5,  "price": 75_500,  "status": "Disponible",  "orient": "Norte"},
    {"id": "6B", "fl": 6, "bed": 2, "m2": 54.5,  "price": 102_500, "status": "Disponible",  "orient": "Noreste"},
    {"id": "6C", "fl": 6, "bed": 2, "m2": 59.5,  "price": 112_500, "status": "Disponible",  "orient": "Este"},
    {"id": "6D", "fl": 6, "bed": 3, "m2": 74.5,  "price": 142_500, "status": "Disponible",  "orient": "Norte"},
    {"id": "6E", "fl": 6, "bed": 3, "m2": 80.5,  "price": 155_500, "status": "Disponible",  "orient": "Noreste"},
    {"id": "6F", "fl": 6, "bed": 3, "m2": 84.5,  "price": 165_500, "status": "Disponible",  "orient": "Noroeste"},
    # Piso 7
    {"id": "7A", "fl": 7, "bed": 1, "m2": 41.0,  "price": 77_000,  "status": "Disponible",  "orient": "Norte"},
    {"id": "7B", "fl": 7, "bed": 2, "m2": 55.0,  "price": 104_000, "status": "Disponible",  "orient": "Noreste"},
    {"id": "7C", "fl": 7, "bed": 2, "m2": 60.0,  "price": 114_000, "status": "Disponible",  "orient": "Este"},
    {"id": "7D", "fl": 7, "bed": 3, "m2": 75.0,  "price": 144_000, "status": "Disponible",  "orient": "Norte"},
    {"id": "7E", "fl": 7, "bed": 3, "m2": 81.0,  "price": 157_000, "status": "Disponible",  "orient": "Noreste"},
    {"id": "7F", "fl": 7, "bed": 3, "m2": 85.0,  "price": 167_000, "status": "Disponible",  "orient": "Noroeste"},
    # Piso 8 — PH
    {"id": "PH-A", "fl": 8, "bed": 1, "m2": 49.4,  "price": 98_600,  "status": "Disponible",  "orient": "Norte"},
    {"id": "PH-B", "fl": 8, "bed": 2, "m2": 67.6,  "price": 138_350, "status": "Disponible",  "orient": "Panorámica"},
]


# ---------------------------------------------------------------------------
# BROCHURE
# ---------------------------------------------------------------------------

def generate_brochure() -> bytes:
    s = []

    s.append(Spacer(1, 1.5 * cm))
    s.append(Paragraph(PROJECT_NAME, TITLE))
    s.append(Paragraph("Un lugar donde el diseño y la ubicación se encuentran · Retiro, CABA", SUBT))
    s.append(_divider())
    s.append(Spacer(1, 0.3 * cm))

    s.append(Paragraph("El proyecto", H1))
    s.append(Paragraph(
        f"<b>{PROJECT_NAME}</b> es un emprendimiento residencial de primera categoría emplazado "
        "en la calle Maipú al 1240, en el exclusivo barrio de Retiro. "
        "A media cuadra de la plaza San Martín y a pasos de Av. del Libertador, "
        "el edificio propone 44 unidades funcionales distribuidas en 8 plantas, "
        "con tipologías de 1, 2 y 3 ambientes, más dos penthouses en la planta alta.",
        BODY,
    ))
    s.append(Paragraph(
        "El proyecto fue concebido bajo estrictos criterios de calidad constructiva: "
        "estructura de hormigón armado H30, carpinterías de aluminio con doble vidriado hermético, "
        "pisos de porcelanato rectificado y terminaciones premium en todas las unidades. "
        "Entrega estimada: <b>diciembre 2026</b>.",
        BODY,
    ))

    s.append(Spacer(1, 0.4 * cm))
    s.append(Paragraph("Amenities", H1))
    amenities_data = [
        ["✓ SUM con parrilla y kitchenette (cap. 40 personas)", "✓ Gimnasio equipado con vestuarios"],
        ["✓ Terraza jardín en azotea con parrilla comunitaria", "✓ Bicicletero cubierto con carga eléctrica"],
        ["✓ Piscina descubierta con deck de madera", "✓ Seguridad 24hs con CCTV y acceso por app"],
        ["✓ Lobby con recepción y paquetería inteligente", "✓ Cocheras cubiertas opcionales en subsuelo"],
    ]
    at = Table(amenities_data, colWidths=[8.5 * cm, 7.5 * cm])
    at.setStyle(TableStyle([
        ("FONTSIZE",     (0, 0), (-1, -1), 8.5),
        ("TOPPADDING",   (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
        ("TEXTCOLOR",    (0, 0), (-1, -1), NAVY),
    ]))
    s.append(at)

    s.append(Spacer(1, 0.4 * cm))
    s.append(Paragraph("Ubicación estratégica", H1))
    s.append(Paragraph(
        "Retiro es el nodo de conectividad más importante de Buenos Aires. "
        "La terminal ferroviaria, la terminal de ómnibus y la estación de subte "
        "Línea C están a menos de 5 minutos a pie. "
        "El barrio concentra los principales edificios corporativos de la ciudad, "
        "hoteles cinco estrellas y acceso directo al Río de la Plata.",
        BODY,
    ))

    dist_data = [
        ["Punto de interés", "Distancia"],
        ["Plaza San Martín", "1 cuadra"],
        ["Av. del Libertador", "2 cuadras"],
        ["Estación Retiro (trenes + colectivos)", "4 cuadras"],
        ["Subte Línea C (Retiro)", "5 cuadras"],
        ["Puerto Madero / Costanera", "10 minutos en auto"],
        ["Aeroparque Jorge Newbery", "12 minutos en auto"],
        ["Centro Financiero CABA", "8 minutos a pie"],
    ]
    s.append(Spacer(1, 0.2 * cm))
    s.append(_box_table(dist_data, [9 * cm, 5 * cm]))

    s.append(PageBreak())
    s.append(Paragraph("Tipologías y valores referenciales", H1))
    s.append(Paragraph(
        "Todas las unidades se entregan con cocina amoblada, "
        "preinstalación de aire acondicionado split, pisos de porcelanato rectificado 60×60 "
        "y carpintería exterior de aluminio con DVH.",
        BODY,
    ))
    s.append(Spacer(1, 0.3 * cm))

    tipo_data = [["Tipología", "Superficie", "Precio desde", "Precio hasta", "Orientación"]]
    # Agrupar por tipología
    from itertools import groupby
    import operator
    units_sorted = sorted(UNITS, key=operator.itemgetter("bed"))
    for bed, group in groupby(units_sorted, key=lambda u: u["bed"]):
        grp = list(group)
        name = "1 ambiente" if bed == 1 else f"{bed} ambientes"
        m2_min = min(u["m2"] for u in grp)
        m2_max = max(u["m2"] for u in grp)
        p_min  = min(u["price"] for u in grp if u["status"] == "Disponible") if any(u["status"] == "Disponible" for u in grp) else None
        p_max  = max(u["price"] for u in grp if u["status"] == "Disponible") if any(u["status"] == "Disponible" for u in grp) else None
        orients = list(dict.fromkeys(u["orient"] for u in grp))
        tipo_data.append([
            name,
            f"{m2_min}–{m2_max} m²",
            f"USD {p_min:,}" if p_min else "—",
            f"USD {p_max:,}" if p_max else "—",
            " / ".join(orients[:2]),
        ])
    s.append(_box_table(tipo_data, [3 * cm, 2.8 * cm, 3 * cm, 3 * cm, 4.2 * cm]))

    s.append(Spacer(1, 0.6 * cm))
    s.append(Paragraph("Condiciones de pago", H1))
    condiciones = [
        ["Plan", "Estructura", "Ventaja"],
        ["Financiado", "30% anticipo + 24 cuotas USD ajust. CAC + 20% escritura", "Acceso con menor capital inicial"],
        ["Contado",    "100% al boleto", "5% de descuento sobre precio de lista"],
        ["Plan Inversor", "50% al boleto + 50% contra posesión", "Sin ajuste, precio fijo en USD"],
    ]
    s.append(_box_table(condiciones, [3 * cm, 8 * cm, 5 * cm]))

    s.append(Spacer(1, 0.8 * cm))
    s.append(_divider())
    s.append(Paragraph(
        f"<b>Entrega estimada: {DELIVERY}</b>  ·  Expensas estimadas: USD 120–180/mes según tipología.",
        ParagraphStyle("BoldGold", parent=BODY, textColor=GOLD, fontName="Helvetica-Bold", fontSize=10),
    ))
    s.append(Spacer(1, 0.4 * cm))
    s.append(Paragraph(
        "Los precios son referenciales, en dólares estadounidenses (USD), y pueden variar sin previo aviso. "
        "Esta publicación no constituye una oferta vinculante. "
        "Consulte precios y disponibilidad actualizados con nuestro equipo comercial.",
        SMALL,
    ))
    s.append(Paragraph("ventas@demodesa.com.ar  ·  +54 11 5500-1240  ·  www.demodesa.com.ar", SMALL))

    return _doc(s)


# ---------------------------------------------------------------------------
# LISTA DE PRECIOS
# ---------------------------------------------------------------------------

def generate_price_list() -> bytes:
    s = []
    s.append(Paragraph(f"{PROJECT_NAME} — Lista de Precios", TITLE))
    s.append(Paragraph(f"Vigente: Marzo 2026  ·  Sujeta a cambios sin previo aviso", SMALL))
    s.append(_divider())
    s.append(Spacer(1, 0.2 * cm))

    # Tabla completa
    data = [["Unidad", "Piso", "Amb.", "Sup. m²", "USD/m²", "Precio (USD)", "Orientación", "Estado"]]
    for u in UNITS:
        usd_m2 = round(u["price"] / u["m2"])
        status_color = {"Disponible": "#1a7a1a", "Reservado": "#b37000", "Vendido": "#999999"}
        st = u["status"]
        data.append([
            u["id"],
            str(u["fl"]),
            str(u["bed"]),
            str(u["m2"]),
            f"${usd_m2:,}",
            f"${u['price']:,}",
            u["orient"],
            st,
        ])

    avg_m2 = round(sum(u["price"] / u["m2"] for u in UNITS) / len(UNITS))
    total_avail = sum(1 for u in UNITS if u["status"] == "Disponible")
    data.append(["", "", "", "", f"Prom: ${avg_m2:,}/m²", "", f"{total_avail} disponibles", ""])

    t = Table(data, colWidths=[1.8 * cm, 1.2 * cm, 1.2 * cm, 1.8 * cm, 1.8 * cm, 3 * cm, 2.8 * cm, 2.4 * cm])
    style = TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR",     (0, 0), (-1, 0), colors.white),
        ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS",(0, 1), (-1, -2), [colors.white, LIGHT]),
        ("GRID",          (0, 0), (-1, -2), 0.3, colors.HexColor("#DDDDDD")),
        ("ALIGN",         (1, 0), (-1, -1), "CENTER"),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
        ("FONTNAME",      (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND",    (0, -1), (-1, -1), LIGHT),
        ("TOPPADDING",    (0, -1), (-1, -1), 6),
    ])
    # Color por estado
    for i, u in enumerate(UNITS, start=1):
        if u["status"] == "Disponible":
            style.add("TEXTCOLOR", (7, i), (7, i), colors.HexColor("#1a7a1a"))
        elif u["status"] == "Reservado":
            style.add("TEXTCOLOR", (7, i), (7, i), colors.HexColor("#b37000"))
        elif u["status"] == "Vendido":
            style.add("TEXTCOLOR", (7, i), (7, i), GREY)
    t.setStyle(style)
    s.append(t)

    s.append(Spacer(1, 0.6 * cm))
    # Cuadro resumen
    total_units = len(UNITS)
    total_sold  = sum(1 for u in UNITS if u["status"] == "Vendido")
    total_res   = sum(1 for u in UNITS if u["status"] == "Reservado")
    total_avail = sum(1 for u in UNITS if u["status"] == "Disponible")
    pct_comp = round((total_sold + total_res) / total_units * 100)

    resumen = [
        ["Estado", "Unidades", "Porcentaje"],
        ["Vendidas", str(total_sold),  f"{round(total_sold/total_units*100)}%"],
        ["Reservadas", str(total_res), f"{round(total_res/total_units*100)}%"],
        ["Disponibles", str(total_avail), f"{round(total_avail/total_units*100)}%"],
        ["TOTAL", str(total_units), f"{pct_comp}% comprometido"],
    ]
    rt = Table(resumen, colWidths=[4 * cm, 3 * cm, 4 * cm])
    rt.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), GOLD),
        ("TEXTCOLOR",     (0, 0), (-1, 0), colors.white),
        ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, -1), 8.5),
        ("GRID",          (0, 0), (-1, -1), 0.4, colors.HexColor("#DDDDDD")),
        ("ROWBACKGROUNDS",(0, 1), (-1, -2), [colors.white, LIGHT]),
        ("FONTNAME",      (0, -1), (-1, -1), "Helvetica-Bold"),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("ALIGN",         (1, 0), (-1, -1), "CENTER"),
    ]))
    s.append(rt)

    s.append(Spacer(1, 0.5 * cm))
    s.append(Paragraph("Adicionales opcionales", H2))
    add_data = [
        ["Adicional", "Precio (USD)"],
        ["Cochera cubierta en subsuelo", "$22,000"],
        ["Cochera descubierta en subsuelo", "$14,000"],
        ["Baulera (4 m² aprox.)", "$6,500"],
    ]
    s.append(_box_table(add_data, [9 * cm, 4 * cm]))

    s.append(Spacer(1, 0.5 * cm))
    s.append(_divider())
    s.append(Paragraph(
        "Precios expresados en dólares estadounidenses (USD). No incluyen gastos de escrituración, "
        "sellado provincial ni honorarios del escribano. Las superficies son aproximadas y sujetas a "
        "medición final según plano municipal aprobado. Lista vigente al 01/03/2026.",
        SMALL,
    ))

    return _doc(s)


# ---------------------------------------------------------------------------
# MEMORIA DESCRIPTIVA
# ---------------------------------------------------------------------------

def generate_memoria() -> bytes:
    s = []
    s.append(Paragraph(f"{PROJECT_NAME} — Memoria Descriptiva", TITLE))
    s.append(Paragraph(f"{PROJECT_ADDRESS}  ·  Entrega estimada: {DELIVERY}", SUBT))
    s.append(_divider())

    secciones = [
        ("1. Estructura portante", (
            "Estructura independiente de hormigón armado H-30, calculada bajo norma CIRSOC 201:2005 "
            "y verificada sísmica según INPRES-CIRSOC 103. Fundaciones mediante pilotes de hormigón "
            "perforados de 60 cm de diámetro con vigas de encadenado. Columnas y vigas de hormigón armado "
            "en todos los niveles. Losas nervuradas bidireccionales de 22 cm de espesor total."
        )),
        ("2. Cerramientos exteriores", (
            "Muros de fachada en ladrillo cerámico hueco de 18 cm con revoque hidrófugo exterior, "
            "cámara de aire de 3 cm, aislación térmica en lana de vidrio y tabique interior de 8 cm. "
            "Paredes medianeras en ladrillo común de 30 cm. "
            "Fachada con revestimiento de porcellanato ventilado 60×120 y paños de vidrio templado DVH."
        )),
        ("3. Tabiques interiores", (
            "Divisorias entre unidades: ladrillo hueco de 12 cm con doble revoque y aislación acústica "
            "en lana de roca (Rw ≥ 45 dB). Divisorias internas de cada unidad: tabiques de yeso "
            "cartón con estructura metálica y lana mineral (Rw ≥ 38 dB)."
        )),
        ("4. Pisos y revestimientos", (
            "<b>Unidades residenciales:</b><br/>"
            "• Living y comedor: porcelanato rectificado 60×60 cm, primera calidad, color a elección entre tres opciones (gris perla, beige mármol o madera caoba).<br/>"
            "• Dormitorios: ídem living o parquet flotante de 8 mm (a elección del comprador).<br/>"
            "• Baños completos: porcelanato 30×60 cm en piso y revestimiento hasta techo (h=2,60 m).<br/>"
            "• Cocina: porcelanato 60×60 cm en piso; revestimiento 60×30 cm en salpicadero.<br/>"
            "• Balcones y terrazas privadas: porcelanato exterior antideslizante 40×40 cm.<br/><br/>"
            "<b>Áreas comunes:</b><br/>"
            "• Hall de acceso y palier: granito gris Mara pulido.<br/>"
            "• SUM: porcelanato rectificado 60×60 cm.<br/>"
            "• Gimnasio: piso flotante de goma vulcanizada antishock."
        )),
        ("5. Carpinterías exteriores", (
            "Aluminio anodizado plata mate, línea Modena o equivalente, con DVH 4+12+4 mm (factor solar ≤ 0,30). "
            "Ventanas y balconeras con perfilería de alta prestación térmica y acústica (Uw ≤ 2,4 W/m²K). "
            "Premarcos de chapa galvanizada incluidos. Herrajes en acero inoxidable."
        )),
        ("6. Carpinterías interiores", (
            "Puertas de ingreso a cada unidad: blindada de acero con núcleo de madera, cerradura multipunto "
            "de tres puntos de bloqueo. Puertas interiores: placa MDF lacada en blanco, 2,10×0,80 m, "
            "con marco de chapa doblada pintada. Placares con frente en melamina con bisagras de cierre suave."
        )),
        ("7. Instalación sanitaria", (
            "Suministro de agua fría y caliente centralizado mediante termotanque individual eléctrico "
            "de alta recuperación (80 L) por unidad, instalado en lavadero. "
            "Cañerías de PPFusión (agua) y PVC clase 6 (desagüe cloacal). "
            "Medidores individuales de agua fría.<br/>"
            "<b>Artefactos:</b> Línea Ferrum Bari o equivalente — inodoro largo con mochila adosada, "
            "bidet, lavatorio de colgar (baño completo) y lavamanos (toilette). "
            "<b>Mesadas de cocina:</b> granito gris Mara pulido de 3 cm, con bacha de acero inoxidable "
            "doble taza 1,00 m y grifería monocomando de cuello alto. "
            "Griferías monocomando cromadas en baños (Ferrum o equivalente)."
        )),
        ("8. Instalación eléctrica", (
            "Tablero seccional por unidad con protecciones termo-magnéticas y disyuntor diferencial de alta sensibilidad. "
            "Cableado seccional en conductor de cobre bajo tubo corrugado metálico empotrado. "
            "Tomacorrientes y llaves Línea Siglo XXI (Cambre) o equivalente. "
            "Preinstalación para aire acondicionado split en living y dormitorios "
            "(cañería de cobre, línea de desagüe y circuito trifásico dedicado). "
            "Portero eléctrico con cámara HD y apertura por app. Red Wi-Fi comunitaria en áreas comunes."
        )),
        ("9. Instalación de gas", (
            "Instalación de gas natural bajo normas NAG-200 / 300 con medidores individuales tipo G-4. "
            "Cocinas a gas natural. Calefacción central por radiadores de acero en living y dormitorios "
            "(unidades de 3 ambientes y PH); unidades de 1 y 2 ambientes con preinstalación."
        )),
        ("10. Calefacción y refrigeración", (
            "Las unidades se entregan con preinstalación completa (circuito, cañería y desagüe) "
            "para equipo de aire acondicionado tipo split inverter en living y cada dormitorio. "
            "La provisión del equipo está fuera del precio de lista y puede ser adquirida como adicional."
        )),
        ("11. Pintura y terminaciones", (
            "<b>Interior:</b> látex acrílico mate de primera calidad sobre enduido plástico en paredes; "
            "látex acrílico blanco en cielorrasos (h libre ≥ 2,60 m). "
            "Molduras de yeso en living. <b>Exterior:</b> revestimiento texturado acrílico Revear Finetex "
            "o equivalente con hidrófugo incorporado, sobre revoque proyectado impermeable."
        )),
        ("12. Ascensor", (
            "Un ascensor automático con capacidad para 6 personas (450 kg), velocidad 1,0 m/s, "
            "con cabina de acero inoxidable satinado y espejo lateral. "
            "Puertas automáticas de acero inoxidable. Paradas en todos los niveles (PB, 1er al 8vo piso). "
            "Sistema de emergencia con teléfono incorporado y UPS para al menos 30 min de autonomía."
        )),
        ("13. Espacios comunes y amenities", (
            "<b>Planta baja:</b> Hall de acceso con doble altura, lobby con recepción, "
            "paquetería inteligente con casilleros refrigerados. SUM con parrilla a gas, "
            "horno de barro, kitchenette y baño; capacidad para 40 personas.<br/>"
            "<b>Subsuelo:</b> Gimnasio equipado (cintas, bicicletas, funcional), vestuarios con duchas. "
            "Cocheras cubiertas e-bike/bicicletero con carga eléctrica.<br/>"
            "<b>Azotea:</b> Terraza jardín aterrazada con deck de madera sintética, parrilla comunitaria, "
            "vegetación y solárium. Piscina descubierta de 8×4 m con deck perimetral y ducha exterior."
        )),
        ("14. Seguridad y domótica", (
            "Sistema CCTV con cámaras de alta resolución en accesos, paliers, subsuelo y áreas comunes. "
            "Control de acceso por app o tarjeta RFID. "
            "Intercomunicador con video desde smartphone. "
            "Sistema contra incendio según norma NFPA: detectores de humo, rociadores en subsuelo y "
            "medios de egreso, matafuegos y bocas de impulsión por piso."
        )),
    ]

    for titulo, contenido in secciones:
        s.append(Paragraph(titulo, H1))
        s.append(Paragraph(contenido, BODY))

    s.append(_divider())
    s.append(Paragraph(
        "La presente Memoria Descriptiva es de carácter orientativo y no constituye especificación técnica vinculante. "
        "El desarrollador se reserva el derecho de sustituir materiales, marcas y proveedores por otros de calidad "
        "equivalente o superior, sin que ello altere el estándar general del proyecto. "
        "Las superficies son aproximadas y sujetas a medición final según plano municipal aprobado (Ley 13512).",
        SMALL,
    ))

    return _doc(s)


# ---------------------------------------------------------------------------
# PLANO TIPO (pisos 1 al 7)
# ---------------------------------------------------------------------------

def generate_plano_tipo() -> bytes:
    s = []
    s.append(Paragraph(f"{PROJECT_NAME} — Plano Tipo · Pisos 1 al 7", TITLE))
    s.append(Paragraph("Distribución general de la planta tipo con 6 unidades por nivel", SUBT))
    s.append(_divider())

    s.append(Paragraph(
        "La planta tipo se repite en los pisos 1 al 7 con variaciones menores en superficies (+0,5 m² por piso). "
        "Cada nivel cuenta con seis unidades: dos de 1 ambiente (A), dos de 2 ambientes (B y C) y dos de 3 ambientes (D, E y F). "
        "Todas las unidades tienen acceso directo desde el palier central.",
        BODY,
    ))
    s.append(Spacer(1, 0.3 * cm))

    # Descripción de cada tipología en planta tipo
    tipos = [
        {
            "id": "A", "bed": 1, "m2_ref": 38,
            "desc": "Monoambiente con cocina americana. Orientación norte con vista a calle Maipú. Balcón de 3 m².",
            "rooms": [
                ["Ambiente principal (living + dormitorio)", "16.5 m²"],
                ["Cocina integrada (americana)", "4.0 m²"],
                ["Baño completo", "3.5 m²"],
                ["Balcón", "3.0 m²"],
                ["Circulación y placard", "11.0 m²"],
                ["TOTAL", "38.0 m²"],
            ],
        },
        {
            "id": "B", "bed": 2, "m2_ref": 52,
            "desc": "2 ambientes con living-comedor y dormitorio en suite. Balcón corrido de 5 m². Orientación noreste.",
            "rooms": [
                ["Living-comedor", "15.0 m²"],
                ["Dormitorio principal", "11.5 m²"],
                ["Cocina independiente", "5.5 m²"],
                ["Baño completo", "3.5 m²"],
                ["Balcón corrido", "5.0 m²"],
                ["Circulación y placard", "11.5 m²"],
                ["TOTAL", "52.0 m²"],
            ],
        },
        {
            "id": "C", "bed": 2, "m2_ref": 57,
            "desc": "2 ambientes esquinero con doble orientación (noreste / este). Living amplio y dormitorio principal grande.",
            "rooms": [
                ["Living-comedor", "17.5 m²"],
                ["Dormitorio principal", "13.0 m²"],
                ["Cocina independiente", "6.0 m²"],
                ["Baño completo", "3.5 m²"],
                ["Toilette", "2.0 m²"],
                ["Balcón", "5.0 m²"],
                ["Circulación, lavadero y placards", "10.0 m²"],
                ["TOTAL", "57.0 m²"],
            ],
        },
        {
            "id": "D", "bed": 3, "m2_ref": 72,
            "desc": "3 ambientes con suite, baño completo secundario y toilette. Orientación norte. Balcón de 6 m² con parrilla individual.",
            "rooms": [
                ["Living-comedor", "18.0 m²"],
                ["Dormitorio principal (en suite)", "13.5 m²"],
                ["Dormitorio 2", "10.5 m²"],
                ["Cocina independiente", "7.0 m²"],
                ["Baño en suite", "4.0 m²"],
                ["Baño secundario", "3.5 m²"],
                ["Balcón con parrilla individual", "6.0 m²"],
                ["Circulación, lavadero y placards", "9.5 m²"],
                ["TOTAL", "72.0 m²"],
            ],
        },
        {
            "id": "E", "bed": 3, "m2_ref": 78,
            "desc": "3 ambientes con suite completa, vestidor y 2 baños. Orientación noreste con vista doble. Balcón aterrazado de 8 m².",
            "rooms": [
                ["Living-comedor", "20.0 m²"],
                ["Dormitorio principal (suite + vestidor)", "16.0 m²"],
                ["Dormitorio 2", "11.0 m²"],
                ["Cocina independiente", "7.5 m²"],
                ["Baño en suite", "4.5 m²"],
                ["Baño secundario", "3.5 m²"],
                ["Balcón aterrazado", "8.0 m²"],
                ["Circulación, lavadero y placards", "7.5 m²"],
                ["TOTAL", "78.0 m²"],
            ],
        },
        {
            "id": "F", "bed": 3, "m2_ref": 82,
            "desc": "3 ambientes premium esquinero. Orientación noroeste con vista a plaza. Living con doble altura. Balcón wrap-around de 10 m².",
            "rooms": [
                ["Living-comedor doble altura", "22.0 m²"],
                ["Dormitorio principal (suite + vestidor)", "17.0 m²"],
                ["Dormitorio 2", "11.5 m²"],
                ["Cocina independiente", "7.5 m²"],
                ["Baño en suite", "4.5 m²"],
                ["Baño secundario", "3.5 m²"],
                ["Balcón wrap-around", "10.0 m²"],
                ["Circulación, lavadero y placards", "6.0 m²"],
                ["TOTAL", "82.0 m²"],
            ],
        },
    ]

    for tipo in tipos:
        s.append(Paragraph(f"Unidad {tipo['id']} — {tipo['bed']} ambiente{'s' if tipo['bed'] > 1 else ''} · {tipo['m2_ref']} m² aprox.", H2))
        s.append(Paragraph(tipo["desc"], BODY))

        rooms_data = [["Ambiente", "Superficie"]] + tipo["rooms"]
        t = Table(rooms_data, colWidths=[9.5 * cm, 3.5 * cm])
        t.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR",     (0, 0), (-1, 0), colors.white),
            ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",      (0, 0), (-1, -1), 8.5),
            ("ROWBACKGROUNDS",(0, 1), (-1, -2), [colors.white, LIGHT]),
            ("GRID",          (0, 0), (-1, -1), 0.4, colors.HexColor("#DDDDDD")),
            ("FONTNAME",      (0, -1), (-1, -1), "Helvetica-Bold"),
            ("BACKGROUND",    (0, -1), (-1, -1), LIGHT),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("ALIGN",         (1, 0), (-1, -1), "CENTER"),
        ]))
        s.append(t)
        s.append(Spacer(1, 0.4 * cm))

    s.append(_divider())
    s.append(Paragraph(
        "Las distribuciones y superficies son aproximadas y corresponden a la planta tipo. "
        "Pueden existir variaciones menores entre pisos. Plano definitivo según documentación municipal aprobada.",
        SMALL,
    ))
    return _doc(s)


# ---------------------------------------------------------------------------
# PLANO PH
# ---------------------------------------------------------------------------

def generate_plano_ph() -> bytes:
    s = []
    s.append(Paragraph(f"{PROJECT_NAME} — Planta PH (Piso 8)", TITLE))
    s.append(Paragraph("Dos unidades premium con vistas panorámicas · Entrega Q4 2026", SUBT))
    s.append(_divider())

    s.append(Paragraph(
        "El piso 8 alberga dos unidades de penthouse diseñadas para maximizar las vistas "
        "a la ciudad, el Río de la Plata y la Plaza San Martín. "
        "Ambas unidades tienen techos de mayor altura (3,20 m libre) y acceso a terraza privada.",
        BODY,
    ))
    s.append(Spacer(1, 0.3 * cm))

    phs = [
        {
            "id": "PH-A", "bed": 1, "m2": 49.4, "price": 98_600, "status": "Disponible",
            "desc": "Penthouse de 1 ambiente plus con terraza privada de 15 m². Orientación norte con vista a Plaza San Martín. Ideal para inversores o usuarios solteros/pareja.",
            "rooms": [
                ["Ambiente principal (living + dorm.)", "19.0 m²"],
                ["Cocina americana premium", "5.0 m²"],
                ["Baño completo", "4.0 m²"],
                ["Terraza privada con deck y parrilla", "15.0 m²"],
                ["Circulación y placard", "6.4 m²"],
                ["TOTAL (cubierta + terraza)", "49.4 m²"],
            ],
        },
        {
            "id": "PH-B", "bed": 2, "m2": 67.6, "price": 138_350, "status": "Disponible",
            "desc": "Penthouse de 2 ambientes amplios con terraza privada de 20 m² y vistas panorámicas. Orientación norte/este/oeste. La joya del edificio.",
            "rooms": [
                ["Living-comedor panorámico", "22.0 m²"],
                ["Dormitorio principal (suite + vestidor)", "16.0 m²"],
                ["Cocina independiente premium", "8.0 m²"],
                ["Baño en suite con bañera freestanding", "5.5 m²"],
                ["Toilette", "2.5 m²"],
                ["Terraza privada con deck y parrilla a gas", "20.0 m²"],
                ["Lavadero y circulación", "13.6 m²"],
                ["TOTAL (cubierta + terraza)", "87.6 m²"],
            ],
        },
    ]

    for ph in phs:
        s.append(Paragraph(f"Unidad {ph['id']} — {ph['bed']} ambiente{'s' if ph['bed'] > 1 else ''}", H1))
        s.append(Paragraph(ph["desc"], BODY))

        rooms_data = [["Ambiente", "Superficie"]] + ph["rooms"]
        t = Table(rooms_data, colWidths=[10 * cm, 3.5 * cm])
        t.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0), GOLD),
            ("TEXTCOLOR",     (0, 0), (-1, 0), colors.white),
            ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",      (0, 0), (-1, -1), 9),
            ("ROWBACKGROUNDS",(0, 1), (-1, -2), [colors.white, LIGHT]),
            ("GRID",          (0, 0), (-1, -1), 0.4, colors.HexColor("#DDDDDD")),
            ("FONTNAME",      (0, -1), (-1, -1), "Helvetica-Bold"),
            ("BACKGROUND",    (0, -1), (-1, -1), LIGHT),
            ("TOPPADDING",    (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("ALIGN",         (1, 0), (-1, -1), "CENTER"),
        ]))
        s.append(t)
        s.append(Spacer(1, 0.3 * cm))
        s.append(Paragraph(f"<b>Precio: USD {ph['price']:,}</b>  ·  Estado: {ph['status']}", PRICE))
        s.append(Spacer(1, 0.6 * cm))

    s.append(Paragraph("Características exclusivas del piso 8", H2))
    features = [
        "Altura libre de 3,20 m (vs 2,60 m en planta tipo)",
        "Doble aislación térmica y acústica en losa de azotea",
        "Acceso directo a terraza privada sin pasar por áreas comunes",
        "Parrilla a gas con pileta de ablución en terraza",
        "Instalación de aire acondicionado incluida (centrales split de alta eficiencia)",
        "Terminaciones premium: mesadas de cuarzo Silestone, griferías Roca Thesis",
        "Domótica incluida: persianas eléctricas, iluminación LED programable, control por app",
    ]
    for f in features:
        s.append(Paragraph(f"• {f}", BODY))

    s.append(Spacer(1, 0.5 * cm))
    s.append(_divider())
    s.append(Paragraph(
        "Plano sujeto a aprobación municipal definitiva. Superficies aproximadas.",
        SMALL,
    ))
    return _doc(s)


# ---------------------------------------------------------------------------
# REGLAMENTO DE COPROPIEDAD
# ---------------------------------------------------------------------------

def generate_reglamento() -> bytes:
    s = []
    s.append(Paragraph(f"{PROJECT_NAME}", TITLE))
    s.append(Paragraph("Reglamento de Copropiedad y Administración · Extracto", SUBT))
    s.append(_divider())
    s.append(Paragraph(
        "El presente extracto resume las disposiciones principales del Reglamento de Copropiedad "
        "del Edificio Maipú 1240, conforme a la Ley 13.512 de Propiedad Horizontal y sus modificatorias. "
        "El texto completo estará disponible con la escrituración de cada unidad.",
        BODY,
    ))

    articulos = [
        ("Art. 1 — Objeto y ámbito",
         "El presente reglamento regula los derechos y obligaciones de los propietarios, "
         "poseedores y usuarios de las unidades funcionales del Edificio Maipú 1240, "
         "ubicado en Maipú 1240, Ciudad Autónoma de Buenos Aires."),

        ("Art. 2 — Partes privativas",
         "Son partes de dominio exclusivo de cada propietario las superficies cubiertas y "
         "semidescubiertas de cada unidad funcional, incluyendo balcones, terrazas privadas y bauleras "
         "individuales asignadas, según nomenclatura del plano de subdivisión."),

        ("Art. 3 — Partes comunes",
         "Son comunes a todos los propietarios: el terreno, las fundaciones, la estructura portante, "
         "las fachadas, techos, azotea general, hall de acceso, palier y escaleras, ascensores, "
         "medios de egreso, instalaciones centrales (agua, gas, electricidad) y todos los amenities "
         "(SUM, gimnasio, terraza, piscina, bicicletero)."),

        ("Art. 4 — Porcentajes fiscales",
         "Las unidades tienen asignados porcentajes del total del edificio para el prorrateo de expensas "
         "comunes, cargas fiscales y gastos de administración, según tabla anexa al reglamento completo."),

        ("Art. 5 — Expensas comunes",
         "Cada propietario contribuirá al pago de expensas ordinarias y extraordinarias en proporción "
         "a su porcentaje fiscal. Las expensas ordinarias incluyen: sueldos del personal de limpieza y "
         "seguridad, mantenimiento de áreas comunes, servicio de ascensor, seguros y servicios básicos "
         "de zonas comunes. Las expensas extraordinarias requerirán aprobación de Asamblea."),

        ("Art. 6 — Administración",
         "El Consorcio será administrado por un Administrador designado en Asamblea Ordinaria con "
         "mandato de dos años renovable. El Administrador podrá ser propietario o tercero profesional. "
         "Hasta la primera asamblea, la desarrolladora ejercerá la administración provisoria."),

        ("Art. 7 — Asambleas",
         "La Asamblea Ordinaria se realizará anualmente dentro de los 120 días posteriores al cierre "
         "del ejercicio. Las Asambleas Extraordinarias se convocarán a pedido del Administrador o de "
         "propietarios que representen el 25% del total del edificio."),

        ("Art. 8 — Uso de las unidades",
         "Las unidades se destinarán exclusivamente al uso residencial. "
         "Se prohíbe: instalar comercios o industrias, realizar actividades que generen ruidos o vibraciones, "
         "depositar materiales inflamables o peligrosos, realizar obras sin autorización del Consorcio."),

        ("Art. 9 — Uso de áreas comunes",
         "El SUM podrá ser reservado por propietarios con al menos 5 días de anticipación, sin costo, "
         "hasta 2 veces por mes. La piscina y terraza tienen horario de uso de 8:00 a 23:00 hs. "
         "El gimnasio tiene horario de 6:00 a 23:00 hs. El bicicletero es de acceso libre con tarjeta RFID."),

        ("Art. 10 — Mascotas",
         "Se permiten mascotas de hasta 15 kg por unidad, con circulación en áreas comunes con correa "
         "y bajo responsabilidad del propietario. Queda prohibido el acceso de mascotas a la piscina, "
         "terraza jardín y gimnasio."),

        ("Art. 11 — Obras y modificaciones",
         "Las obras internas que no afecten estructura ni instalaciones comunes requieren aviso al "
         "Administrador. Toda obra que modifique fachada, estructura, instalaciones o afecte a otras "
         "unidades requiere autorización expresa de la Asamblea y presentación de planos ante el GCBA."),

        ("Art. 12 — Penalidades",
         "El incumplimiento de las disposiciones del presente Reglamento podrá dar lugar a apercibimiento, "
         "multa de hasta 3 veces el valor de la expensa mensual por infracción, y en casos graves, "
         "acción judicial conforme a la Ley 13.512."),
    ]

    for titulo, contenido in articulos:
        s.append(Paragraph(titulo, H2))
        s.append(Paragraph(contenido, BODY))

    s.append(Spacer(1, 0.5 * cm))
    s.append(_divider())
    s.append(Paragraph(
        f"Este extracto es orientativo. El Reglamento de Copropiedad completo se otorgará por escritura pública "
        f"conjuntamente con el primer boleto de compraventa. {DEVELOPER}, {PROJECT_ADDRESS}.",
        SMALL,
    ))
    return _doc(s)


# ---------------------------------------------------------------------------
# UPLOAD + UPDATE DB
# ---------------------------------------------------------------------------

def get_s3():
    return boto3.client(
        "s3",
        endpoint_url=os.getenv("S3_ENDPOINT_URL"),
        aws_access_key_id=os.getenv("S3_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("S3_SECRET_ACCESS_KEY"),
        region_name=os.getenv("S3_REGION", "us-east-1"),
        config=Config(signature_version="s3v4"),
    )


def upload(s3, key: str, pdf_bytes: bytes) -> str:
    bucket = os.getenv("S3_BUCKET_NAME", "real-state")
    public_url = os.getenv("S3_PUBLIC_URL", "")
    s3.put_object(Bucket=bucket, Key=key, Body=pdf_bytes, ContentType="application/pdf")
    url = f"{public_url}/{key}"
    print(f"  ↑ {key}  ({len(pdf_bytes):,} bytes)")
    return url


async def update_db_urls(url_map: dict[str, str]):
    """Actualiza file_url en documents para el proyecto Maipú 1240."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("  ⚠ DATABASE_URL no definida — no se actualizó la BD")
        return
    conn = await asyncpg.connect(database_url)
    try:
        for filename, url in url_map.items():
            result = await conn.execute(
                "UPDATE documents SET file_url=$1, file_size_bytes=$2, rag_status='ready' "
                "WHERE filename=$3 AND project_id=(SELECT id FROM projects WHERE slug=$4)",
                url, 0, filename, PROJECT_SLUG,
            )
            print(f"  ✓ DB actualizado: {filename}")
    finally:
        await conn.close()


async def main():
    print(f"\nGenerando PDFs para {PROJECT_NAME}...\n")

    s3 = get_s3()
    prefix = f"projects/{PROJECT_SLUG}"
    url_map = {}

    tasks = [
        ("brochure_maipu_1240.pdf",           generate_brochure),
        ("lista_precios_maipu_1240.pdf",       generate_price_list),
        ("memoria_descriptiva_maipu_1240.pdf", generate_memoria),
        ("plano_tipo_pisos_1_4.pdf",           generate_plano_tipo),
        ("plano_ph.pdf",                       generate_plano_ph),
        ("reglamento_copropiedad.pdf",         generate_reglamento),
    ]

    for filename, generator in tasks:
        print(f"  Generando {filename}...")
        pdf_bytes = generator()
        key = f"{prefix}/{filename}"
        url = upload(s3, key, pdf_bytes)
        url_map[filename] = url

    print(f"\nActualizando registros en base de datos...")
    await update_db_urls(url_map)

    print(f"\n✅  {len(tasks)} PDFs generados y subidos a {prefix}/\n")


if __name__ == "__main__":
    asyncio.run(main())
