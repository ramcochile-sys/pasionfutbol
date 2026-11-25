function isShirt(item) {
  return Array.isArray(item.categories) && item.categories.some(category => ["poleras", "camisetas"].includes(category.trim().toLowerCase()));
}

// Peso aproximado de cada prenda ya empacada, en gramos.
const PACKAGING_GRAMS = 60; // bolsa de cartón del pedido
function itemWeightGrams(item) {
  const name = String(item.name || "").toLowerCase();
  const kids = (item.categories || []).some(category => category.trim().toLowerCase() === "niños") || name.includes("niño");
  if (/chaqueta|casaca|parka|cortaviento/.test(name)) return 450;
  if (name.includes("manga larga")) return kids ? 160 : 230;
  if (isShirt(item)) return kids ? 130 : 180;
  return 300;
}

// Packs de diciembre: 2 camisetas $24.990, 3 por $36.990 y 4 por $44.990, hasta el 31 de diciembre de 2026.
// Se cobra la combinación más barata de packs y precios individuales; el envío no entra.
const SHIRT_PACKS = [[2, 24990], [3, 36990], [4, 44990]];
function promotionActive(now = Date.now()) {
  return now < Date.parse("2027-01-01T00:00:00-03:00");
}

function orderPricing(items, now = Date.now()) {
  let subtotal = 0;
  const prices = [];
  for (const item of items) {
    subtotal += item.price * item.quantity;
    if (isShirt(item)) for (let i = 0; i < item.quantity; i++) prices.push(item.price);
  }
  if (!promotionActive(now)) return {subtotal, percent: 0, discount: 0, amount: subtotal};
  prices.sort((a, b) => a - b);
  const best = [0];
  for (let i = 1; i <= prices.length; i++) {
    best[i] = best[i - 1] + prices[i - 1];
    for (const [count, price] of SHIRT_PACKS) if (i >= count) best[i] = Math.min(best[i], best[i - count] + price);
  }
  const eligibleSubtotal = prices.reduce((sum, price) => sum + price, 0);
  const discount = eligibleSubtotal - best[prices.length];
  return {subtotal, percent: eligibleSubtotal ? Math.round(discount * 100 / eligibleSubtotal) : 0, discount, amount: subtotal - discount};
}
