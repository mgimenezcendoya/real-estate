# Cobros y Suscripciones — Realia

**Fecha:** 2026-03-11
**Estado:** Borrador — en evolución
**Objetivo:** Definir cómo cobrar a clientes, gestionar accesos y cumplir con obligaciones fiscales en cada etapa del negocio.

---

## Situación actual

- Sin persona jurídica constituida
- Sin CUIT / monotributo activo
- Pricing definido en USD (Base $349 / Pro $599 / Studio $1.100/mes + add-ons)
- Primeros clientes serán relaciones directas (sin self-serve todavía)

---

## 1. Facturación: opciones legales en Argentina

### El problema con USD en Argentina

En Argentina podés emitir facturas en USD, pero tenés la obligación de ingresar las divisas al sistema financiero (MULC) al tipo de cambio oficial. En la práctica esto significa:
- Facturás en USD ✓
- Percibís los dólares ✓
- Si los recibís en una cuenta argentina, debés liquidarlos a pesos al TC oficial (lo cual erosiona el valor)

La salida que usan casi todos los fundadores de SaaS argentinos que cobran en USD es **constituir una entidad extranjera** para facturar desde afuera.

---

### Opciones de entidad legal (ordenadas por urgencia)

#### Opción A — Sin entidad (etapa pre-revenue, hasta ~3 clientes)
**Cómo:** Acuerdo informal (email/WhatsApp), cobro por transferencia a cuenta personal o Wise personal, sin factura.
**Viable porque:** En la etapa de piloto, los primeros clientes (tu red de contactos) entienden que el producto es pre-comercial. Es frecuente en Argentina en early stage.
**Limitación:** No escalable. No podés emitir factura. Algunos clientes corporativos lo van a requerir.
**Cuándo salir:** Al tener el primer cliente que exija factura o al superar los 3 clientes activos.

---

#### Opción B — Monotributo (etapa ~3-10 clientes, ingresos bajos)
**Cómo:** Inscribirse en AFIP como monotributista. Podés emitir facturas tipo C.
**Costo:** Cuota mensual ~ARS 15.000–50.000 según categoría (sube con los ingresos declarados).
**Problema con USD:** Si cobrás en USD y los declarás al TC oficial, la base imponible en pesos es alta. Techo del monotributo (servicios): ~ARS 15M/año ≈ USD 10.000-15.000 al TC oficial. Con 3 clientes Pro ya lo superás.
**Conclusión:** Sirve para los primeros meses pero el techo te queda chico rápido con pricing en USD.

---

#### Opción C — Sociedad en Uruguay (recomendada para cobro en USD a mediano plazo)
**Cómo:** Constituir una SRL o SA en Uruguay. Costo: ~USD 500-1.500 en honorarios de escribanía + ~USD 200/año de mantenimiento.
**Ventajas:**
- Facturás en USD desde una entidad extranjera, sin restricciones cambiarias
- Cuenta bancaria en Uruguay (dólares reales)
- Tratado de doble imposición Argentina-Uruguay
- Uruguay tiene software como servicio exento de IVA en algunos casos

**Referencia:** Muchos SaaS argentinos (Mercado Libre antes, y muchas startups post-cepo) operan con entidad uruguaya para cobros internacionales.

---

#### Opción D — LLC en Delaware, EEUU (recomendada para cobros con Stripe a largo plazo)
**Cómo:** Stripe Atlas o servicio similar. Costo: ~USD 500 setup + ~USD 100/año.
**Ventajas:**
- Cuenta Stripe y cuenta bancaria US nativa
- Acceso a todo el ecosistema de SaaS (Stripe, AWS credits, etc.)
- Ideal si algún día querés inversores o expansión a otros países

**Desventaja:** Requiere reportar ingresos al IRS (formularios anuales). No tan inmediato como Uruguay.

---

### Recomendación por etapa

| Etapa | Situación | Acción |
|---|---|---|
| **Hoy — primer cliente** | Sin entidad | Acuerdo por email, cobro a cuenta personal o Wise |
| **2-3 clientes** | Necesitás algo formal | Monotributo para mientras conseguís asesor |
| **5+ clientes o primer cliente que pide factura** | Escala mínima | Constituir SRL Uruguay o consultar con contador especializado en tech |
| **Self-serve / Stripe** | Crecimiento | LLC Delaware vía Stripe Atlas |

---

## 2. Gestión de accesos: cómo manejar el ciclo de vida sin Stripe

### El problema

Sin Stripe, no hay webhook que te avise que alguien pagó o que venció. Necesitás un proceso manual asistido por lógica interna.

### Propuesta: tabla `subscriptions` en la DB

```sql
CREATE TABLE subscriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    plan            TEXT NOT NULL,   -- 'base' | 'pro' | 'studio'
    status          TEXT NOT NULL DEFAULT 'active',
    -- 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled'
    billing_cycle   TEXT NOT NULL DEFAULT 'monthly',  -- 'monthly' | 'annual'
    price_usd       NUMERIC(10,2) NOT NULL,
    current_period_start  DATE NOT NULL,
    current_period_end    DATE NOT NULL,
    -- add-ons
    postventa_projects    INT DEFAULT 0,  -- proyectos en modo postventa activos
    notes           TEXT,              -- notas internas del cobro
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Flujo manual con soporte de la DB

```
Día 0:   Cliente acepta plan → INSERT subscription (status='active', period_end = hoy + 30d)
Día 28:  Cron job diario detecta period_end en 2 días → notificación interna (email/Telegram a vos)
Día 30:  Vos confirmás el pago recibido → UPDATE subscription SET period_start=hoy, period_end=hoy+30d
Día 30+: Si no pagó → UPDATE status='past_due'
Día 35:  Si sigue sin pagar → UPDATE status='suspended' → acceso bloqueado automáticamente
```

### Lógica de acceso en el backend

El middleware de auth chequea el status de la subscription:

```python
# En verify_token o en un middleware de org
sub = await pool.fetchrow(
    "SELECT status, current_period_end FROM subscriptions WHERE organization_id = $1",
    org_id
)
if sub and sub['status'] in ('suspended', 'cancelled'):
    raise HTTPException(402, "Suscripción inactiva. Contactá a soporte.")
if sub and sub['current_period_end'] < date.today():
    # Auto-pasar a past_due si venció y no se renovó
    await pool.execute(
        "UPDATE subscriptions SET status='past_due' WHERE organization_id=$1", org_id
    )
```

### Panel de administración de cobros

Una tab "Cobros" en `/admin/usuarios` (ya existe como hub de admin) que muestre:
- Tabla de todas las orgs con su plan, status, fecha de vencimiento, monto
- Botón "Marcar como pagado" → renueva el período
- Botón "Suspender acceso"
- Badge de alerta cuando hay orgs en `past_due`

Esto te da control total sin depender de Stripe. Llevás el libro de cuentas vos con soporte de la DB.

---

## 3. Proceso de cobro recomendado hoy

### Canal de pago
**Wise** (wise.com) — la mejor opción para recibir USD del exterior sin restricciones cambiarias argentinas:
- Cuenta en USD a nombre personal
- El cliente hace una transferencia internacional a tu cuenta Wise
- Vos recibís USD reales, los guardás en Wise o los transferís cuando querés

Alternativa: **Payoneer** (similar a Wise, más usado en LatAm).

### Comunicación del cobro
Mientras no tenés entidad formal:
- Confirmación por email con detalle del plan, monto, período cubierto
- Recibo informal (PDF generado por vos) indicando: organización, plan, período, monto en USD
- Cuando tengas monotributo/entidad: factura formal en reemplazo del recibo

---

## 4. Lo que falta implementar (roadmap técnico)

| Prioridad | Feature | Esfuerzo |
|---|---|---|
| **Alta** | Tabla `subscriptions` + cron de alertas de vencimiento | 1 día |
| **Alta** | Tab "Cobros" en panel admin con gestión manual | 2 días |
| **Alta** | Middleware que bloquea acceso a orgs suspendidas | 0.5 días |
| **Media** | Integración Stripe (cuando haya entidad y +5 clientes) | 1-2 semanas |
| **Baja** | Self-serve onboarding con pago automático | 2-3 semanas |

---

## 5. Preguntas abiertas

- [ ] ¿Consultar con contador especializado en tech/SaaS para la mejor estrategia fiscal?
- [ ] ¿Cuándo abrís Wise/Payoneer?
- [ ] ¿Primer cliente cuándo? ¿Necesitará factura?
- [ ] ¿Uruguay SRL o esperar a LLC Delaware?
