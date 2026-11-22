const shippingCarriers = {
  "blue-express": {
    id: "blue-express",
    name: "Blue Express",
    eta: "Santiago: 1 a 2 días hábiles · Regiones: 1 a 7 días hábiles",
    rates: {
      metropolitan: [3100, 4200, 4800, 5400],
      center: [4300, 5600, 7300, 9200],
      extreme: [5200, 9500, 14500, 17000]
    }
  },
  starken: {
    id: "starken",
    name: "Starken",
    eta: "Santiago: 1 a 3 días hábiles · Regiones: 2 a 6 días hábiles",
    rates: {
      metropolitan: [3400, 4500, 5200, 6100],
      center: [4500, 5900, 7700, 9600],
      extreme: [5600, 9900, 14900, 17800]
    }
  },
  "correos-chile": {
    id: "correos-chile",
    name: "Correos de Chile",
    eta: "Santiago: 2 a 3 días hábiles · Regiones: 2 a 8 días hábiles",
    rates: {
      metropolitan: [2990, 3990, 4690, 5290],
      center: [4100, 5400, 6900, 8800],
      extreme: [4990, 8990, 13900, 16500]
    }
  }
};

function shippingQuote(items, region, commune, carrierId = "blue-express") {
  const area = Object.hasOwn(chileCommunes, region) ? chileCommunes[region] : null;
  if (!area || !Object.hasOwn(area.communes, commune)) return null;
  const carrier = Object.hasOwn(shippingCarriers, carrierId) ? shippingCarriers[carrierId] : null;
  if (!carrier) return null;

  // Peso del pedido: cada prenda (según su tipo) más la bolsa de cartón de 60 g.
  let packedGrams = 0;
  for (const item of items) packedGrams += item.quantity * itemWeightGrams(item);
  if (packedGrams) packedGrams += PACKAGING_GRAMS;
  const size = [1000, 3000, 6000, 20000].findIndex(max => packedGrams <= max);
  if (!packedGrams || size < 0 || ["05104", "05201", "10402"].includes(commune)) return null;
  const zone = region === "13" ? "metropolitan"
    : ["01", "02", "11", "12", "15"].includes(region) ? "extreme" : "center";
  return {
    carrierId: carrier.id,
    carrier: carrier.name,
    eta: carrier.eta,
    size: ["XS", "S", "M", "L"][size],
    // Región Metropolitana: envío gratis. Resto del país: tarifa de la empresa según zona y tramo de peso.
    price: region === "13" ? 0 : carrier.rates[zone][size],
    weightGrams: packedGrams,
    commune: area.communes[commune],
    region: area.name
  };
}

function allShippingQuotes(items, region, commune) {
  const result = {};
  for (const id of Object.keys(shippingCarriers)) {
    const quote = shippingQuote(items, region, commune, id);
    if (!quote) return null;
    result[id] = quote;
  }
  return result;
}

