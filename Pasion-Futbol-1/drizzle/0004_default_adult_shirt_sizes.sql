UPDATE products
SET sizes = '["S","M","L","XL"]'
WHERE json_array_length(sizes) = 0
  AND NOT EXISTS (SELECT 1 FROM json_each(products.categories) WHERE lower(trim(value)) = 'niños')
  AND id IN (
    'arsenal-odegaard-roja',
    'arsenal-saka-azul',
    'barcelona-pedri-cruz',
    'barcelona-pedri-turquesa',
    'barcelona-retro-cuello',
    'barcelona-rodrigo-azul',
    'bayern-kane-blanca',
    'boca-paredes-rayas',
    'chelsea-caicedo-azul',
    'chelsea-palmer-negra',
    'city-haaland-celeste-g5',
    'city-haaland-negra',
    'inter-miami-messi-gris',
    'jamaica-marley-negra'
  );
