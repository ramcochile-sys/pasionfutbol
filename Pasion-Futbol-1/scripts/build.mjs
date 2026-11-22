import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";

const files = {};
for (const name of await readdir("storefront")) {
  if (/\.(webp|jpg|svg|png|woff2)$/.test(name)) {
    files["/" + name] = {
      type: {"svg":"image/svg+xml","jpg":"image/jpeg","webp":"image/webp","png":"image/png","woff2":"font/woff2"}[name.split(".").at(-1)],
      data: await readFile("storefront/" + name, "base64")
    };
  }
}
const read = path => readFile(path, "utf8");
const pricing = await read("shared/order-pricing.js");
const shipping = "const chileCommunes = " + JSON.stringify(JSON.parse(await read("shared/chile-communes.json"))) + ";\n" + await read("shared/shipping.js");
const constants = {
  ebook: await readFile("worker/Pasion_Futbol_Noviembre_2026.pdf", "base64"),
  assets: files,
  initialProducts: JSON.parse(await read("storefront/products.json")),
  storefront: (await read("storefront/index.html")).replace("/* ORDER_PRICING */", () => pricing + "\n" + shipping),
  admin: await read("worker/admin.html"),
  login: await read("worker/login.html")
};
await mkdir("dist/server", {recursive:true});
const declarations = Object.entries(constants).map(([name, value]) =>
  `const ${name} = ${JSON.stringify(value)};`).join("\n");
await writeFile("dist/server/index.js", declarations + "\n" + pricing + "\n" + shipping + "\n" + await read("worker/index.js"));
