export function crearProductoNuevo(carta, categoriaId, id) {
  const categoria = carta.categorias.find((item) => item.id === categoriaId) || carta.categorias[0];
  if (!categoria) throw new Error('La carta no tiene una categoría disponible.');
  if (carta.categorias.some((item) => item.productos.some((producto) => producto.id === id))) {
    throw new Error(`El ID ${id} ya existe.`);
  }

  const producto = {
    id,
    numero: null,
    nombre: { es: 'Nuevo producto', en: '' },
    desc: { es: '', en: '' },
    precio: 0,
    foto: '',
    etiquetas: [],
    visible: false,
    disponible: true,
  };
  categoria.productos.push(producto);
  return { categoria, producto };
}

export function quitarProductoNuevo(carta, idsNuevos, productoId) {
  if (!idsNuevos.has(productoId)) return { quitado: false, siguienteId: null };

  for (const categoria of carta.categorias) {
    const indice = categoria.productos.findIndex((producto) => producto.id === productoId);
    if (indice < 0) continue;
    const [producto] = categoria.productos.splice(indice, 1);
    idsNuevos.delete(productoId);
    const siguiente = categoria.productos[indice]
      || categoria.productos[indice - 1]
      || carta.categorias.flatMap((item) => item.productos)[0]
      || null;
    return { quitado: true, producto, categoria, siguienteId: siguiente?.id || null };
  }

  idsNuevos.delete(productoId);
  return { quitado: false, siguienteId: null };
}

export function prepararCartaParaPublicar(carta) {
  return JSON.parse(JSON.stringify(carta));
}

export function marcarProductoAgotado(producto, agotado) {
  producto.disponible = !agotado;
  return producto;
}

export function marcarProductoVisible(producto, visible) {
  producto.visible = visible;
  return producto;
}

export function activarOfertaProducto(producto, activa) {
  producto.oferta ||= { activa: false, precio: null, texto: { es: '', en: '' } };
  producto.oferta.activa = activa;
  return producto;
}
