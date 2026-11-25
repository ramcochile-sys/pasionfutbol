UPDATE products
SET price = 19990
WHERE EXISTS (
  SELECT 1 FROM json_each(products.categories)
  WHERE lower(trim(value)) IN ('poleras', 'camisetas')
);
