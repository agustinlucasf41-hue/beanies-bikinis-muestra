/* La cesta.
   Hoy el bar no reparte a domicilio, así que arranca en modo "lista": suma y
   calcula, pero no promete un envío que no existe. Toda la maquinaria de contar
   está hecha, de modo que encender el reparto sea cambiar una palabra en
   datos/negocio.json — no volver a programar nada.

   Modos: off | lista | whatsapp | delivery  */

(function () {
  const CLAVE = 'bb.pedido.v1';

  let lineas = cargar();
  const oyentes = [];

  function cargar() {
    try {
      const bruto = localStorage.getItem(CLAVE);
      const datos = bruto ? JSON.parse(bruto) : [];
      return Array.isArray(datos) ? datos.filter((l) => l && l.id && l.cantidad > 0) : [];
    } catch {
      return [];
    }
  }

  function guardar() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(lineas));
    } catch {
      /* Modo incógnito o almacenamiento lleno: la cesta sigue viva en memoria. */
    }
    oyentes.forEach((fn) => fn());
  }

  const Pedido = {
    anadir(producto) {
      const linea = lineas.find((l) => l.id === producto.id);
      if (linea) linea.cantidad++;
      else lineas.push({ id: producto.id, cantidad: 1, precio: producto.precio, nombre: producto.nombre });
      guardar();
    },

    quitar(id) {
      const i = lineas.findIndex((l) => l.id === id);
      if (i === -1) return;
      if (lineas[i].cantidad > 1) lineas[i].cantidad--;
      else lineas.splice(i, 1);
      guardar();
    },

    vaciar() {
      lineas = [];
      guardar();
    },

    obtener() {
      return lineas.map((l) => ({ ...l }));
    },

    cantidadDe(id) {
      return lineas.find((l) => l.id === id)?.cantidad ?? 0;
    },

    contar() {
      return lineas.reduce((n, l) => n + l.cantidad, 0);
    },

    total() {
      return lineas.reduce((n, l) => n + l.precio * l.cantidad, 0);
    },

    suscribir(fn) {
      oyentes.push(fn);
      return fn;
    },

    /* Arma el mensaje de texto del pedido. Lo usa el modo whatsapp y lo usará
       el de delivery cuando llegue. */
    comoTexto(idioma, moneda) {
      const dinero = (n) => `${moneda}${n.toLocaleString('es-CL')}`;
      const cabecera = window.t('cesta.mensajeCabecera', idioma);
      const cuerpo = lineas
        .map((l) => `· ${l.cantidad}x ${l.nombre[idioma] || l.nombre.es} — ${dinero(l.precio * l.cantidad)}`)
        .join('\n');
      const pie = `${window.t('cesta.mensajeTotal', idioma)}: ${dinero(Pedido.total())}`;
      return `${cabecera}\n\n${cuerpo}\n\n${pie}`;
    },

    /* Qué se puede hacer con la cesta según el modo configurado. */
    capacidades(config) {
      const modo = config?.modo ?? 'off';
      return {
        modo,
        activa: modo !== 'off',
        // El botón de acción solo aparece si hay a dónde mandar el pedido.
        tieneAccion: (modo === 'whatsapp' || modo === 'delivery') && Boolean(config?.whatsapp),
        claveBoton: modo === 'delivery' ? 'cesta.pedir' : 'cesta.enviar',
      };
    },
  };

  window.Pedido = Pedido;
})();
