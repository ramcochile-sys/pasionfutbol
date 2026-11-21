const shippingRates = {
  metropolitan: [3100, 4200, 4800, 5400],
  center: [4300, 5600, 7300, 9200],
  extreme: [5200, 9500, 14500, 17000]
};

function shippingQuote(items, region, commune) {
  const area = Object.hasOwn(chileCommunes, region) ? chileCommunes[region] : null;
  if (!area || !Object.hasOwn(area.communes, commune)) return null;

  // Provisional packed volume: 2,000 cm³ per shirt, 4,000 cm³ per other garment.
  let packedGrams = 0;
  let shirts = 0;
  for (const item of items) {
    const shirt = isShirt(item);
    packedGrams += item.quantity * (shirt ? 500 : 1000);
    if (shirt) shirts += item.quantity;
  }
  const size = [500, 3000, 6000, 20000].findIndex(max => packedGrams <= max);
  if (!packedGrams || size < 0 || ["05104", "05201", "10402"].includes(commune)) return null;
  const zone = region === "13" ? "metropolitan"
    : ["01", "02", "11", "12", "15"].includes(region) ? "extreme" : "center";
  return {carrier:"Blue Express", size:["XS","S","M","L"][size], price:shirts >= 2 ? 0 : shippingRates[zone][size],
    commune:area.communes[commune], region:area.name};
}
