// Puente entre una función de Vercel (export default { fetch }) y el worker.
// - Construye el entorno (DB, BUCKET, secretos) una sola vez y lo reutiliza.
// - El worker limita intentos de login por IP leyendo "cf-connecting-ip" (Cloudflare).
//   En Vercel ese encabezado no existe, así que se fija desde la IP que informa Vercel
//   y se descarta cualquier valor enviado por el cliente (no se puede falsificar).

export function createHandler({ worker, getEnv }) {
  return {
    async fetch(request) {
      let env;
      try {
        env = getEnv();
      } catch (error) {
        return new Response(error.message, {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
        });
      }

      const headers = new Headers(request.headers);
      const ip = (headers.get("x-vercel-forwarded-for") || headers.get("x-real-ip") || headers.get("x-forwarded-for") || "")
        .split(",")[0].trim();
      headers.delete("cf-connecting-ip");
      if (ip) headers.set("cf-connecting-ip", ip);

      const hasBody = request.method !== "GET" && request.method !== "HEAD";
      const forwarded = new Request(request.url, {
        method: request.method,
        headers,
        body: hasBody ? request.body : undefined,
        duplex: "half"
      });
      return worker.fetch(forwarded, env);
    }
  };
}
