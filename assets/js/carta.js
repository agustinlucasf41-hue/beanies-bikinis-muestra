/* Pintado de la carta: categorías, buscador, filtro de vegetariano y estados.
   No sabe nada de navegación ni de horarios: solo de productos. */

(function () {
  const RUTA_DIBUJOS = 'assets/img/carta/';
  const SELLOS = ['destacado', 'vegetariano', 'picante', 'nuevo'];

  let carta = null;
  let alAnadir = () => {};

  const estado = { idioma: 'es', categoria: 'todo', busqueda: '', soloVeg: false };

  const dinero = (n) => `${carta.moneda}${n.toLocaleString('es-CL')}`;

  /* Quita tildes para que "champinon" encuentre "champiñón". */
  const normalizar = (s) =>
    (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  function coincide(producto, aguja) {
    if (!aguja) return true;
    const heno = normalizar(
      [producto.nombre.es, producto.nombre.en, producto.desc?.es, producto.desc?.en, producto.numero].join(' ')
    );
    // Cada palabra por separado: "pizza camaron" encuentra la Camarona.
    return aguja.split(/\s+/).filter(Boolean).every((palabra) => heno.includes(palabra));
  }

  function elemento(etiqueta, clase, texto) {
    const el = document.createElement(etiqueta);
    if (clase) el.className = clase;
    if (texto != null) el.textContent = texto;
    return el;
  }

  function pintarProducto(producto) {
    const li = elemento('li', 'producto');
    if (!producto.disponible) li.classList.add('agotado');

    // Dibujo, o la inicial del nombre mientras no lo haya.
    const caja = elemento('div', 'producto-dibujo');
    if (producto.foto) {
      const img = new Image();
      img.src = RUTA_DIBUJOS + producto.foto;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      // Si el dibujo aún no existe, se cae con elegancia a la inicial.
      img.addEventListener('error', () => {
        caja.replaceChildren(elemento('span', 'inicial', producto.nombre.es.charAt(0)));
      });
      caja.append(img);
    } else {
      caja.append(elemento('span', 'inicial', producto.nombre.es.charAt(0)));
    }
    li.append(caja);

    const cuerpo = elemento('div', 'producto-cuerpo');

    const nombre = elemento('p', 'producto-nombre');
    if (producto.numero) nombre.append(elemento('span', 'producto-num', producto.numero));
    nombre.append(document.createTextNode(producto.nombre[estado.idioma] || producto.nombre.es));

    for (const etiqueta of producto.etiquetas || []) {
      if (!SELLOS.includes(etiqueta)) continue;
      nombre.append(elemento('span', `sello sello-${etiqueta}`, window.t(`sello.${etiqueta}`, estado.idioma)));
    }
    if (!producto.disponible) {
      nombre.append(elemento('span', 'sello sello-agotado', window.t('sello.agotado', estado.idioma)));
    }
    cuerpo.append(nombre);

    const desc = producto.desc?.[estado.idioma] || producto.desc?.es;
    if (desc) cuerpo.append(elemento('p', 'producto-desc', desc));
    li.append(cuerpo);

    const derecha = elemento('div', 'producto-derecha');
    derecha.append(elemento('span', 'producto-precio', dinero(producto.precio)));

    if (window.Carta.cestaActiva && producto.disponible) {
      const boton = elemento('button', 'anadir', '+');
      boton.type = 'button';
      boton.setAttribute(
        'aria-label',
        `${window.t('carta.anadirA', estado.idioma)} ${producto.nombre[estado.idioma] || producto.nombre.es}`
      );
      boton.addEventListener('click', () => alAnadir(producto));
      derecha.append(boton);
    }
    li.append(derecha);

    return li;
  }

  function pintarGrupo(categoria, productos) {
    const seccion = elemento('section', 'grupo');

    const cabecera = elemento('div', 'grupo-cabecera');
    cabecera.append(elemento('h3', null, categoria.nombre[estado.idioma] || categoria.nombre.es));
    const palabra = window.t(productos.length === 1 ? 'carta.producto' : 'carta.productos', estado.idioma);
    cabecera.append(elemento('span', 'cuenta', `${productos.length} ${palabra}`));
    seccion.append(cabecera);

    const nota = categoria.nota?.[estado.idioma] || categoria.nota?.es;
    if (nota) seccion.append(elemento('p', 'grupo-nota', nota));

    const lista = elemento('ul', 'lista');
    for (const producto of productos) lista.append(pintarProducto(producto));
    seccion.append(lista);

    return seccion;
  }

  function pintarFiltros(contenedor) {
    contenedor.replaceChildren();

    const boton = (clave, texto, activo, extra) => {
      const b = elemento('button', `pestana${extra ? ' ' + extra : ''}`, texto);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(activo));
      b.dataset.filtro = clave;
      return b;
    };

    contenedor.append(boton('todo', window.t('carta.todo', estado.idioma), estado.categoria === 'todo'));
    for (const cat of carta.categorias) {
      contenedor.append(
        boton(cat.id, cat.nombre[estado.idioma] || cat.nombre.es, estado.categoria === cat.id)
      );
    }

    contenedor.append(elemento('span', 'separador-filtros'));
    contenedor.append(boton('veg', window.t('carta.soloVeg', estado.idioma), estado.soloVeg, 'veg'));
  }

  /* El listener va una sola vez sobre el contenedor, no en cada render:
     si se reenganchara al repintar, un clic acabaría contando dos veces. */
  function escucharFiltros(contenedor) {
    contenedor.addEventListener('click', (e) => {
      const b = e.target.closest('[data-filtro]');
      if (!b) return;
      if (b.dataset.filtro === 'veg') estado.soloVeg = !estado.soloVeg;
      else estado.categoria = b.dataset.filtro;
      Carta.render();
    });
  }

  const Carta = {
    cestaActiva: false,

    iniciar(datos, opciones = {}) {
      carta = datos;
      alAnadir = opciones.alAnadir || alAnadir;
      Carta.cestaActiva = Boolean(opciones.cestaActiva);
      escucharFiltros(document.getElementById('filtros'));
    },

    estado,

    render() {
      pintarFiltros(document.getElementById('filtros'));

      const aguja = normalizar(estado.busqueda.trim());
      const destino = document.getElementById('resultados');
      const trozos = [];
      let total = 0;

      for (const cat of carta.categorias) {
        if (estado.categoria !== 'todo' && estado.categoria !== cat.id) continue;
        const productos = cat.productos.filter(
          (p) =>
            coincide(p, aguja) &&
            (!estado.soloVeg || (p.etiquetas || []).includes('vegetariano'))
        );
        if (!productos.length) continue;
        total += productos.length;
        trozos.push(pintarGrupo(cat, productos));
      }

      if (!total) {
        const vacio = elemento('div', 'sin-resultados');
        vacio.append(elemento('b', null, window.t('carta.sinResultadosTitulo', estado.idioma)));
        vacio.append(elemento('span', null, window.t('carta.sinResultadosTexto', estado.idioma)));
        trozos.push(vacio);
      }

      destino.replaceChildren(...trozos);
    },
  };

  window.Carta = Carta;
})();
