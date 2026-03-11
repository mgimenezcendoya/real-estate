"""
Test that the lead agent correctly uses tool_use for documents and handoffs.

Run: python tests/test_tool_use_agent.py

Requires ANTHROPIC_API_KEY env var.
"""

import asyncio
import os
import sys

from anthropic import AsyncAnthropic

# Copy tool definitions and prompt inline to avoid importing the full app
LEAD_TOOLS = [
    {
        "name": "enviar_documento",
        "description": (
            "Envía un documento del proyecto al lead por WhatsApp. "
            "Usá esta herramienta cuando el lead pida explícitamente un documento "
            "(brochure, plano, lista de precios, memoria, etc.)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "tipo": {
                    "type": "string",
                    "enum": ["plano", "precios", "brochure", "memoria", "reglamento", "faq", "contrato", "cronograma"],
                    "description": "Tipo de documento a enviar",
                },
                "unidad": {
                    "type": "string",
                    "description": "Identificador de la unidad (ej: 2B). Omitir si no aplica a una unidad específica.",
                },
                "proyecto_slug": {
                    "type": "string",
                    "description": "Slug del proyecto en minúsculas con guiones (ej: manzanares-2088)",
                },
            },
            "required": ["tipo", "proyecto_slug"],
        },
    },
    {
        "name": "derivar_vendedor",
        "description": (
            "Deriva la conversación a un vendedor humano. "
            "Usá esta herramienta cuando: (1) el lead pide hablar con una persona, "
            "(2) el lead muestra intención de cierre (quiere reservar, señar, visitar), "
            "o (3) no podés responder con certeza y el lead insiste."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "razon": {
                    "type": "string",
                    "enum": ["lead_request", "intencion_cierre", "consulta_especifica"],
                    "description": "Motivo de la derivación",
                },
            },
            "required": ["razon"],
        },
    },
]

# Read the prompt from prompts.py without importing the module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
_prompt_path = os.path.join(os.path.dirname(__file__), "..", "app", "modules", "agent", "prompts.py")
with open(_prompt_path) as f:
    _code = f.read()
_ns = {}
exec(compile(_code, _prompt_path, "exec"), _ns)
LEAD_SYSTEM_PROMPT = _ns["LEAD_SYSTEM_PROMPT"]


DEVELOPER_NAME = "TestDev"
SYSTEM = LEAD_SYSTEM_PROMPT.format(
    developer_name=DEVELOPER_NAME,
    qualification_status="Ninguno todavía — es un contacto nuevo.",
    missing_fields="- Nombre\n- Proposito\n- Financiamiento\n- Timeline\n- Presupuesto\n- Ambientes\n- Ubicacion",
)

UNIT_CONTEXT = """## Manzanares 2088 (manzanares-2088)
Unidades disponibles:
- 2A: P2, 2amb, 45m², USD 85,000 [disponible]
- 2B: P2, 3amb, 65m², USD 120,000 [disponible]
- 3A: P3, 2amb, 45m², USD 90,000 [reservada]
Documentos: Brochure (brochure_manzanares.pdf), Lista de precios (precios_manzanares.pdf), Plano 2B (plano_2B.pdf)"""


async def run_test(test_name: str, user_message: str, expect_tool: str | None):
    """Run a single test case against the live API."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not set")
        sys.exit(1)

    client = AsyncAnthropic(api_key=api_key)

    messages = [
        {"role": "user", "content": f"⚠️ ESTADO ACTUAL DE UNIDADES:\n{UNIT_CONTEXT}"},
        {"role": "assistant", "content": "Entendido, tengo el estado actualizado de todas las unidades."},
        {"role": "user", "content": user_message},
    ]

    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=500,
        temperature=0.4,
        system=SYSTEM,
        messages=messages,
        tools=LEAD_TOOLS,
    )

    text_blocks = [b for b in response.content if b.type == "text"]
    tool_blocks = [b for b in response.content if b.type == "tool_use"]

    text = text_blocks[0].text if text_blocks else "(no text)"
    tools_used = [(b.name, b.input) for b in tool_blocks]

    print(f"\n{'='*60}")
    print(f"TEST: {test_name}")
    print(f"USER: {user_message}")
    print(f"TEXT: {text[:200]}")
    print(f"TOOLS: {tools_used}")

    if expect_tool is None:
        ok = len(tool_blocks) == 0
        status = "PASS" if ok else "FAIL (expected no tool)"
    else:
        ok = any(b.name == expect_tool for b in tool_blocks)
        status = "PASS" if ok else f"FAIL (expected {expect_tool})"

    print(f"STATUS: {status}")
    return ok


async def main():
    results = []

    results.append(await run_test(
        "Simple greeting — no tools",
        "Hola, buenos días",
        expect_tool=None,
    ))

    results.append(await run_test(
        "Ask for brochure — should use enviar_documento",
        "Me mandás el brochure de Manzanares?",
        expect_tool="enviar_documento",
    ))

    results.append(await run_test(
        "Ask for price list — should use enviar_documento",
        "Pasame la lista de precios",
        expect_tool="enviar_documento",
    ))

    results.append(await run_test(
        "Want to reserve — should trigger derivar_vendedor",
        "Quiero reservar el 2B, cómo hago para señar?",
        expect_tool="derivar_vendedor",
    ))

    results.append(await run_test(
        "Ask about a specific unit — no tools",
        "Cuánto sale el 2A?",
        expect_tool=None,
    ))

    results.append(await run_test(
        "Ask to talk to a person — should trigger derivar_vendedor",
        "Quiero hablar con una persona por favor",
        expect_tool="derivar_vendedor",
    ))

    print(f"\n{'='*60}")
    passed = sum(results)
    total = len(results)
    print(f"RESULTS: {passed}/{total} passed")

    if passed < total:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
