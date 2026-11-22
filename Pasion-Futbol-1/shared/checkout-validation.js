// Validación de los datos de contacto y envío. La usan la tienda (mensajes en vivo)
// y el servidor (para no confiar en el navegador): una sola regla para ambos.

// Dominios mal escritos frecuentes → dominio correcto.
const EMAIL_DOMAIN_TYPOS = {
  "gmial.com": "gmail.com", "gmal.com": "gmail.com", "gmai.com": "gmail.com", "gamil.com": "gmail.com",
  "gmail.co": "gmail.com", "gmail.con": "gmail.com", "gmail.cm": "gmail.com", "gmail.om": "gmail.com",
  "gmaill.com": "gmail.com", "gnail.com": "gmail.com", "gmail.cl": "gmail.com", "gmali.com": "gmail.com",
  "gmail.comm": "gmail.com", "gmail.es": "gmail.com", "gemail.com": "gmail.com",
  "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotmal.com": "hotmail.com",
  "hotmil.com": "hotmail.com", "hotmail.co": "hotmail.com", "hotmail.con": "hotmail.com",
  "hotamil.com": "hotmail.com", "homail.com": "hotmail.com", "hotmaill.com": "hotmail.com",
  "outlok.com": "outlook.com", "outloo.com": "outlook.com", "outlook.co": "outlook.com",
  "outlook.con": "outlook.com", "otlook.com": "outlook.com",
  "yahooo.com": "yahoo.com", "yaho.com": "yahoo.com", "yahoo.co": "yahoo.com", "yahoo.con": "yahoo.com",
  "iclod.com": "icloud.com", "icloud.co": "icloud.com", "icloud.con": "icloud.com", "icoud.com": "icloud.com",
  "live.co": "live.com", "live.con": "live.com"
};

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

// Devuelve {error, suggestion}. Sin error = correo válido.
function checkEmail(value) {
  const email = normalizeEmail(value);
  if (!email) return {error: "Ingresa tu correo: ahí te llega el comprobante."};
  if (email.length > 254 || /\s/.test(email)) return {error: "El correo no puede tener espacios."};
  const at = email.lastIndexOf("@");
  if (at < 1 || email.indexOf("@") !== at) return {error: "Falta la @. Ejemplo: nombre@gmail.com"};
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (/^\.|\.$|\.\./.test(local)) return {error: "El correo no puede empezar ni terminar con punto, ni tener dos puntos seguidos."};
  if (!/^[a-z0-9._%+-]+$/.test(local) || local.length > 64) {
    return {error: "Revisa lo que va antes de la @: usa solo letras, números, puntos, guiones o +."};
  }
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) || !/^[a-z]{2,}$/.test(labels.at(-1))) {
    return {error: "Revisa lo que va después de la @. Ejemplo: nombre@gmail.com"};
  }
  if (Object.hasOwn(EMAIL_DOMAIN_TYPOS, domain)) {
    const suggestion = local + "@" + EMAIL_DOMAIN_TYPOS[domain];
    return {error: `¿Quisiste decir ${suggestion}?`, suggestion};
  }
  // Gmail no permite cuentas de menos de 6 caracteres (sin contar puntos ni lo que va tras el +).
  if (domain === "gmail.com" || domain === "googlemail.com") {
    const user = local.split("+")[0].replaceAll(".", "");
    if (!/^[a-z0-9]{6,30}$/.test(user)) {
      return {error: "Ese correo de Gmail no existe: las cuentas tienen entre 6 y 30 letras o números antes de @gmail.com."};
    }
  }
  return {};
}

function normalizeName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function checkName(value) {
  const name = normalizeName(value);
  if (!name) return {error: "Ingresa tu nombre y apellido."};
  if (/\d/.test(name)) return {error: "El nombre no puede tener números."};
  if (!/^[\p{L}][\p{L}' .-]*$/u.test(name)) return {error: "Usa solo letras en tu nombre."};
  if (name.length > 80) return {error: "El nombre es demasiado largo (máximo 80 caracteres)."};
  const words = name.split(" ").filter(word => /\p{L}{2,}/u.test(word));
  if (words.length < 2) return {error: "Escribe tu nombre y apellido: así sabrán a quién entregar el pedido."};
  return {};
}

// Teléfonos chilenos: 9 dígitos (celular 9XXXXXXXX o fijo con código de área), con o sin +56.
function phoneDigits(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("56")) digits = digits.slice(2);
  return digits;
}

function checkPhone(value) {
  const digits = phoneDigits(value);
  if (/[^\d\s+()-]/.test(String(value ?? "").trim())) return {error: "El teléfono solo puede tener números."};
  if (!digits) return {error: "Ingresa un teléfono para coordinar la entrega."};
  if (digits.length === 8) return {error: "Falta un dígito: los celulares tienen 9 números y empiezan con 9 (ej: 9 1234 5678)."};
  if (digits.length !== 9 || !/^[2-9]/.test(digits)) return {error: "Ingresa un teléfono chileno de 9 dígitos. Ejemplo: 9 1234 5678"};
  if (/^(\d)\1{8}$/.test(digits)) return {error: "Ese teléfono no parece real. Revísalo."};
  return {};
}

function formatPhone(value) {
  const digits = phoneDigits(value);
  if (digits.length !== 9) return String(value ?? "").trim();
  return `+56 ${digits[0]} ${digits.slice(1, 5)} ${digits.slice(5)}`;
}

function normalizeAddress(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function checkAddress(value) {
  const address = normalizeAddress(value);
  if (!address) return {error: "Ingresa la calle y el número."};
  if (address.length < 5) return {error: "La dirección es muy corta. Ejemplo: Av. Providencia 1234"};
  if (address.length > 120) return {error: "La dirección es demasiado larga (máximo 120 caracteres)."};
  if (!/\p{L}{2,}/u.test(address)) return {error: "Falta el nombre de la calle."};
  if (!/\d/.test(address) && !/\bs\/?n\b/i.test(address)) return {error: "Falta el número de la casa o edificio (o escribe S/N si no tiene)."};
  return {};
}

function checkReference(value) {
  return String(value ?? "").trim().length > 100 ? {error: "La referencia puede tener hasta 100 caracteres."} : {};
}

// Revisa todos los campos y devuelve {errors: {campo: mensaje}, clean: {...normalizados}}.
function checkShippingContact(data) {
  const errors = {};
  for (const [field, check] of [["name", checkName], ["email", checkEmail], ["phone", checkPhone], ["address", checkAddress], ["address-extra", checkReference]]) {
    const {error} = check(data?.[field]);
    if (error) errors[field] = error;
  }
  return {
    errors,
    clean: {
      name: normalizeName(data?.name),
      email: normalizeEmail(data?.email),
      phone: formatPhone(data?.phone),
      address: normalizeAddress(data?.address)
    }
  };
}
