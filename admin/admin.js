const config = window.BEANIES_ADMIN_CONFIG || {};
const API = String(config.apiBase || '').replace(/\/$/, '');
const demo = location.hostname === 'localhost' && new URLSearchParams(location.search).get('demo') === '1';
const CLAVE_SESION = 'bb.admin.session.v1';

const estado = {
  token: sessionStorage.getItem(CLAVE_SESION) || '',
  carta: null,
  original: '',
  sha: '',
  categoria: 'todo',
  busqueda: '',
  seleccionado: null,
  publicando: false,
};

const dinero = (n) => `$${Number(n || 0).toLocaleString('es-CL')}`;
const normalizar = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const escaparSelector = (s) => window.CSS?.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');

function crear(tag, clase, texto) {
  const nodo = document.createElement(tag);
  if (clase) nodo.className = clase;
  if (texto != null) nodo.textContent = texto;
  return nodo;
}

function avisar(texto, tipo = '') {
  let nodo = document.getElementById('aviso-global');
  if (!nodo) {
    nodo = crear('div', 'aviso-global');
    nodo.id = 'aviso-global';
    nodo.role = 'status';
    nodo.setAttribute('aria-live', 'polite');
    document.body.append(nodo);
  }
  nodo.className = `aviso-global ${tipo}`.trim();
  nodo.textContent = texto;
  nodo.hidden = false;
  clearTimeout(avisar.temporizador);
  avisar.temporizador = setTimeout(() => { nodo.hidden = true; }, 5000);
}

async function api(ruta, opciones = {}) {
  if (!API) throw new Error('La administración todavía no está conectada al servicio seguro.');
  const cabeceras = new Headers(opciones.headers || {});
  cabeceras.set('Accept', 'application/json');
  cabeceras.set('X-Beanies-Desktop', '1');
  if (estado.token) cabeceras.set('Authorization', `Bearer ${estado.token}`);
  if (opciones.body) cabeceras.set('Content-Type', 'application/json');
  const respuesta = await fetch(`${API}${ruta}`, { ...opciones, headers: cabeceras, cache: 'no-store' });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const error = new Error(datos.error || 'No se pudo completar la operación.');
    error.status = respuesta.status;
    error.code = datos.code;
    throw error;
  }
  return datos;
}

function mostrarAcceso(mensaje = '') {
  document.body.innerHTML = `
    <main class="acceso">
      <section class="acceso-panel" aria-labelledby="titulo-acceso">
        <p class="marca">Beanies &amp; Bikinis</p>
        <h1 id="titulo-acceso">Administración de carta</h1>
        <p class="bajada">Edita productos en un borrador y publícalos en la web solo cuando estén listos.</p>
        <form class="form-acceso" id="form-acceso">
          <label>Contraseña de administración
            <input name="password" type="password" autocomplete="current-password" required minlength="12" autofocus>
          </label>
          <button class="boton boton-primario" type="submit">Entrar de forma segura</button>
          <p class="mensaje${mensaje ? ' error' : ''}" id="mensaje-acceso" role="status"></p>
        </form>
      </section>
      <aside class="acceso-contexto" aria-label="Información de seguridad">
        <p class="marca">Publicación protegida</p>
        <h2>La contraseña y el token de GitHub nunca llegan a esta página.</h2>
        <p class="bajada">El servicio seguro valida cada cambio y solo puede actualizar el archivo de la carta.</p>
      </aside>
    </main>`;

  document.getElementById('mensaje-acceso').textContent = mensaje;
  document.getElementById('form-acceso').addEventListener('submit', iniciarSesion);
}

function mostrarSinConfig() {
  document.body.innerHTML = `
    <main class="acceso">
      <section class="acceso-panel">
        <p class="marca">Beanies &amp; Bikinis</p>
        <h1>Administración preparada</h1>
        <p class="bajada">El editor seguro ya está instalado. Falta conectar una sola vez el servicio que publica la carta.</p>
        <p class="mensaje">Consulta <strong>docs/ADMIN-CARTA.md</strong> en el proyecto y ejecuta el activador local. No pegues credenciales en esta página.</p>
        ${demo ? '<button class="boton boton-primario" id="abrir-demo">Abrir demostración local</button>' : ''}
      </section>
      <aside class="acceso-contexto">
        <p class="marca">Sin secretos en la web</p>
        <h2>La carta pública sigue funcionando normalmente.</h2>
        <p class="bajada">Hasta activar el servicio, esta ruta no puede leer ni publicar cambios privados.</p>
      </aside>
    </main>`;
  document.getElementById('abrir-demo')?.addEventListener('click', cargarDemo);
}

async function iniciarSesion(evento) {
  evento.preventDefault();
  const form = evento.currentTarget;
  const boton = form.querySelector('button');
  const mensaje = document.getElementById('mensaje-acceso');
  boton.disabled = true;
  boton.textContent = 'Verificando…';
  mensaje.textContent = '';
  try {
    const { token } = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ password: new FormData(form).get('password') }),
    });
    estado.token = token;
    sessionStorage.setItem(CLAVE_SESION, token);
    await cargarCarta();
  } catch (error) {
    mensaje.textContent = error.status === 401 ? 'La contraseña no es correcta.' : error.message;
    mensaje.className = 'mensaje error';
    form.password.select();
  } finally {
    boton.disabled = false;
    boton.textContent = 'Entrar de forma segura';
  }
}

async function cargarDemo() {
  const respuesta = await fetch('../datos/carta.json', { cache: 'no-store' });
  estado.carta = await respuesta.json();
  estado.sha = 'demostracion';
  estado.original = JSON.stringify(estado.carta);
  estado.seleccionado = estado.carta.categorias[0]?.productos[0]?.id || null;
  montarEditor();
  avisar('Demostración local: publicar está desactivado.', 'exito');
}

async function cargarCarta() {
  try {
    const datos = await api('/api/menu');
    estado.carta = datos.menu;
    estado.sha = datos.sha;
    estado.original = JSON.stringify(datos.menu);
    estado.seleccionado = datos.menu.categorias[0]?.productos[0]?.id || null;
    montarEditor();
  } catch (error) {
    if (error.status === 401) {
      cerrarSesion('Tu sesión venció. Vuelve a entrar.');
      return;
    }
    mostrarAcceso(error.message);
  }
}

function montarEditor() {
  document.body.innerHTML = `
    <main class="admin">
      <header class="barra">
        <div class="barra-marca"><strong>Administración de carta</strong><span>Beanies &amp; Bikinis</span></div>
        <div class="barra-acciones">
          <span class="estado-conexion">${demo ? 'Demostración local' : 'Servicio seguro conectado'}</span>
          <button class="boton" id="recargar" type="button">Recargar</button>
          <button class="boton" id="salir" type="button">Salir</button>
          <div class="publicacion">
            <div class="cambios" aria-live="polite"><strong id="cantidad-cambios">Sin cambios</strong><span id="detalle-cambios">Carta sincronizada</span></div>
            <button class="boton boton-primario" id="publicar" type="button" disabled>Publicar carta</button>
          </div>
        </div>
      </header>
      <div class="espacio">
        <nav class="categorias" aria-label="Categorías de la carta">
          <div class="titulo-zona"><span>Categorías</span><span id="total-productos"></span></div>
          <ul class="categorias-lista" id="categorias"></ul>
        </nav>
        <section class="listado" aria-labelledby="titulo-listado">
          <div class="herramientas">
            <label class="buscar"><span class="sr">Buscar producto</span><input id="buscar" type="search" placeholder="Buscar producto" autocomplete="off"></label>
            <button class="boton" id="agregar" type="button">+ Agregar producto</button>
          </div>
          <div class="resumen-lista"><strong id="titulo-listado">Productos</strong><span id="cuenta-listado"></span></div>
          <ul class="productos" id="productos"></ul>
        </section>
        <aside class="inspector" id="inspector" aria-label="Editor de producto"></aside>
      </div>
    </main>
    <div id="aviso-global" class="aviso-global" role="status" aria-live="polite" hidden></div>`;

  document.getElementById('buscar').addEventListener('input', (e) => { estado.busqueda = e.target.value; renderProductos(); });
  document.getElementById('agregar').addEventListener('click', agregarProducto);
  document.getElementById('publicar').addEventListener('click', publicar);
  document.getElementById('salir').addEventListener('click', () => cerrarSesion());
  document.getElementById('recargar').addEventListener('click', confirmarRecarga);
  renderTodo();
}

function productosPlanos() {
  return estado.carta.categorias.flatMap((categoria) => categoria.productos.map((producto) => ({ categoria, producto })));
}

function productoSeleccionado() {
  return productosPlanos().find(({ producto }) => producto.id === estado.seleccionado) || null;
}

function hayCambios() { return estado.original !== JSON.stringify(estado.carta); }

function actualizarPublicacion() {
  const sucio = hayCambios();
  document.getElementById('cantidad-cambios').textContent = sucio ? 'Cambios sin publicar' : 'Sin cambios';
  document.getElementById('detalle-cambios').textContent = sucio ? 'Solo existen en este borrador' : 'Carta sincronizada';
  const boton = document.getElementById('publicar');
  boton.disabled = !sucio || estado.publicando || demo;
  boton.textContent = estado.publicando ? 'Publicando…' : 'Publicar carta';
}

function renderTodo() {
  renderCategorias();
  renderProductos();
  renderInspector();
  actualizarPublicacion();
}

function renderCategorias() {
  const lista = document.getElementById('categorias');
  lista.replaceChildren();
  const total = productosPlanos().length;
  document.getElementById('total-productos').textContent = total;
  const opciones = [{ id: 'todo', nombre: 'Todos', cantidad: total }, ...estado.carta.categorias.map((c) => ({ id: c.id, nombre: c.nombre.es, cantidad: c.productos.length }))];
  for (const opcion of opciones) {
    const li = document.createElement('li');
    const boton = crear('button', 'categoria');
    boton.type = 'button';
    boton.setAttribute('aria-current', String(estado.categoria === opcion.id));
    boton.append(crear('span', '', opcion.nombre), crear('span', '', opcion.cantidad));
    boton.addEventListener('click', () => { estado.categoria = opcion.id; renderCategorias(); renderProductos(); });
    li.append(boton);
    lista.append(li);
  }
}

function renderProductos() {
  const lista = document.getElementById('productos');
  const consulta = normalizar(estado.busqueda);
  const filas = productosPlanos().filter(({ categoria, producto }) => {
    if (estado.categoria !== 'todo' && categoria.id !== estado.categoria) return false;
    return !consulta || normalizar(`${producto.nombre.es} ${producto.nombre.en} ${producto.desc?.es || ''}`).includes(consulta);
  });
  document.getElementById('cuenta-listado').textContent = `${filas.length} ${filas.length === 1 ? 'producto' : 'productos'}`;
  lista.replaceChildren();
  if (!filas.length) {
    const vacio = crear('li', 'vacio', 'No hay productos que coincidan. Prueba otra búsqueda o categoría.');
    lista.append(vacio);
    return;
  }
  for (const { categoria, producto } of filas) {
    const li = document.createElement('li');
    const boton = crear('button', `fila-producto${producto.visible === false ? ' oculto' : ''}`);
    boton.type = 'button';
    boton.setAttribute('aria-current', String(estado.seleccionado === producto.id));
    boton.dataset.producto = producto.id;
    const texto = crear('span', 'producto-texto');
    texto.append(crear('strong', '', producto.nombre.es || 'Sin nombre'), crear('small', '', categoria.nombre.es));
    const precio = crear('span', 'precio', dinero(producto.oferta?.activa && Number.isInteger(producto.oferta.precio) ? producto.oferta.precio : producto.precio));
    const estados = crear('span', 'estados');
    const visibilidad = crear('span', `punto${producto.visible === false ? '' : ' visible'}`);
    visibilidad.title = producto.visible === false ? 'Oculto' : 'Visible';
    estados.append(visibilidad);
    if (producto.oferta?.activa) { const oferta = crear('span', 'punto oferta'); oferta.title = 'Oferta activa'; estados.append(oferta); }
    boton.append(texto, precio, estados);
    boton.addEventListener('click', () => { estado.seleccionado = producto.id; renderProductos(); renderInspector(); });
    li.append(boton);
    lista.append(li);
  }
}

function renderInspector() {
  const inspector = document.getElementById('inspector');
  const encontrado = productoSeleccionado();
  if (!encontrado) {
    inspector.innerHTML = '<div class="vacio"><strong>Selecciona un producto</strong><p>Podrás editar su precio, visibilidad, disponibilidad y oferta.</p></div>';
    return;
  }
  const { categoria, producto } = encontrado;
  const oferta = producto.oferta || { activa: false, precio: null, texto: { es: '', en: '' } };
  inspector.innerHTML = `
    <header class="inspector-cabecera"><h2 id="editor-titulo"></h2><p id="editor-meta"></p></header>
    <form class="editor" id="editor-form">
      <label>Nombre en español<input name="nombre.es" required maxlength="240"></label>
      <label>Nombre en inglés<input name="nombre.en" maxlength="240"></label>
      <label>Descripción en español<textarea name="desc.es" maxlength="500"></textarea></label>
      <label>Descripción en inglés<textarea name="desc.en" maxlength="500"></textarea></label>
      <div class="fila-campos">
        <label>Precio en pesos<input name="precio" type="number" min="0" max="100000000" step="100" required></label>
        <label>Categoría<select name="categoria"></select></label>
      </div>
      <div class="grupo-editor">
        <h3>Estado público</h3>
        <label class="interruptor"><span>Visible en la web</span><input name="visible" type="checkbox"></label>
        <label class="interruptor"><span>Disponible para pedir</span><input name="disponible" type="checkbox"></label>
      </div>
      <div class="grupo-editor">
        <h3>Oferta</h3>
        <label class="interruptor"><span>Oferta activa</span><input name="oferta.activa" type="checkbox"></label>
        <label>Precio de oferta (opcional)<input name="oferta.precio" type="number" min="0" max="100000000" step="100" placeholder="Ej. 9900"></label>
        <label>Texto de oferta en español<input name="oferta.texto.es" maxlength="60" placeholder="Ej. 2x1 toda la noche"></label>
        <label>Texto de oferta en inglés<input name="oferta.texto.en" maxlength="60" placeholder="Ej. 2-for-1 all night"></label>
      </div>
    </form>
    <footer class="inspector-pie"><p>Los cambios permanecen en borrador hasta usar “Publicar carta”. Para retirar un producto sin borrarlo, desactiva “Visible en la web”.</p></footer>`;

  inspector.querySelector('#editor-titulo').textContent = producto.nombre.es || 'Producto sin nombre';
  inspector.querySelector('#editor-meta').textContent = `ID: ${producto.id}`;
  const form = inspector.querySelector('#editor-form');
  const categoriaSelect = form.elements.categoria;
  for (const cat of estado.carta.categorias) {
    const opcion = new Option(cat.nombre.es, cat.id, false, cat.id === categoria.id);
    categoriaSelect.add(opcion);
  }
  form.elements['nombre.es'].value = producto.nombre.es || '';
  form.elements['nombre.en'].value = producto.nombre.en || '';
  form.elements['desc.es'].value = producto.desc?.es || '';
  form.elements['desc.en'].value = producto.desc?.en || '';
  form.elements.precio.value = producto.precio;
  form.elements.visible.checked = producto.visible !== false;
  form.elements.disponible.checked = producto.disponible !== false;
  form.elements['oferta.activa'].checked = Boolean(oferta.activa);
  form.elements['oferta.precio'].value = Number.isInteger(oferta.precio) ? oferta.precio : '';
  form.elements['oferta.texto.es'].value = oferta.texto?.es || '';
  form.elements['oferta.texto.en'].value = oferta.texto?.en || '';
  form.addEventListener('input', aplicarEditor);
  categoriaSelect.addEventListener('change', cambiarCategoria);
}

function aplicarEditor(evento) {
  const encontrado = productoSeleccionado();
  if (!encontrado) return;
  const p = encontrado.producto;
  const { name, type, checked, value } = evento.target;
  if (name === 'categoria') return;
  if (name === 'precio') p.precio = value === '' ? null : Number(value);
  else if (name === 'visible' || name === 'disponible') p[name] = checked;
  else if (name.startsWith('oferta.')) {
    p.oferta ||= { activa: false, precio: null, texto: { es: '', en: '' } };
    if (name === 'oferta.activa') p.oferta.activa = checked;
    else if (name === 'oferta.precio') p.oferta.precio = value === '' ? null : Number(value);
    else p.oferta.texto[name.endsWith('.es') ? 'es' : 'en'] = value;
  } else {
    const [grupo, idioma] = name.split('.');
    p[grupo] ||= { es: '', en: '' };
    p[grupo][idioma] = value;
  }
  inspectorTitulo(p);
  renderProductos();
  actualizarPublicacion();
}

function inspectorTitulo(producto) {
  const titulo = document.getElementById('editor-titulo');
  if (titulo) titulo.textContent = producto.nombre.es || 'Producto sin nombre';
}

function cambiarCategoria(evento) {
  const encontrado = productoSeleccionado();
  if (!encontrado || evento.target.value === encontrado.categoria.id) return;
  const destino = estado.carta.categorias.find((c) => c.id === evento.target.value);
  if (!destino) return;
  encontrado.categoria.productos = encontrado.categoria.productos.filter((p) => p.id !== encontrado.producto.id);
  destino.productos.push(encontrado.producto);
  estado.categoria = destino.id;
  renderTodo();
  avisar(`Producto movido a ${destino.nombre.es}.`, 'exito');
}

function agregarProducto() {
  const categoria = estado.carta.categorias.find((c) => c.id === estado.categoria) || estado.carta.categorias[0];
  if (!categoria) return;
  const id = `producto-${Date.now().toString(36)}`;
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
  estado.categoria = categoria.id;
  estado.busqueda = '';
  estado.seleccionado = id;
  document.getElementById('buscar').value = '';
  renderTodo();
  document.querySelector('[name="nombre.es"]')?.select();
  avisar('Producto creado oculto. Complétalo antes de hacerlo visible.', 'exito');
}

function validarCarta() {
  const errores = [];
  const ids = new Set();
  for (const { categoria, producto } of productosPlanos()) {
    if (!producto.id || ids.has(producto.id)) errores.push(`ID repetido o vacío en ${categoria.nombre.es}.`);
    ids.add(producto.id);
    if (!producto.nombre?.es?.trim()) errores.push(`Hay un producto sin nombre en ${categoria.nombre.es}.`);
    if (!Number.isInteger(producto.precio) || producto.precio < 0) errores.push(`${producto.nombre?.es || producto.id}: precio inválido.`);
    if (producto.oferta?.activa && producto.oferta.precio != null && (!Number.isInteger(producto.oferta.precio) || producto.oferta.precio < 0)) errores.push(`${producto.nombre?.es || producto.id}: precio de oferta inválido.`);
  }
  return errores;
}

async function publicar() {
  if (demo || estado.publicando || !hayCambios()) return;
  const errores = validarCarta();
  if (errores.length) { avisar(errores[0], 'error'); return; }
  if (!window.confirm('¿Publicar estos cambios en la carta para todos los clientes?')) return;
  estado.publicando = true;
  actualizarPublicacion();
  try {
    const resultado = await api('/api/menu', {
      method: 'PUT',
      body: JSON.stringify({ menu: estado.carta, sha: estado.sha }),
    });
    estado.sha = resultado.sha;
    estado.original = JSON.stringify(estado.carta);
    avisar('Carta publicada. GitHub Pages aplicará el cambio en unos minutos.', 'exito');
  } catch (error) {
    if (error.status === 409) avisar('La carta cambió en otra sesión. Recarga antes de volver a publicar.', 'error');
    else if (error.status === 401) cerrarSesion('Tu sesión venció. Vuelve a entrar.');
    else avisar(error.message, 'error');
  } finally {
    estado.publicando = false;
    actualizarPublicacion();
  }
}

function confirmarRecarga() {
  if (hayCambios() && !window.confirm('Hay cambios sin publicar. ¿Descartarlos y recargar la carta?')) return;
  if (demo) cargarDemo(); else cargarCarta();
}

function cerrarSesion(mensaje = '') {
  estado.token = '';
  sessionStorage.removeItem(CLAVE_SESION);
  mostrarAcceso(mensaje);
}

async function iniciar() {
  document.getElementById('cargando')?.remove();
  if (!API) { mostrarSinConfig(); return; }
  if (estado.token) { await cargarCarta(); return; }
  mostrarAcceso();
}

iniciar();
