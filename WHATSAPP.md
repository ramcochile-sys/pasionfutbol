# Asistente de WhatsApp

El asistente responde solo los mensajes de WhatsApp de la tienda. Usa la API oficial de Meta (WhatsApp Cloud API) y Claude.

**Qué hace**
- Conversa en tono cercano, como una persona del equipo, con mensajes cortos. Si el cliente escribe varios mensajes seguidos, espera unos segundos y contesta todo junto.
- Conoce el catálogo real de la tienda (precios, tallas) y manda el link directo de cada camiseta (`/?producto=<id>`), que abre su ficha para comprar.
- Cotiza envíos por comuna con las tarifas de la tienda, y responde sobre pagos, descuentos, plazos, cambios y devoluciones.
- Consulta un pedido por su número (PF…) sin mostrar datos personales.
- Mira las fotos que manda el cliente y le dice si tenemos esa camiseta.
- **Pasa a humano** cuando hay reclamos, cambios, problemas con pagos o envíos, piden una persona o no sabe la respuesta. En ese chat deja de responder por 12 horas y llega un correo a `PEDIDOS_CORREO_PARA`.
- Si le preguntan en serio si es un bot, no miente: dice que es el asistente virtual y ofrece que lo atienda una persona.

**Panel:** `https://pasionfutbol.lat/admin/whatsapp` (con la sesión de admin). Muestra las conversaciones, marca las que necesitan una persona y permite responder desde ahí y reactivar o pausar el asistente en cada chat.

## Configuración (una vez)

### 1. Número y app en Meta
1. Crea una cuenta en [Meta for Developers](https://developers.facebook.com) y una app de tipo **Empresa**. Agrégale el producto **WhatsApp**.
2. En **WhatsApp → Configuración de la API**, agrega el número de la tienda y verifícalo por SMS o llamada.
   - El número no puede estar usándose en la app de WhatsApp normal. Si es el número actual de la tienda (+56 9 3497 4132), hay que borrar esa cuenta de la app primero. Así se pierde el historial de chats, pero no los contactos.
   - Otra opción es la **coexistencia**, que deja seguir usando la app WhatsApp Business en el celular. Se activa con el registro integrado de Meta (Embedded Signup) o con un proveedor oficial (BSP), según lo que Meta ofrezca para tu cuenta. Si está activa y alguien del equipo responde desde la app, el asistente se pausa solo en ese chat.
3. Verifica el negocio en el **Business Manager** (Configuración del negocio → Centro de seguridad) para sacar el límite de conversaciones de prueba.
4. Crea un **usuario del sistema** (Business Manager → Usuarios → Usuarios del sistema) con rol administrador. Asígnale la app y la cuenta de WhatsApp, y genera un **token permanente** con los permisos `whatsapp_business_messaging` y `whatsapp_business_management`.

### 2. Variables en Vercel
En **Settings → Environment Variables** del proyecto:

| Variable | De dónde sale |
|---|---|
| `ANTHROPIC_API_KEY` | [platform.claude.com](https://platform.claude.com) → API keys. Carga saldo en Billing. |
| `WHATSAPP_TOKEN` | El token permanente del paso 1.4 |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp → Configuración de la API → "Identificador del número de teléfono" |
| `WHATSAPP_APP_SECRET` | Configuración de la app → Básica → Clave secreta de la app |
| `WHATSAPP_VERIFY_TOKEN` | Un texto largo que inventes, por ejemplo `pasion-futbol-8f3k2` |
| `WHATSAPP_BOT_ACTIVO` | Opcional. `0` apaga las respuestas automáticas: los mensajes se guardan igual en el panel |
| `WHATSAPP_PAUSA_HORAS` | Opcional. Horas que el asistente queda en pausa al pasar un chat a una persona (12 por defecto) |

Para los correos de aviso se usan las mismas variables de Resend de los pedidos: `RESEND_API_KEY`, `PEDIDOS_CORREO_DE` y `PEDIDOS_CORREO_PARA`.

Después de guardarlas, haz **Redeploy**.

### 3. Webhook en Meta
1. En la app: **WhatsApp → Configuración → Webhook → Editar**.
2. URL de devolución de llamada: `https://pasionfutbol.lat/whatsapp/webhook`
3. Token de verificación: el mismo `WHATSAPP_VERIFY_TOKEN`.
4. Suscríbete al campo **messages** (y a **smb_message_echoes** si usas coexistencia).

### 4. Probar
Escribe al número desde otro celular. Deberías ver "escribiendo…" y la respuesta en unos segundos. La conversación aparece en `/admin/whatsapp`.

## Costos aproximados
- **Meta:** las respuestas a mensajes que inicia el cliente no se cobran dentro de las 24 horas siguientes al último mensaje del cliente.
- **Claude** (modelo Claude Opus 5.5): unos pocos pesos por respuesta. El catálogo queda en caché, así que los mensajes seguidos salen más baratos. El uso se ve en platform.claude.com → Usage.

## Detalles técnicos
- Código: `lib/whatsapp-bot.js`. Las rutas `/whatsapp/webhook` y `/admin/whatsapp` se atienden en `api/index.js`. El worker expone `botCatalog`, `botOrder`, `botShippingQuote` y `botIsAdmin`, que solo leen datos.
- Cada aviso de Meta se valida con la firma `X-Hub-Signature-256`. Los mensajes repetidos se ignoran por su id.
- Las tablas `whatsapp_messages` y `whatsapp_contacts` se crean solas en Turso la primera vez.
- Las instrucciones y los datos de la tienda que usa el asistente están en la constante `INSTRUCTIONS` de `lib/whatsapp-bot.js`. Si cambian los envíos, los pagos o las políticas, actualízalas ahí.
