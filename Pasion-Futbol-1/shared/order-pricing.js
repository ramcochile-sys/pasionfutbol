function isShirt(item) {
  return item.categories.some(category => ["poleras", "camisetas"].includes(category.trim().toLowerCase()));
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
