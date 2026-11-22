// Adaptador "estilo Cloudflare R2" sobre Vercel Blob PRIVADO.
// Recibe el módulo @vercel/blob (put, get, list, del) para poder probarlo sin red.
// Los pedidos guardan datos personales de clientes: el store debe crearse como PRIVATE.

function toBody(value) {
  if (typeof value === "string") return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

export function createR2(blob) {
  return {
    async put(key, value, options = {}) {
      await blob.put(key, toBody(value), {
        access: "private",
        allowOverwrite: true,
        addRandomSuffix: false,
        contentType: options.httpMetadata?.contentType
      });
    },

    async get(key) {
      let result;
      try {
        // Los registros de pedidos (con "/") se reescriben: se leen sin caché para ver la última versión.
        // Las fotos (UUID sin "/") nunca cambian, así que pueden usar caché.
        result = await blob.get(key, { access: "private", useCache: !key.includes("/") });
      } catch (error) {
        if (error?.name === "BlobNotFoundError") return null;
        throw error;
      }
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      const read = () => new Response(result.stream);
      return {
        body: result.stream,
        httpMetadata: { contentType: result.blob?.contentType || "application/octet-stream" },
        json: async () => JSON.parse(await read().text()),
        text: async () => read().text(),
        arrayBuffer: async () => read().arrayBuffer()
      };
    },

    async delete(key) {
      const { blobs } = await blob.list({ prefix: key, limit: 5 });
      const exact = blobs.find(item => item.pathname === key);
      if (exact) await blob.del(exact.url);
    },

    async list({ prefix = "", limit = 1000, cursor } = {}) {
      const page = await blob.list({ prefix, limit, cursor });
      return {
        objects: page.blobs.map(item => ({ key: item.pathname })),
        truncated: Boolean(page.hasMore),
        cursor: page.cursor
      };
    }
  };
}
