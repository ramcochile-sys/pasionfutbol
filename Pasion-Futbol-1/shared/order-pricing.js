function isShirt(item) {
  return item.categories.some(category => ["poleras", "camisetas"].includes(category.trim().toLowerCase()));
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

function orderPricing(items) {
  let subtotal = 0;
  let eligibleSubtotal = 0;
  let shirts = 0;
  for (const item of items) {
    const lineTotal = item.price * item.quantity;
    subtotal += lineTotal;
    if (isShirt(item)) {
      eligibleSubtotal += lineTotal;
      shirts += item.quantity;
    }
  }
  const percent = shirts >= 3 ? 25 : shirts === 2 ? 20 : 0;
  const discount = Math.round(eligibleSubtotal * percent / 100);
  return {subtotal, percent, discount, amount: subtotal - discount};
}
