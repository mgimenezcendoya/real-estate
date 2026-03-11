# WhatsApp Providers — Guía Consolidada

> Referencia completa de proveedores WhatsApp soportados por Realia: comparativa, requisitos, pros/contras y pasos de conexión para cada uno.

---

## Resumen comparativo

| | Twilio | Meta Cloud API | YCloud | Kapso |
|---|---|---|---|---|
| **Uso recomendado** | Dev / sandbox | Producción directa | Producción alternativa | Producción — onboarding masivo |
| **Fricción de onboarding** | Alta (aprobación Meta 1-3 días) | Alta (Meta Business Manager) | Media | Muy baja (~2 min) |
| **Credenciales por cliente** | Account SID + Auth Token | Access Token + Phone Number ID | API Key | Ninguna — plataforma gestiona todo |
| **Número propio del cliente** | Sí | Sí | Sí | Sí (coexistence) o nuevo (dedicado) |
| **Cuenta Meta requerida** | Sí (vía Twilio) | Sí (directa) | Sí | No |
| **Meta Business Verification** | Sí | Sí | Sí | No |
| **Costo adicional** | Twilio por mensaje | Solo Meta | YCloud por mensaje | Kapso (plataforma) |
| **Velocidad mensajes** | Media | Alta | Alta | 5 msg/s (coexistence) / 1000 msg/s (dedicado) |
| **Estado en Realia** | ✅ implementado | ✅ implementado | ✅ implementado | ✅ implementado (Mar 2026) |

---

## Twilio WhatsApp Sandbox

### Qué es
Twilio actúa como intermediario entre Realia y la API de WhatsApp de Meta. Cada organización puede tener una subcuenta de Twilio aislada.

### Cuándo usarlo
- Desarrollo y testing local
- Clientes que ya tienen cuenta Twilio
- Como fallback cuando Meta directo no está disponible

### Pros
- Fácil de testear localmente (sandbox compartido)
- API bien documentada
- Soporte 24/7

### Contras
- Requiere aprobación de Meta para cada WhatsApp Sender (1-3 días hábiles, puede rechazar)
- Costo por mensaje adicional (Twilio cobra encima de Meta)
- El cliente queda dependiente de Twilio (no portabilidad directa)
- Requiere que el cliente tenga o cree cuenta Twilio
- No escala bien para onboarding masivo de clientes

### Requisitos del cliente
1. Número de teléfono propio (E.164, ej: `+5491112345678`)
2. Número NO puede estar activo en WhatsApp personal ni WhatsApp Business app
3. Cuenta de Twilio (puede ser creada por Realia como subaccount)
4. Paciencia: aprobación de Meta puede tardar 1-3 días hábiles

### Credenciales necesarias en Realia
- `account_sid` — ID de la cuenta Twilio (ej: `ACxxxxxxx`)
- `auth_token` — Token de autenticación Twilio
- `phone_number` — Número en E.164

### Pasos de conexión (manual via admin)
1. Crear subaccount en Twilio (o usar cuenta propia del cliente)
2. Registrar WhatsApp Sender en el subaccount con el número del cliente
3. Esperar aprobación de Meta (1-3 días)
4. En Realia `/admin/usuarios` → tab Canales → "Nuevo canal" → provider: Twilio
5. Ingresar Account SID, Auth Token, número

---

## Meta WhatsApp Cloud API (directo)

### Qué es
Integración directa con la API oficial de Meta, sin intermediarios. El cliente gestiona sus propias credenciales de Meta y las ingresa en Realia.

### Cuándo usarlo
- Clientes con cuenta Meta Business ya configurada (ej: usan Facebook Ads activamente)
- Máximo control y menor costo por mensaje
- Cuando se quiere evitar depender de un proveedor intermedio (Twilio, Kapso)

### Pros
- Sin costo de intermediario
- API oficial de Meta — mejor SLA
- Acceso a todas las features (templates, flows, etc.)

### Contras
- Configuración técnica compleja (access tokens, phone_number_id, WABA) — requiere alguien técnico
- Access tokens expiran — requiere renovación periódica si no se usa System User Token
- Sin verificación de empresa: límite de 1.000 conversaciones **outbound** únicas por día (inbound sin límite — ver detalle en sección de pasos)
- Con verificación: el proceso puede tardar días o semanas y requiere documentación

---

### Proceso sin verificación de empresa (acceso básico)

**Límites sin verificación:**
- **Inbound (el cliente escribe primero):** sin límite — podés recibir y responder mensajes de cualquier cantidad de usuarios dentro de la ventana de 24 horas. Para una inmobiliaria que opera principalmente respondiendo consultas entrantes, este límite no aplica.
- **Outbound (el negocio escribe primero, usando plantillas):** hasta **1.000 conversaciones únicas por día** (Tier 1 de Meta). Aplica solo cuando se inicia el contacto sin que el cliente haya escrito antes — por ejemplo, campañas de seguimiento o notificaciones masivas.

**Lo que necesita el cliente antes de empezar:**
- Cuenta personal de **Facebook** activa
- Número de teléfono **libre** (no activo en WhatsApp personal ni Business app)
- Nombre del negocio
- Acceso a un desarrollador o persona técnica que configure las credenciales en Realia

**Pasos:**

**1 — Crear cuenta en Meta Business Manager**

1. Ir a [business.facebook.com](https://business.facebook.com) desde un navegador de escritorio (recomendado)
2. Hacer click en **"Crear cuenta"**
3. Ingresar:
   - Nombre del negocio (ej: `Inmobiliaria García`)
   - Tu nombre completo
   - Email de negocio
4. Seguir los pasos de confirmación por email
5. La cuenta queda creada — sin documentación, sin aprobación

**2 — Crear una app de Meta**

1. Ir a [developers.facebook.com](https://developers.facebook.com) → **"Mis apps"** → **"Crear app"**
2. Seleccionar tipo: **"Empresa"** (Business)
3. Ingresar nombre de la app (ej: `Realia - Inmobiliaria García`) y email de contacto
4. Asociar la app al portafolio comercial creado en el paso anterior
5. Click en **"Crear app"**

**3 — Activar WhatsApp en la app**

1. Dentro de la app recién creada, ir al panel de productos → buscar **"WhatsApp"** → click en **"Configurar"**
2. Seleccionar (o confirmar) la cuenta de Meta Business asociada
3. Meta crea automáticamente una **WhatsApp Business Account (WABA)** — anotar el ID que aparece en pantalla
4. En la sección **"Números de teléfono"** → click en **"Agregar número de teléfono"**
5. Completar:
   - Nombre visible (ej: `Inmobiliaria García`)
   - Categoría del negocio
   - El número de teléfono en formato internacional (ej: `+5491112345678`)
6. Verificar el número: recibir código por SMS o llamada e ingresarlo

**4 — Generar un System User Token (token permanente)**

> ⚠️ **No usar el "token de prueba"** que aparece en el panel de Meta — expira a las 24 horas. Hay que generar un System User Token que no expira.

1. En Meta Business Manager → **"Configuración del negocio"** (ícono de tuerca) → **"Usuarios"** → **"Usuarios del sistema"**
2. Click en **"Agregar"** → nombre (ej: `Realia Bot`) → rol: **Empleado**
3. Click en **"Agregar activos"** → seleccionar la app creada → asignar rol **"Administrador"**
4. Click en **"Generar token"** → seleccionar la app → marcar los permisos:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
5. Click en **"Generar token"** → **copiar y guardar el token en un lugar seguro** — Meta no lo vuelve a mostrar
6. Anotar también el **Phone Number ID**: está en la app de Meta → WhatsApp → Configuración de API → sección "From"

**5 — Configurar en Realia**

1. Ingresar a Realia con usuario **superadmin** → ir a `/admin/usuarios`
2. Tab **"Canales"** → **"Nuevo canal"** → provider: `meta`
3. Completar los campos:
   - **Access Token:** el System User Token generado en el paso anterior
   - **Phone Number ID:** el ID numérico del número (ej: `123456789012345`)
   - **Verify Token:** inventar una cadena aleatoria (ej: `realia_garcia_2024`) — se usará para verificar el webhook
4. Guardar el canal

**6 — Configurar el webhook en Meta**

1. En la app de Meta → **"WhatsApp"** → **"Configuración"** → sección **"Webhooks"**
2. Click en **"Configurar"** o **"Editar"**
3. **URL de devolución de llamada:** `https://realia-production-318c.up.railway.app/webhook`
4. **Token de verificación:** el mismo Verify Token ingresado en Realia
5. Click en **"Verificar y guardar"** — Meta hace un GET a la URL para confirmar
6. Una vez verificado, suscribirse a los eventos: marcar **`messages`**
7. Click en **"Guardar"**

El canal queda activo. Los mensajes entrantes llegarán a Realia en tiempo real.

---

### Proceso con verificación de empresa (acceso completo)

La verificación desbloquea:
- Mensajes salientes ilimitados (plantillas de marketing, notificaciones)
- Mayor límite de conversaciones por mes
- Acceso a número de teléfono de alta calidad

**Cuándo conviene hacerla:** cuando el cliente ya tiene el canal funcionando y necesita escalar, o si tiene muchos mensajes salientes desde el inicio.

**Documentación que Meta solicita (varía por país):**

Meta puede pedir una combinación de:
- Certificado de constitución o acta de inscripción de la empresa
- Documento fiscal (CUIT/CUIL para Argentina, RFC para México, etc.)
- Dominio web verificado (Meta envía un código al email del dominio o pide agregar un meta-tag en el sitio)
- Número de teléfono del negocio (puede ser el mismo que se conecta)

**Pasos:**

1. En Meta Business Manager → **"Configuración del negocio"** → **"Centro de seguridad"**
2. En la sección **"Verificación del negocio"** → click en **"Iniciar verificación"**
3. Seleccionar el país y completar los datos de la empresa
4. Subir los documentos que Meta solicite (PDF o imagen clara)
5. Verificar el dominio web si Meta lo pide:
   - Opción A: agregar un `<meta>` tag en el `<head>` del sitio web
   - Opción B: verificar el email del dominio (ej: `admin@inmobiliaria.com`)
6. Enviar y esperar la revisión de Meta

**Tiempo estimado:** 2 días a 3 semanas — depende del país, la claridad de los documentos y la carga de revisión de Meta. Meta envía notificaciones por email con el estado.

> ℹ️ Durante la espera, el canal ya puede estar funcionando con el límite de acceso básico. No hace falta esperar la verificación para empezar a operar.

---

## YCloud

### Qué es
Plataforma de mensajería que incluye WhatsApp Cloud API, similar a Meta directo pero con su propia capa de gestión.

### Cuándo usarlo
- Alternativa a Meta directo para ciertos mercados
- Cuando el cliente ya tiene cuenta YCloud

### Pros
- Media firma HMAC-SHA256 para verificación de webhooks
- URLs de media directas en el webhook (sin segundo request)

### Contras
- Menor adopción que Meta o Twilio
- Misma fricción de onboarding que Meta (requiere WABA)
- **Nota técnica:** el CHECK constraint de la DB originalmente no incluía 'ycloud' — corregido en Migration 029

### Credenciales necesarias en Realia
- `ycloud_api_key` — API key de la cuenta YCloud
- `waba_id` — ID de la WhatsApp Business Account
- `phone_number` — Número en E.164

### Pasos de conexión
1. Crear cuenta en YCloud
2. Conectar WABA (WhatsApp Business Account) a YCloud
3. Obtener API Key desde el dashboard de YCloud
4. En Realia, crear TenantChannel con provider: `ycloud`
5. Configurar webhook en YCloud apuntando a `https://realia-production-318c.up.railway.app/webhook`

---

## Kapso ⭐ Recomendado para escalar

### Qué es
Plataforma que actúa como capa gestionada sobre Meta WhatsApp Cloud API. Realia tiene una sola `KAPSO_API_KEY` de plataforma — los clientes conectan sus números sin dar credenciales a Realia.

### Cuándo usarlo
- **Siempre que sea posible** — es el proveedor objetivo para el onboarding masivo de clientes
- Clientes sin conocimiento técnico
- Cuando se quiere el menor tiempo de activación posible

### Pros
- ✅ **Onboarding en ~2 minutos** — el cliente no necesita configurar nada técnico
- ✅ Sin **verificación formal de empresa con Meta** (el proceso con documentación que tarda días/semanas)
- ✅ Sin credenciales del cliente almacenadas en Realia (Kapso las gestiona)
- ✅ Una sola API key de plataforma cubre todos los clientes
- ✅ Embedded login — el cliente completa el flujo dentro del panel de Realia
- ✅ Soporta coexistence (número actual del cliente) o número dedicado nuevo

### Contras
- Costo de plataforma Kapso (adicional a Meta)
- Dependencia de un proveedor adicional (Kapso)
- Sandbox solo soporta webhooks en formato Kapso (no Meta nativo)

---

### Tipos de conexión disponibles para el cliente

#### Opción A — Conectar app WhatsApp Business (Coexistence)
El número del cliente opera **simultáneamente** en la app y en la API de Realia.

- ✅ Usa el número que el cliente ya tiene
- ✅ El vendedor puede seguir usando la app manualmente
- ✅ El bot responde automáticamente en paralelo
- ✅ La lógica de handoff de Realia evita conflictos bot/humano
- Límite: 5 mensajes/segundo
- **Requiere:** app WhatsApp Business (≠ WhatsApp personal)

#### Opción B — Número dedicado
El número queda exclusivamente para la API, sin acceso desde la app.

- ✅ Mayor velocidad: hasta 1000 mensajes/segundo
- ✅ Separación total entre bot y atención humana
- Puede ser un número nuevo provisto por Kapso o uno existente migrado
- **Requiere:** número libre (no activo en ninguna app de WhatsApp)

---

### Requisitos del cliente para conectar vía Kapso

**Para Opción A (Coexistence) — lo que el cliente necesita tener antes de empezar:**
1. **App WhatsApp Business** instalada en el celular con el número que quiere conectar
   - Es la app con ícono verde y una "B" — distinta a WhatsApp normal
   - Se descarga gratis desde App Store o Google Play buscando "WhatsApp Business"
   - ⚠️ WhatsApp personal (la app común) **no funciona** con la API — el número debe estar en WhatsApp Business
2. **Cuenta de Facebook** personal activa (puede ser la del dueño, un socio, o cualquier persona de la empresa — no tiene que ser una cuenta "de empresa")
3. El **nombre del negocio** tal como quieren que aparezca

**Para Opción B1 (número nuevo de Kapso):** solo necesita Facebook y nombre del negocio — Kapso provee el número.

**Para Opción B2 (número propio migrado):** igual que A, pero el número **no puede tener WhatsApp activo** (ni personal ni Business). Ver instrucciones de preparación en la sección B2 más abajo.

---

### Qué es el "portafolio comercial" y cómo se crea

El **portafolio comercial** es simplemente una cuenta de Meta Business Manager — el sistema de Meta para gestionar activos de negocio (páginas de Facebook, cuentas de WhatsApp, etc.). Es gratuito.

**No es necesario crearlo antes de empezar.** El flujo de Kapso incluye la creación como un paso integrado. Así se ve:

1. Después de iniciar sesión con Facebook, aparece una pantalla: **"Seleccionar portafolio comercial"**
2. Si el cliente ya tiene uno (porque usa Facebook Ads, por ejemplo): lo ve listado y lo selecciona — listo.
3. Si **no tiene ninguno** (caso más frecuente en inmobiliarias sin marketing digital):
   - Hace click en **"Crear nuevo portafolio"** o el ícono "+"
   - Aparece un formulario corto:
     - **Nombre del negocio** (obligatorio) — ej: `Inmobiliaria García`
     - **Tu nombre** — generalmente viene pre-completado desde el perfil de Facebook
     - **Email de negocio** — puede usar el mismo email de Facebook, no necesita uno corporativo
   - Hace click en **Continuar** o **Crear**
   - El portafolio se crea **instantáneamente** — no hay aprobación, no hay documentos, no hay espera
4. El flujo avanza automáticamente al siguiente paso

> ℹ️ Meta puede ofrecer, después de esta creación, iniciar un proceso de "Verificación de empresa" para acceder a límites de mensajes más altos. Esto es **completamente opcional** y no es necesario para empezar a operar con Realia.

---

### Pasos de conexión del cliente (Opción A — Coexistence)

**Antes de empezar:** tener WhatsApp Business instalado con el número a conectar, y tener acceso a la cuenta de Facebook.

1. El admin de la organización entra a Realia → **Configuración** (ícono enchufe en sidebar)
2. Tab **"Canales WhatsApp"** → click en **"Conectar con Kapso"**
3. Se abre una **nueva pestaña** con el flujo de Kapso — no cerrarla
4. Seleccionar la opción **"Conectar la app de WhatsApp Business"**
5. Aparece una ventana emergente de Facebook → **iniciar sesión** con usuario y contraseña de Facebook
   - Si el navegador ya tiene la sesión guardada, puede que no pida credenciales
6. Aparece la pantalla de selección de **portafolio comercial**:
   - Si ya tiene uno: seleccionarlo de la lista
   - Si no tiene ninguno: crear uno nuevo (ver sección anterior "Qué es el portafolio comercial")
7. Seleccionar la **cuenta de WhatsApp Business** asociada al número — generalmente aparece pre-cargada con el nombre del negocio
8. Confirmar el **número de teléfono** que se quiere conectar
9. Elegir el método de **verificación del número**: SMS o llamada telefónica
10. Ingresar el **código de verificación** recibido en el campo que aparece en pantalla
11. Confirmar los permisos que solicita Meta (acceso a mensajes, etc.) → click en **"Aceptar"** o **"Continuar"**
12. La pestaña de Kapso se cierra automáticamente y Realia detecta el número conectado
13. El canal aparece como **activo** (badge verde con el número) en la pantalla de Configuración

**Tiempo total:** 3-7 minutos.

> ⚠️ Si la pestaña de Kapso se cierra pero Realia no muestra el canal activo, refrescar la página de Configuración manualmente. Si el problema persiste, contactar soporte.

---

### Pasos de conexión del cliente (Opción B — Número dedicado)

#### B1 — Número nuevo provisto por Kapso

**Antes de empezar:** tener acceso a la cuenta de Facebook. No se necesita un número propio.

1. El admin entra a Realia → **Configuración** → Tab **"Canales WhatsApp"** → click en **"Conectar con Kapso"**
2. Se abre una nueva pestaña con el flujo de Kapso
3. Seleccionar la opción de **número dedicado** o "nuevo número"
4. Iniciar sesión con **Facebook** (ventana emergente)
5. Seleccionar o crear el **portafolio comercial** (ver sección anterior)
6. Kapso asigna automáticamente un número de teléfono nuevo a la cuenta
7. La pestaña se cierra y Realia detecta el canal activo

**Tiempo total:** 3-5 minutos. No hay verificación de número porque Kapso lo provee.

---

#### B2 — Número propio migrado (sin app activa)

> ⚠️ **IMPORTANTE — leer antes de empezar:** migrar un número a la API lo desvincula permanentemente de cualquier app de WhatsApp. Después de este proceso, el número **no podrá usarse en WhatsApp personal ni WhatsApp Business app**. Solo funcionará a través de Realia. Confirmar con el cliente que entiende esto antes de continuar.

**Paso previo obligatorio — liberar el número:**

Si el número tiene WhatsApp activo (personal o Business), hay que eliminarlo primero:

- **En WhatsApp Business:**
  Abrir la app → Tocar los tres puntos (⋮) arriba a la derecha → **Configuración** → **Cuenta** → **Eliminar mi cuenta** → ingresar el número → confirmar

- **En WhatsApp personal:**
  Abrir la app → **Configuración** (ícono de tuerca) → **Cuenta** → **Eliminar mi cuenta** → ingresar el número → confirmar

Esperar 2-3 minutos después de eliminar antes de continuar. Meta necesita ese tiempo para liberar el número.

**Pasos de conexión:**

1. El admin entra a Realia → **Configuración** → Tab **"Canales WhatsApp"** → click en **"Conectar con Kapso"**
2. Se abre una nueva pestaña con el flujo de Kapso
3. Seleccionar la opción de **número propio / número existente**
4. Iniciar sesión con **Facebook** (ventana emergente)
5. Seleccionar o crear el **portafolio comercial** (ver sección anterior)
6. Ingresar el número de teléfono en formato internacional (ej: `+5491112345678`)
   - Incluir el código de país (`+54` para Argentina) y el código de área sin el 0 inicial
7. Elegir el método de **verificación**: SMS o llamada telefónica al número
8. Ingresar el **código de verificación** recibido
9. Confirmar los permisos de Meta → click en **"Aceptar"**
10. La pestaña se cierra y Realia detecta el canal activo

**Tiempo total:** 5-10 minutos (sin contar el paso previo de liberar el número).

> ℹ️ Si la verificación falla ("número en uso" o similar), esperar 5-10 minutos y volver a intentar — Meta puede tardar en liberar el número después de eliminarlo.

---

### Arquitectura técnica de Kapso en Realia

```
Cliente → /configuracion → "Conectar con Kapso"
    │
    ▼
POST /admin/kapso/setup-link
    │── Crea/recupera customer en Kapso (org_id como external_customer_id)
    │── Llama POST /platform/v1/customers/{id}/setup_links
    │── success_redirect_url: https://realia.up.railway.app/configuracion
    │
    ▼
Kapso hosted onboarding (nueva pestaña)
    │── Cliente conecta WhatsApp Business
    │── Kapso guarda credenciales Meta internamente
    │
    ▼
Redirect a /configuracion?phone_number_id=xxx&display_phone_number=+yyy
    │
    ▼
Frontend llama POST /admin/kapso/connect
    │── Registra TenantChannel en DB (provider='kapso', phone_number_id)
    │── Sin access_token — Kapso gestiona internamente
    │
    ▼
Canal activo — mensajes entrantes llegan a POST /webhook/kapso
    │── Kapso reenvía en formato Meta
    │── Agente IA procesa y responde via Kapso API (X-API-Key)
```

### Webhooks configurados en Kapso

| Tipo | URL | Evento |
|---|---|---|
| WhatsApp webhooks | `https://realia-production-318c.up.railway.app/webhook/kapso` | Message received |
| Project webhooks | `https://realia-production-318c.up.railway.app/admin/kapso/webhook/onboarding` | WhatsApp Phone Number Created |

---

## Comparativa de fricción de onboarding

| | Twilio | Meta directo | YCloud | Kapso |
|---|---|---|---|---|
| ¿Necesita Meta Business Manager? | ✅ sí (pre-configurado) | ✅ sí (pre-configurado) | ✅ sí (pre-configurado) | ⚠️ se crea en el flujo (~2 min) |
| ¿Necesita verificar empresa con Meta? | ✅ sí (días) | ✅ sí (semanas) | ✅ sí | ❌ no |
| ¿Configuración técnica? | Alta | Alta | Alta | Ninguna |
| ¿El cliente guarda credenciales en Realia? | Sí | Sí | Sí | No |
| Tiempo hasta primer mensaje | 1-3 días | días/semanas | días | ~2 minutos |
| Conocimiento técnico requerido del cliente | Alto | Alto | Alto | Ninguno |

---

## Decisión de arquitectura

**Proveedor por defecto para nuevos clientes: Kapso.**

Los proveedores Twilio, Meta y YCloud se mantienen para:
- Clientes existentes que ya los tienen configurados
- Casos donde el cliente tiene infraestructura Meta propia
- Desarrollo y testing local (Twilio sandbox)

La tabla `tenant_channels` soporta múltiples proveedores por organización — una org puede tener un canal Kapso y un canal Meta simultáneamente.
