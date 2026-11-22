# Pasión Fútbol

Tienda de demostración basada en la estructura de [BadReason](https://github.com/RamonMansilla/BadReason.cl).
Incluye catálogo, búsqueda, categorías, fichas, selección de talla en la grilla, bolsa local y resumen de pedido de prueba.

## Ejecutar

Abre `index.html` en el navegador o ejecuta `python3 -m http.server 8000` en este directorio y entra a `http://localhost:8000`.
La tienda es estática y no requiere instalar dependencias.

## Editar el catálogo

En `index.html`, modifica la lista `products` con tallas, nombres, precios en CLP y rutas a las imágenes.
Las fotos generadas, las tallas y los precios incluidos son de muestra. Sustitúyelos por los datos del inventario.

El botón **Simular pedido** confirma una prueba local. Antes de vender, integra disponibilidad real,
envíos, persistencia de pedidos y la pasarela de pagos de la tienda.
