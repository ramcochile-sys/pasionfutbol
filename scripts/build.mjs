import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";

const types = {
  svg: "image/svg+xml",
  jpg: "image/jpeg",
  webp: "image/webp",
  png: "image/png",
  woff2: "font/woff2"
};

// Las imágenes y fuentes se publican como archivos estáticos en public/
// (las sirve la CDN de Vercel, rápido y con caché). El servidor solo
// recuerda su nombre y tipo, sin cargar el contenido en memoria.
await mkdir("public", { recursive: true });
const files = {};
for (const name of await readdir("storefront")) {
  if (/\.(webp|jpg|svg|png|woff2)$/.test(name)) {
    files["/" + name] = { type: types[name.split(".").at(-1)], data: "" };
    await copyFile("storefront/" + name, "public/" + name);
  }
}

const read = path => readFile(path, "utf8");
const pricing = await read("Pasion-Futbol-1/shared/order-pricing.js");
const shipping =
  "const chileCommunes = " +
  JSON.stringify(JSON.parse(await read("Pasion-Futbol-1/shared/chile-communes.json"))) +
  ";\n" +
  (await read("Pasion-Futbol-1/shared/shipping.js")) +
  "\n" +
  (await read("Pasion-Futbol-1/shared/checkout-validation.js"));

const constants = {
  ebook: await readFile("Pasion-Futbol-1/worker/Revista_Pasion_Futbol.pdf", "base64"),
  revista: await read("Pasion-Futbol-1/worker/revista.html"),
  assets: files,
  initialProducts: JSON.parse(await read("storefront/products.json")),
  storefront: (await read("storefront/index.html")).replace(
    "/* ORDER_PRICING */",
    () => pricing + "\n" + shipping
  ),
  admin: await read("Pasion-Futbol-1/worker/admin.html"),
  login: await read("Pasion-Futbol-1/worker/login.html")
};

await mkdir("dist/server", { recursive: true });
const declarations = Object.entries(constants)
  .map(([name, value]) => `const ${name} = ${JSON.stringify(value)};`)
  .join("\n");

await writeFile(
  "dist/server/index.js",
  declarations + "\n" + pricing + "\n" + shipping + "\n" + (await read("Pasion-Futbol-1/worker/pages.js")) + "\n" + (await read("Pasion-Futbol-1/worker/index.js"))
);
