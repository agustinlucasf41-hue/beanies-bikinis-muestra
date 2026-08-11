/* Arranque: carga los datos, aplica el idioma, calcula si está abierto
   y engancha la cesta. No sabe pintar productos: de eso va carta.js. */

(function () {
  const CLAVE_IDIOMA = 'bb.idioma.v1';

  let negocio = null;
  let carta = null;
  let capacidades = null;
  let idioma = localStorage.getItem(CLAVE_IDIOMA) === 'en' ? 'en' : 'es';

  const $ = (sel) => document.querySelector(sel);
  const dinero = (n) => `${carta.moneda}${n.toLocaleString('es-CL')}`;

  /* ---------- Idioma ---------- */

  function aplicarTextos() {
    document.documentElement.lang = idioma;

    for (const el of document.querySelectorAll('[data-t]')) {
      // Los textos son nuestros y algunos llevan <em> o <span>, por eso innerHTML.
      el.innerHTML = window.t(el.dataset.t, idioma);
    }
    for (const el of document.querySelectorAll('[data-t-attr]')) {
      const [attr, clave] = el.dataset.tAttr.split(':');
      el.setAttribute(attr, window.t(clave, idioma));
    }
    for (const b of document.querySelectorAll('[data-idioma]')) {
      b.setAttribute('aria-pressed', String(b.dataset.idioma === idioma));
    }
  }

  function cambiarIdioma(nuevo) {
    if (nuevo === idioma) return;
    idioma = nuevo;
    localStorage.setItem(CLAVE_IDIOMA, idioma);
    window.Carta.estado.idioma = idioma;
    aplicarTextos();
    pintarNegocio();
    pintarEspecialidades();
    window.Carta.render();
    pintarCesta();
  }

  /* ---------- ¿Está abierto ahora? ---------- */

  function minutosEn(zona) {
    const partes = new Intl.DateTimeFormat('en-GB', {
      timeZone: zona, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date()).split(':');
    return Number(partes[0]) * 60 + Number(partes[1]);
  }

  function aMinutos(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  function estaAbierto() {
    const a = negocio.apertura;
    if (!a?.abre || !a?.cierra) return null;

    let ahora;
    try {
      ahora = minutosEn(a.zona || 'America/Santiago');
    } catch {
      return null; // Navegador sin husos horarios: mejor no decir nada que mentir.
    }

    const abre = aMinutos(a.abre);
    const cierra = aMinutos(a.cierra);
    // El horario cruza la medianoche (17:00 → 03:00), así que son dos tramos.
    return cierra <= abre ? ahora >= abre || ahora < cierra : ahora >= abre && ahora < cierra;
  }

  function pintarEstado() {
    const abierto = estaAbierto();
    const caja = $('#estado');
    if (abierto === null) { caja.hidden = true; return; }

    caja.hidden = false;
    caja.classList.toggle('abierto', abierto);
    caja.classList.toggle('cerrado', !abierto);

    const texto = caja.querySelector('.estado-texto');
    texto.replaceChildren();
    const fuerte = document.createElement('b');
    fuerte.textContent = window.t(abierto ? 'estado.abierto' : 'estado.cerrado', idioma);
    texto.append(fuerte);
    if (!abierto) {
      texto.append(` · ${window.t('estado.abreA', idioma)} ${negocio.apertura.abre}`);
    }
  }

  /* ---------- Datos del negocio ---------- */

  function bloqueDato(clave, valorNodo) {
    const div = document.createElement('div');
    div.className = 'dato';
    const et = document.createElement('p');
    et.className = 'etiqueta';
    et.textContent = window.t(clave, idioma);
    const val = document.createElement('p');
    val.className = 'valor';
    val.append(valorNodo);
    div.append(et, val);
    return div;
  }

  function enlace(href, texto) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = texto;
    return a;
  }

  function urlMapa() {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(negocio.direccion)}`;
  }

  function pintarNegocio() {
    // Promo
    const promo = $('#promo');
    if (negocio.promo?.activa) {
      promo.hidden = false;
      const texto = negocio.promo.texto[idioma] || negocio.promo.texto.es;
      const [principal, ...resto] = texto.split('·');
      $('#promo-texto').replaceChildren(principal.trim());
      if (resto.length) {
        const small = document.createElement('small');
        small.textContent = resto.join('·').trim();
        $('#promo-texto').append(small);
      }
    } else {
      promo.hidden = true;
    }

    // Dónde y cuándo
    for (const a of document.querySelectorAll('#enlace-mapa, #enlace-mapa-2')) a.href = urlMapa();
    $('#datos').replaceChildren(
      bloqueDato('donde.direccion', enlace(urlMapa(), negocio.direccion)),
      bloqueDato('donde.horario', negocio.horario[idioma] || negocio.horario.es),
      bloqueDato('donde.telefono', enlace(`tel:${negocio.telefono}`, negocio.telefono)),
      bloqueDato('donde.email', enlace(`mailto:${negocio.email}`, negocio.email))
    );

    // Música
    const idLista = (negocio.redes?.spotify || '').match(/playlist\/([A-Za-z0-9]+)/)?.[1];
    const caja = $('#spotify');
    if (idLista) {
      caja.hidden = false;
      $('#spotify-iframe').src = `https://open.spotify.com/embed/playlist/${idLista}?theme=0`;
      const m = negocio.musica?.texto;
      $('#musica-texto').textContent = m ? (m[idioma] || m.es) : '';
    } else {
      caja.hidden = true;
    }

    // Redes
    const nombres = { instagram: 'Instagram', facebook: 'Facebook', tripadvisor: 'Tripadvisor', spotify: 'Spotify' };
    const redes = $('#redes');
    redes.replaceChildren();
    for (const [clave, url] of Object.entries(negocio.redes || {})) {
      if (!url) continue;
      const a = enlace(url, nombres[clave] || clave);
      a.target = '_blank';
      a.rel = 'noopener';
      redes.append(a);
    }

    $('#pie-texto').textContent =
      `${negocio.nombre} · ${negocio.direccion} · ${window.t('pie.aviso', idioma)}`;

    pintarEstado();
  }

  /* Los datos duros de las especialidades salen de la carta, no de un texto suelto:
     si mañana cambia un precio en el JSON, aquí cambia solo. */
  function pintarEspecialidades() {
    const barra = carta.categorias.find((c) => c.id === 'barra-beanies');
    if (barra?.productos.length) {
      const precios = new Set(barra.productos.map((p) => p.precio));
      const cuantos = barra.productos.length;
      $('#dato-barra').textContent =
        precios.size === 1
          ? `${cuantos} ${window.t('especial.cocteles', idioma)} ${dinero([...precios][0])}`
          : `${cuantos} ${window.t('carta.productos', idioma)}`;
    }

    const ski = carta.categorias
      .flatMap((c) => c.productos)
      .find((p) => p.id === 'ski-shot-5');
    if (ski) {
      $('#dato-ski').textContent = `${dinero(ski.precio)} · ${window.t('especial.paraLaMesa', idioma)}`;
    }
  }

  /* ---------- Navegación ---------- */

  function engancharNav() {
    const nav = $('#nav');
    const marcarSolida = () => nav.classList.toggle('solida', window.scrollY > 24);
    marcarSolida();
    window.addEventListener('scroll', marcarSolida, { passive: true });

    // El enlace activo se deduce de la sección visible, sin librerías.
    const enlaces = [...document.querySelectorAll('.nav-enlaces a')];
    const secciones = enlaces
      .map((a) => document.querySelector(a.getAttribute('href')))
      .filter(Boolean);

    if (!secciones.length || !('IntersectionObserver' in window)) return;

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue;
          for (const a of enlaces) {
            a.toggleAttribute('aria-current', a.getAttribute('href') === `#${e.target.id}`);
          }
        }
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );
    secciones.forEach((s) => observador.observe(s));
  }

  function engancharMenuMovil() {
    const panel = $('#menu-movil');
    const abrir = $('#abrir-menu');
    const cerrar = $('#cerrar-menu');

    const alternar = (abierto) => {
      panel.dataset.abierto = String(abierto);
      abrir.setAttribute('aria-expanded', String(abierto));
      document.body.style.overflow = abierto ? 'hidden' : '';
      if (abierto) cerrar.focus();
      else abrir.focus();
    };

    abrir.addEventListener('click', () => alternar(true));
    cerrar.addEventListener('click', () => alternar(false));

    // Al elegir destino, el panel se quita de en medio.
    for (const a of panel.querySelectorAll('a')) {
      a.addEventListener('click', () => alternar(false));
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panel.dataset.abierto === 'true') alternar(false);
    });
  }

  /* Ficha para Google: horario y dirección salen en los resultados de búsqueda. */
  function datosEstructurados() {
    const ficha = {
      '@context': 'https://schema.org',
      '@type': 'BarOrPub',
      name: negocio.nombre,
      description: negocio.descripcion?.es,
      address: { '@type': 'PostalAddress', streetAddress: negocio.direccion, addressCountry: 'CL' },
      telephone: negocio.telefono,
      email: negocio.email,
      servesCuisine: ['Tex-Mex', 'Pizza', 'Hamburguesas'],
      priceRange: '$$',
      openingHoursSpecification: [{
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        opens: negocio.apertura?.abre,
        closes: negocio.apertura?.cierra,
      }],
      sameAs: Object.values(negocio.redes || {}).filter(Boolean),
    };
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.textContent = JSON.stringify(ficha);
    document.head.append(s);
  }

  /* ---------- Cesta ---------- */

  function pintarCesta() {
    if (!capacidades.activa) return;

    const n = window.Pedido.contar();
    const caja = $('#cesta');
    caja.hidden = n === 0;
    caja.classList.toggle('visible', n > 0);
    document.body.classList.toggle('con-cesta', n > 0);
    if (!n) return;

    $('#cesta-cuenta').textContent =
      n === 1
        ? window.t('cesta.unProducto', idioma)
        : `${n} ${window.t('cesta.productos', idioma)}`;
    $('#cesta-total').textContent = dinero(window.Pedido.total());

    const accion = $('#cesta-accion');
    accion.hidden = !capacidades.tieneAccion;
    if (capacidades.tieneAccion) accion.textContent = window.t(capacidades.claveBoton, idioma);
  }

  function engancharCesta() {
    if (!capacidades.activa) return;

    $('#cesta-vaciar').addEventListener('click', () => {
      window.Pedido.vaciar();
      window.Carta.render();
    });

    $('#cesta-accion').addEventListener('click', () => {
      const numero = (negocio.pedidos.whatsapp || '').replace(/\D/g, '');
      if (!numero) return;
      const mensaje = window.Pedido.comoTexto(idioma, carta.moneda);
      window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`, '_blank', 'noopener');
    });

    window.Pedido.suscribir(pintarCesta);
  }

  /* ---------- Buscador ---------- */

  function engancharBuscador() {
    const input = $('#buscar');
    const limpiar = $('#limpiar');
    let temporizador;

    input.addEventListener('input', () => {
      limpiar.hidden = input.value === '';
      clearTimeout(temporizador);
      // Pequeña espera: 129 productos se repintan rápido, pero no en cada tecla.
      temporizador = setTimeout(() => {
        window.Carta.estado.busqueda = input.value;
        window.Carta.render();
      }, 120);
    });

    limpiar.addEventListener('click', () => {
      input.value = '';
      limpiar.hidden = true;
      window.Carta.estado.busqueda = '';
      window.Carta.render();
      input.focus();
    });
  }

  /* ---------- Arranque ---------- */

  async function iniciar() {
    try {
      [carta, negocio] = await Promise.all([
        fetch('datos/carta.json').then((r) => r.json()),
        fetch('datos/negocio.json').then((r) => r.json()),
      ]);
    } catch (e) {
      document.getElementById('resultados').textContent =
        'No se ha podido cargar la carta. Recarga la página, por favor.';
      return;
    }

    capacidades = window.Pedido.capacidades(negocio.pedidos);

    window.Carta.estado.idioma = idioma;
    window.Carta.iniciar(carta, {
      cestaActiva: capacidades.activa,
      alAnadir: (producto) => window.Pedido.anadir(producto),
    });

    aplicarTextos();
    pintarNegocio();
    pintarEspecialidades();
    datosEstructurados();
    window.Carta.render();
    engancharBuscador();
    engancharCesta();
    engancharNav();
    engancharMenuMovil();
    pintarCesta();

    for (const b of document.querySelectorAll('[data-idioma]')) {
      b.addEventListener('click', () => cambiarIdioma(b.dataset.idioma));
    }

    // El cartel de abierto/cerrado se refresca solo mientras la pestaña esté abierta.
    setInterval(pintarEstado, 60000);
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})();
