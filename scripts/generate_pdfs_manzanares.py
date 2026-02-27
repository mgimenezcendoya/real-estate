"""
Generate realistic PDF documents for Manzanares 2088 and upload to Supabase Storage.
Run: python -m scripts.generate_pdfs_manzanares
"""

import io
import os
import sys

import boto3
from botocore.config import Config
from dotenv import load_dotenv
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
)

load_dotenv()

WIDTH, HEIGHT = A4
PROJECT_NAME = "Manzanares 2088"
PROJECT_ADDRESS = "Manzanares 2088, Núñez, CABA"
DEVELOPER = "Demo Developer SA"

UNITS = [
    {"id": "1A", "floor": 1, "bed": 1, "m2": 35, "price": 58000, "status": "Disponible", "desc": "Monoambiente amplio con balcón al contrafrente. Orientación Norte. Ideal inversión."},
    {"id": "1B", "floor": 1, "bed": 2, "m2": 50, "price": 78000, "status": "Disponible", "desc": "2 ambientes con cocina integrada y balcón corrido. Orientación Noreste."},
    {"id": "2A", "floor": 2, "bed": 2, "m2": 52, "price": 82000, "status": "Disponible", "desc": "2 ambientes con vista abierta, balcón terraza y parrilla individual."},
    {"id": "2B", "floor": 2, "bed": 2, "m2": 55, "price": 86000, "status": "Reservado", "desc": "2 ambientes esquinero, doble orientación. Balcón en L con vista al río."},
    {"id": "3A", "floor": 3, "bed": 3, "m2": 72, "price": 115000, "status": "Disponible", "desc": "3 ambientes con suite principal, vestidor y 2 baños completos."},
    {"id": "3B", "floor": 3, "bed": 3, "m2": 75, "price": 120000, "status": "Disponible", "desc": "3 ambientes con dependencia de servicio. Balcón aterrazado con parrilla."},
    {"id": "4A", "floor": 4, "bed": 3, "m2": 78, "price": 130000, "status": "Disponible", "desc": "3 ambientes premium, piso alto con vista panorámica. Cocina independiente."},
    {"id": "PH", "floor": 5, "bed": 4, "m2": 110, "price": 195000, "status": "Disponible", "desc": "Penthouse con terraza propia de 40m², parrilla, jacuzzi. 4 ambientes, 3 baños, suite principal con vestidor."},
]

styles = getSampleStyleSheet()

STYLE_TITLE = ParagraphStyle("CustomTitle", parent=styles["Title"], fontSize=22, spaceAfter=12, textColor=colors.HexColor("#1a1a2e"))
STYLE_H1 = ParagraphStyle("H1", parent=styles["Heading1"], fontSize=16, spaceAfter=8, textColor=colors.HexColor("#16213e"))
STYLE_H2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=13, spaceAfter=6, textColor=colors.HexColor("#0f3460"))
STYLE_BODY = ParagraphStyle("Body", parent=styles["Normal"], fontSize=10, leading=14, spaceAfter=6)
STYLE_SMALL = ParagraphStyle("Small", parent=styles["Normal"], fontSize=8, textColor=colors.grey)
STYLE_FOOTER = ParagraphStyle("Footer", parent=styles["Normal"], fontSize=7, textColor=colors.grey, alignment=1)


def _header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.grey)
    canvas.drawString(2 * cm, HEIGHT - 1.2 * cm, f"{PROJECT_NAME} — {DEVELOPER}")
    canvas.drawRightString(WIDTH - 2 * cm, HEIGHT - 1.2 * cm, "Documento confidencial")
    canvas.drawCentredString(WIDTH / 2, 1 * cm, f"© 2026 {DEVELOPER} — Todos los derechos reservados")
    canvas.restoreState()


def _build_pdf(story: list) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=2 * cm, bottomMargin=2 * cm, leftMargin=2.5 * cm, rightMargin=2.5 * cm)
    doc.build(story, onFirstPage=_header_footer, onLaterPages=_header_footer)
    return buf.getvalue()


# ---------- BROCHURE ----------

def generate_brochure() -> bytes:
    story = []
    story.append(Spacer(1, 3 * cm))
    story.append(Paragraph(PROJECT_NAME, STYLE_TITLE))
    story.append(Paragraph("Vivir en Núñez, a pasos del río", ParagraphStyle("Sub", parent=styles["Normal"], fontSize=14, textColor=colors.HexColor("#0f3460"), spaceAfter=20)))
    story.append(Spacer(1, 1 * cm))

    story.append(Paragraph("Un proyecto pensado para quienes buscan calidad de vida", STYLE_H1))
    story.append(Paragraph(
        f"<b>{PROJECT_NAME}</b> es un edificio residencial premium ubicado en <b>{PROJECT_ADDRESS}</b>, "
        "en el corazón de Núñez, uno de los barrios más cotizados de Buenos Aires. "
        "A solo 5 cuadras del Río de la Plata y a metros de la estación Núñez del tren Mitre, "
        "combina una ubicación estratégica con diseño contemporáneo y terminaciones de primera calidad.",
        STYLE_BODY,
    ))
    story.append(Paragraph(
        "El edificio cuenta con 5 plantas, 8 unidades funcionales que van desde monoambientes "
        "hasta un penthouse de 4 ambientes con terraza propia. Cada unidad fue diseñada maximizando "
        "la luz natural y los espacios de guardado.",
        STYLE_BODY,
    ))

    story.append(Spacer(1, 0.5 * cm))
    story.append(Paragraph("Amenities", STYLE_H1))
    amenities = [
        "SUM con parrilla y horno de barro (capacidad 30 personas)",
        "Terraza común en azotea con solárium y vista al río",
        "Piscina descubierta con deck de madera",
        "Gimnasio equipado con vestuarios",
        "Bicicletero cubierto con carga eléctrica",
        "Cocheras opcionales en subsuelo (disponibilidad limitada)",
        "Seguridad 24hs con CCTV y acceso biométrico",
        "Lobby con recepción y paquetería inteligente",
    ]
    for a in amenities:
        story.append(Paragraph(f"• {a}", STYLE_BODY))

    story.append(Spacer(1, 0.5 * cm))
    story.append(Paragraph("Ubicación privilegiada", STYLE_H1))
    story.append(Paragraph(
        "Núñez es un barrio residencial que combina tranquilidad con excelente conectividad. "
        "A metros de Av. del Libertador, con acceso rápido a la Panamericana y al centro porteño. "
        "Rodeado de espacios verdes, clubes deportivos y una oferta gastronómica en crecimiento.",
        STYLE_BODY,
    ))
    distances = [
        ("Estación Núñez (Tren Mitre)", "3 cuadras"),
        ("Av. del Libertador", "2 cuadras"),
        ("Acceso Panamericana", "8 minutos en auto"),
        ("River Plate / zona deportiva", "10 cuadras"),
        ("Centro Comercial Dot Baires", "5 minutos en auto"),
        ("Aeroparque Jorge Newbery", "15 minutos en auto"),
    ]
    dist_data = [["Punto de interés", "Distancia"]] + [[d[0], d[1]] for d in distances]
    t = Table(dist_data, colWidths=[10 * cm, 4 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f0f0f5")]),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(t)

    story.append(PageBreak())
    story.append(Paragraph("Tipologías disponibles", STYLE_H1))
    story.append(Paragraph("Todas las unidades se entregan con cocina amoblada, aire acondicionado split en living y dormitorios, y pisos de porcelanato.", STYLE_BODY))
    story.append(Spacer(1, 0.3 * cm))

    for u in UNITS:
        story.append(Paragraph(f"Unidad {u['id']} — Piso {u['floor']} — {u['bed']} ambiente{'s' if u['bed'] > 1 else ''}", STYLE_H2))
        story.append(Paragraph(f"{u['desc']}", STYLE_BODY))
        story.append(Paragraph(f"<b>Superficie:</b> {u['m2']}m² totales | <b>Estado:</b> {u['status']} | <b>Precio referencial:</b> USD {u['price']:,}", STYLE_BODY))
        story.append(Spacer(1, 0.3 * cm))

    story.append(Spacer(1, 1 * cm))
    story.append(Paragraph("Forma de pago", STYLE_H1))
    story.append(Paragraph("• <b>Anticipo:</b> 30% en dólares al boleto", STYLE_BODY))
    story.append(Paragraph("• <b>Cuotas:</b> 18 cuotas mensuales en pesos ajustadas por CAC", STYLE_BODY))
    story.append(Paragraph("• <b>Entrega:</b> 10% contra posesión", STYLE_BODY))
    story.append(Paragraph("• <b>Descuento contado:</b> 5% de bonificación por pago total al boleto", STYLE_BODY))

    story.append(Spacer(1, 1 * cm))
    story.append(Paragraph(
        "Los precios publicados son referenciales y pueden variar sin previo aviso. "
        "Consulte con nuestro equipo comercial para información actualizada.",
        STYLE_SMALL,
    ))
    story.append(Paragraph(f"Contacto: ventas@demodeveloper.com | +54 11 5555-0000", STYLE_SMALL))

    return _build_pdf(story)


# ---------- LISTA DE PRECIOS ----------

def generate_price_list() -> bytes:
    story = []
    story.append(Paragraph(f"{PROJECT_NAME} — Lista de Precios", STYLE_TITLE))
    story.append(Paragraph(f"Actualizada: Febrero 2026", STYLE_SMALL))
    story.append(Spacer(1, 0.5 * cm))

    story.append(Paragraph("Precios referenciales en dólares estadounidenses", STYLE_H2))
    story.append(Spacer(1, 0.3 * cm))

    data = [["Unidad", "Piso", "Amb.", "Sup. (m²)", "USD/m²", "Precio Total (USD)", "Estado"]]
    for u in UNITS:
        usd_m2 = round(u["price"] / u["m2"])
        data.append([
            u["id"],
            str(u["floor"]),
            str(u["bed"]),
            str(u["m2"]),
            f"${usd_m2:,}",
            f"${u['price']:,}",
            u["status"],
        ])

    avg_m2 = round(sum(u["price"] / u["m2"] for u in UNITS) / len(UNITS))
    data.append(["", "", "", "", f"Prom: ${avg_m2:,}/m²", "", ""])

    t = Table(data, colWidths=[2 * cm, 1.5 * cm, 1.5 * cm, 2.5 * cm, 2.5 * cm, 3.5 * cm, 2.5 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("FONTSIZE", (0, 1), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -2), 0.5, colors.lightgrey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#f5f5fa")]),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (-2, 1), (-2, -2), colors.HexColor("#16213e")),
    ]))
    story.append(t)

    story.append(Spacer(1, 1 * cm))
    story.append(Paragraph("Cocheras opcionales", STYLE_H2))
    cocheras = [["Tipo", "Precio (USD)"], ["Cochera cubierta", "$18,000"], ["Cochera descubierta", "$12,000"], ["Baulera (3m²)", "$5,000"]]
    t2 = Table(cocheras, colWidths=[8 * cm, 4 * cm])
    t2.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f3460")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(t2)

    story.append(Spacer(1, 1 * cm))
    story.append(Paragraph("Condiciones de pago", STYLE_H1))
    story.append(Paragraph("<b>Opción 1 — Financiado:</b>", STYLE_BODY))
    story.append(Paragraph("• 30% anticipo en USD al boleto de compraventa", STYLE_BODY))
    story.append(Paragraph("• 18 cuotas mensuales ajustadas por índice CAC", STYLE_BODY))
    story.append(Paragraph("• 10% saldo contra entrega de posesión", STYLE_BODY))
    story.append(Spacer(1, 0.3 * cm))
    story.append(Paragraph("<b>Opción 2 — Contado:</b>", STYLE_BODY))
    story.append(Paragraph("• 100% al boleto con 5% de descuento sobre precio de lista", STYLE_BODY))
    story.append(Spacer(1, 0.3 * cm))
    story.append(Paragraph("<b>Opción 3 — Plan inversor:</b>", STYLE_BODY))
    story.append(Paragraph("• 50% al boleto + 50% contra posesión (sin ajuste)", STYLE_BODY))

    story.append(Spacer(1, 1 * cm))
    story.append(Paragraph("Entrega estimada: Diciembre 2027", ParagraphStyle("Entrega", parent=STYLE_H2, textColor=colors.HexColor("#e94560"))))
    story.append(Spacer(1, 0.5 * cm))
    story.append(Paragraph(
        "Los precios son referenciales, expresados en dólares estadounidenses y pueden sufrir modificaciones sin previo aviso. "
        "Esta lista no constituye una oferta vinculante. Consulte condiciones vigentes con el equipo comercial.",
        STYLE_SMALL,
    ))

    return _build_pdf(story)


# ---------- MEMORIA DESCRIPTIVA ----------

def generate_memoria() -> bytes:
    story = []
    story.append(Paragraph(f"{PROJECT_NAME} — Memoria Descriptiva", STYLE_TITLE))
    story.append(Spacer(1, 0.5 * cm))

    story.append(Paragraph("1. Estructura", STYLE_H1))
    story.append(Paragraph("Estructura independiente de hormigón armado H30, calculada según CIRSOC 201/2005. "
        "Fundaciones sobre pilotes de hormigón in situ. Losas nervuradas en todos los niveles. "
        "Estructura antisísmica según norma INPRES-CIRSOC 103.", STYLE_BODY))

    story.append(Paragraph("2. Mampostería", STYLE_H1))
    story.append(Paragraph("Cerramientos exteriores en ladrillo cerámico hueco de 18cm con cámara de aire y "
        "tabique interior de 8cm. Medianeras en ladrillo común de 30cm. "
        "Divisorias interiores en ladrillo hueco de 12cm.", STYLE_BODY))

    story.append(Paragraph("3. Pisos", STYLE_H1))
    story.append(Paragraph("• <b>Living, comedor y dormitorios:</b> Porcelanato rectificado 60x60cm, primera calidad, color a elección (gris, beige o madera)", STYLE_BODY))
    story.append(Paragraph("• <b>Baños:</b> Porcelanato rectificado 30x60cm en pisos y revestimientos hasta techo", STYLE_BODY))
    story.append(Paragraph("• <b>Cocina:</b> Porcelanato rectificado 60x60cm. Revestimiento en salpicadero 60x30cm", STYLE_BODY))
    story.append(Paragraph("• <b>Balcones:</b> Porcelanato exterior antideslizante 40x40cm", STYLE_BODY))
    story.append(Paragraph("• <b>Palier y hall de acceso:</b> Granito gris mara pulido", STYLE_BODY))

    story.append(Paragraph("4. Carpinterías", STYLE_H1))
    story.append(Paragraph("• <b>Exteriores:</b> Aluminio anodizado línea Modena con DVH (doble vidriado hermético) 4+9+4mm. "
        "Premarcos incluidos.", STYLE_BODY))
    story.append(Paragraph("• <b>Interiores:</b> Puertas placa MDF 70cm con marco de chapa doblada pintada. "
        "Puerta de ingreso blindada con cerradura multipunto.", STYLE_BODY))

    story.append(Paragraph("5. Instalación sanitaria", STYLE_H1))
    story.append(Paragraph("Provisión de agua fría y caliente por sistema de termotanque individual de alta recuperación (80L). "
        "Cañerías de PPFusión (agua) y PVC reforzado (desagüe). "
        "Griferías monocomando cromadas en toda la unidad.", STYLE_BODY))
    story.append(Paragraph("• <b>Sanitarios:</b> Inodoro largo depósito adosado, bidet y lavatorio de colgar, línea Ferrum Bari o equivalente.", STYLE_BODY))
    story.append(Paragraph("• <b>Cocina:</b> Mesada de granito gris mara pulido con bacha de acero inoxidable.", STYLE_BODY))

    story.append(Paragraph("6. Instalación eléctrica", STYLE_H1))
    story.append(Paragraph("Tablero seccional con térmicas y disyuntor diferencial por unidad. "
        "Cableado bajo tubo corrugado empotrado. Tomacorrientes Línea Siglo XXI (Cambre) o equivalente. "
        "Preinstalación para aire acondicionado split en living y dormitorios (cañería, desagüe y circuito dedicado). "
        "Portero eléctrico con cámara.", STYLE_BODY))

    story.append(Paragraph("7. Instalación de gas", STYLE_H1))
    story.append(Paragraph("Instalación según normas NAG, con medidores individuales. "
        "Cocina a gas natural. Calefacción por radiadores en living y dormitorios (unidades de 3+ ambientes).", STYLE_BODY))

    story.append(Paragraph("8. Pintura", STYLE_H1))
    story.append(Paragraph("• <b>Interior:</b> Latex acrílico sobre enduido plástico en paredes y cielorrasos.", STYLE_BODY))
    story.append(Paragraph("• <b>Exterior:</b> Revestimiento texturado acrílico con detalles en símil piedra.", STYLE_BODY))

    story.append(Paragraph("9. Espacios comunes", STYLE_H1))
    story.append(Paragraph("• Hall de acceso con revestimiento en porcelanato y vidrio. Recepción con mesada de granito.", STYLE_BODY))
    story.append(Paragraph("• SUM en planta baja con parrilla, horno de barro, kitchenette y baño.", STYLE_BODY))
    story.append(Paragraph("• Terraza en azotea con solárium, deck de madera y parrilla comunitaria.", STYLE_BODY))
    story.append(Paragraph("• Piscina descubierta (6x3m) con deck perimetral y ducha.", STYLE_BODY))
    story.append(Paragraph("• Gimnasio equipado en subsuelo con vestuarios.", STYLE_BODY))

    story.append(Paragraph("10. Ascensor", STYLE_H1))
    story.append(Paragraph("Un ascensor automático para 6 personas, velocidad 1m/seg, con puertas de acero inoxidable. "
        "Paradas en todos los niveles incluyendo subsuelo.", STYLE_BODY))

    story.append(Spacer(1, 1 * cm))
    story.append(Paragraph(
        "La presente memoria descriptiva es orientativa. El desarrollador se reserva el derecho de "
        "reemplazar materiales y marcas por otros de calidad equivalente o superior, manteniendo el estándar general del proyecto.",
        STYLE_SMALL,
    ))

    return _build_pdf(story)


# ---------- PLANOS ----------

def generate_plano(unit: dict) -> bytes:
    story = []
    story.append(Paragraph(f"{PROJECT_NAME} — Plano Unidad {unit['id']}", STYLE_TITLE))
    story.append(Paragraph(f"Piso {unit['floor']} — {unit['bed']} ambiente{'s' if unit['bed'] > 1 else ''} — {unit['m2']}m²", STYLE_H2))
    story.append(Spacer(1, 0.5 * cm))

    story.append(Paragraph(unit["desc"], STYLE_BODY))
    story.append(Spacer(1, 0.5 * cm))

    story.append(Paragraph("Distribución", STYLE_H1))

    if unit["bed"] == 1:
        rooms = [
            ["Ambiente", "Superficie aprox."],
            ["Living-comedor-dormitorio", "18.0 m²"],
            ["Cocina integrada", "4.5 m²"],
            ["Baño completo", "3.5 m²"],
            ["Balcón", "3.0 m²"],
            ["Circulación y placares", "6.0 m²"],
            ["TOTAL", f"{unit['m2']}.0 m²"],
        ]
    elif unit["bed"] == 2:
        rooms = [
            ["Ambiente", "Superficie aprox."],
            ["Living-comedor", f"{unit['m2'] * 0.28:.1f} m²"],
            ["Dormitorio principal", f"{unit['m2'] * 0.22:.1f} m²"],
            ["Cocina", f"{unit['m2'] * 0.10:.1f} m²"],
            ["Baño completo", f"{unit['m2'] * 0.08:.1f} m²"],
            ["Toilette", f"{unit['m2'] * 0.04:.1f} m²"],
            ["Balcón", f"{unit['m2'] * 0.08:.1f} m²"],
            ["Circulación y placares", f"{unit['m2'] * 0.20:.1f} m²"],
            ["TOTAL", f"{unit['m2']}.0 m²"],
        ]
    elif unit["bed"] == 3:
        rooms = [
            ["Ambiente", "Superficie aprox."],
            ["Living-comedor", f"{unit['m2'] * 0.25:.1f} m²"],
            ["Dormitorio principal (suite)", f"{unit['m2'] * 0.18:.1f} m²"],
            ["Dormitorio 2", f"{unit['m2'] * 0.14:.1f} m²"],
            ["Cocina", f"{unit['m2'] * 0.09:.1f} m²"],
            ["Baño principal (en suite)", f"{unit['m2'] * 0.07:.1f} m²"],
            ["Baño secundario", f"{unit['m2'] * 0.06:.1f} m²"],
            ["Balcón aterrazado", f"{unit['m2'] * 0.08:.1f} m²"],
            ["Circulación, placares y lavadero", f"{unit['m2'] * 0.13:.1f} m²"],
            ["TOTAL", f"{unit['m2']}.0 m²"],
        ]
    else:
        rooms = [
            ["Ambiente", "Superficie aprox."],
            ["Living-comedor", "28.0 m²"],
            ["Dormitorio principal (suite + vestidor)", "18.0 m²"],
            ["Dormitorio 2", "12.0 m²"],
            ["Dormitorio 3", "11.0 m²"],
            ["Cocina independiente", "10.0 m²"],
            ["Baño en suite", "6.0 m²"],
            ["Baño completo", "5.0 m²"],
            ["Toilette", "2.5 m²"],
            ["Lavadero independiente", "4.0 m²"],
            ["Terraza propia con parrilla", "40.0 m²"],
            ["Circulación y placares", "13.5 m²"],
            ["TOTAL (cubierta + terraza)", f"{unit['m2'] + 40}.0 m²"],
        ]

    t = Table(rooms, colWidths=[10 * cm, 4 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#f5f5fa")]),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(t)

    story.append(Spacer(1, 0.5 * cm))
    story.append(Paragraph("Características de la unidad", STYLE_H1))

    features = [
        f"Orientación: {'Norte' if unit['floor'] % 2 == 1 else 'Noreste'}",
        f"Altura: Piso {unit['floor']} ({unit['floor'] * 3:.0f}m sobre nivel de vereda)",
    ]
    if unit["bed"] >= 2:
        features.append("Aire acondicionado: preinstalación en living y dormitorios")
    else:
        features.append("Aire acondicionado: preinstalación en ambiente principal")
    features.append("Calefacción: radiador en living" if unit["bed"] <= 2 else "Calefacción: radiadores en living y dormitorios")
    features.append(f"Placares: {'1 placar de 1.50m' if unit['bed'] <= 2 else '2 placares + vestidor en suite'}")
    features.append("Carpintería exterior: aluminio con DVH")
    features.append("Piso: porcelanato rectificado 60x60")

    for f in features:
        story.append(Paragraph(f"• {f}", STYLE_BODY))

    story.append(Spacer(1, 0.8 * cm))
    story.append(Paragraph(f"<b>Precio referencial: USD {unit['price']:,}</b> — Estado: {unit['status']}", ParagraphStyle("Price", parent=STYLE_BODY, fontSize=12, textColor=colors.HexColor("#e94560"))))

    story.append(Spacer(1, 0.5 * cm))
    story.append(Paragraph("Las superficies son aproximadas y pueden variar según plano municipal aprobado.", STYLE_SMALL))

    return _build_pdf(story)


# ---------- MAIN ----------

def upload_to_s3(key: str, pdf_bytes: bytes):
    s3 = boto3.client(
        "s3",
        endpoint_url=os.getenv("S3_ENDPOINT_URL"),
        aws_access_key_id=os.getenv("S3_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("S3_SECRET_ACCESS_KEY"),
        region_name=os.getenv("S3_REGION", "us-east-1"),
        config=Config(signature_version="s3v4"),
    )
    bucket = os.getenv("S3_BUCKET_NAME", "real-state")
    s3.put_object(Bucket=bucket, Key=key, Body=pdf_bytes, ContentType="application/pdf")
    public_url = os.getenv("S3_PUBLIC_URL")
    url = f"{public_url}/{key}"
    print(f"  Uploaded: {key} ({len(pdf_bytes):,} bytes) -> {url}")
    return url


def main():
    slug = "manzanares-2088"
    prefix = f"projects/{slug}"

    print(f"Generating PDFs for {PROJECT_NAME}...\n")

    pdf = generate_brochure()
    upload_to_s3(f"{prefix}/brochure_manzanares_2088.pdf", pdf)

    pdf = generate_price_list()
    upload_to_s3(f"{prefix}/lista_precios_manzanares_2088.pdf", pdf)

    pdf = generate_memoria()
    upload_to_s3(f"{prefix}/memoria_descriptiva_manzanares_2088.pdf", pdf)

    unit_map = {u["id"]: u for u in UNITS}
    for uid in ["1A", "2B", "3A", "PH"]:
        pdf = generate_plano(unit_map[uid])
        upload_to_s3(f"{prefix}/plano_{uid.lower()}.pdf", pdf)

    print(f"\nDone! All PDFs uploaded to {prefix}/")


if __name__ == "__main__":
    main()
