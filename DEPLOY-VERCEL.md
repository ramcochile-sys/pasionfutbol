# Despliegue en Vercel

El worker se ejecuta como función de Vercel (`api/index.js`). La base de datos es **Turso** (SQLite, compatible con el SQL del proyecto) y los archivos van a **Vercel Blob privado**.

## 1. Dependencias (una vez, en tu computador)

```bash
npm install @libsql/client @vercel/blob
git add package.json package-lock.json && git commit -m "Agrega dependencias para Vercel"
```

## 2. Crear el proyecto y el almacenamiento

1. En vercel.com: **Add New → Project** e importa `ramcochile-sys/pasionfutbol`. No cambies el preset ("Other"); `vercel.json` ya define el build.
2. En el proyecto, pestaña **Storage**:
   - **Turso** (Marketplace): conéctalo. Crea solo `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`.
   - **Blob**: créalo con acceso **Private**. No se puede cambiar después, y los pedidos guardan datos personales de clientes.
3. En **Settings → Environment Variables** agrega:

| Variable | Valor |
|---|---|
| `CATALOG_SETUP_CODE` | Secreto largo y aleatorio (mínimo 12 caracteres) |
| `TBK_API_KEY_ID`, `TBK_API_KEY_SECRET` | Credenciales de Transbank |
| `GOOGLE_MAPS_API_KEY` | Clave de Google Maps |
| `ADMIN_COOKIE_EMBEDDED` | Solo si el panel va dentro de un iframe: `1` |

## 3. Crear las tablas (una vez)

```bash
npm i -g vercel
vercel link
vercel env pull .env.local
node --env-file=.env.local scripts/migrate-turso.mjs
```

Es seguro repetirlo: cada migración se aplica una sola vez. Los archivos `.env*` están en `.gitignore`.

## 4. Desplegar y crear los administradores

Haz push a `main` (o `vercel --prod`). Entra a `https://TU-DOMINIO/admin`, escribe el `CATALOG_SETUP_CODE` y crea hasta 2 administradores. Después puedes borrar `CATALOG_SETUP_CODE`.

## Notas

- **Fotos:** las funciones de Vercel aceptan cuerpos de hasta 4,5 MB; el límite de 4 MB por foto del panel cabe justo.
- **Pagos:** el código usa el ambiente de integración de Transbank (`webpay3gint`) y marca los pedidos como `paid_test`. Para vender de verdad hay que cambiar a producción en `worker/index.js`.
- **Desarrollo local:** `npm start` sigue usando bases simuladas en memoria (se pierden al reiniciar).
