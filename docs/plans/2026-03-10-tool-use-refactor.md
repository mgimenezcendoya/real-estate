# Tool Use Refactor — Lead Agent

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace text markers (`[ENVIAR_DOC]`, `[HANDOFF]`) with Anthropic tool_use for reliable structured actions.

**Architecture:** Define 2 tools (`enviar_documento`, `derivar_vendedor`) in the API call. Claude returns structured JSON tool calls alongside text. No more regex parsing or fallback detection.

**Tech Stack:** Anthropic Python SDK 0.84.0 (tool_use support), existing FastAPI backend.

---

### Task 1: Define tool schemas in lead_handler.py

**Files:**
- Modify: `app/modules/agent/lead_handler.py`

Define `LEAD_TOOLS` — the tool definitions for `enviar_documento` and `derivar_vendedor` with enums for validation.

---

### Task 2: Update LEAD_SYSTEM_PROMPT — remove marker instructions

**Files:**
- Modify: `app/modules/agent/prompts.py`

Remove sections 5 (COMPARTIR DOCUMENTOS) and 6 (DERIVACIÓN A VENDEDOR) that explain marker syntax. Replace with brief tool-aware instructions.

---

### Task 3: Refactor _generate_response to use tools

**Files:**
- Modify: `app/modules/agent/lead_handler.py`

Pass `tools=LEAD_TOOLS` to `client.messages.create()`. Change return type to return both text and tool calls.

---

### Task 4: Refactor handle_lead_message to process tool_use blocks

**Files:**
- Modify: `app/modules/agent/lead_handler.py`

Replace `_extract_doc_marker` / `_extract_handoff_marker` parsing with processing of `tool_use` content blocks. Remove `_HANDOFF_PHRASES` fallback, `DOC_MARKER_RE`, `HANDOFF_MARKER_RE`.

---

### Task 5: Write test script and validate

**Files:**
- Create: `tests/test_tool_use_agent.py`

Test that the refactored `_generate_response` correctly returns tool calls when expected, and text-only when no action needed.
