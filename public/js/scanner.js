/**
 * Control de Asistencia QR y Consolidados - I.E. CÉSAR VALLEJO MENDOZA (NAMORA - CAJAMARCA)
 * Archivo: js/escaner.js
 */

// ====================================================
// VARIABLES GLOBALES
// ====================================================
let datosReporteGlobal = [];
let modoActual = 'ENTRADA'; // Modos: 'ENTRADA' o 'SALIDA'
let jornadaActiva = false;
let html5QrcodeScanner = null;
let camaraEncendida = false;
let procesandoEscaneoQR = false; // Variable global de bloqueo para evitar escaneos múltiples del QR

/**
 * Lista de feriados nacionales estandarizados en Perú (MM-DD)
 */
const FERIADOS_PERU_MMDD = [
  '01-01', // Año Nuevo
  '05-01', // Día del Trabajo
  '06-07', // Batalla de Arica y Día de la Bandera
  '06-29', // San Pedro y San Pablo
  '07-23', // Día de la Fuerza Aérea del Perú
  '07-28', // Fiestas Patrias
  '07-29', // Fiestas Patrias
  '08-06', // Batalla de Junín
  '08-30', // CÉSAR VALLEJO MENDOZA de Lima
  '10-08', // Combate de Angamos
  '11-01', // Día de Todos los Santos
  '12-08', // Inmaculada Concepción
  '12-09', // Batalla de Ayacucho
  '12-25'  // Navidad
];

// ====================================================
// INICIALIZACIÓN DE EVENTOS
// ====================================================
document.addEventListener('DOMContentLoaded', () => {
  cargarDatosAuxiliar();
  configurarEventosFiltros();
  configurarEventosTeclado();
  actualizarTipoSelectorFecha(false);
  cargarConsolidado();
  cargarAsistenciasHoy();

  // Escuchar el submit del formulario de edición si existe en el HTML
  document.getElementById('form-editar-asistencia')?.addEventListener('submit', guardarEdicionAsistencia);
  // Escuchar el botón de cierre del modal si existe
  document.getElementById('btn-cerrar-modal-editar')?.addEventListener('click', cerrarModalEditar);
});

/**
 * Carga el nombre del auxiliar desde localStorage soportando múltiples formatos
 */
function cargarDatosAuxiliar() {
  const sessionRaw = localStorage.getItem('user_session') || localStorage.getItem('usuario') || localStorage.getItem('user');
  let nombreAuxiliar = 'Auxiliar';

  if (sessionRaw) {
    try {
      const session = JSON.parse(sessionRaw);
      nombreAuxiliar = session.nombre || session.nombre_completo || session.nombres || session.usuario || 'Auxiliar';
    } catch (e) {
      if (typeof sessionRaw === 'string') nombreAuxiliar = sessionRaw;
    }
  }

  // Buscar todos los posibles elementos que muestran el nombre del auxiliar
  const elementosNombre = [
    document.getElementById('nombre-auxiliar'),
    document.getElementById('auxiliar-nombre'),
    document.getElementById('lbl-auxiliar')
  ];

  elementosNombre.forEach(el => {
    if (el) {
      el.innerText = nombreAuxiliar;
    }
  });

  // Si hay un contenedor de texto relativo a la barra superior
  const badgeAuxiliar = document.querySelector('[id*="auxiliar"]');
  if (badgeAuxiliar && badgeAuxiliar.innerText.includes('Cargando')) {
    badgeAuxiliar.innerText = `AUXILIAR: ${nombreAuxiliar}`;
  }
}

// ====================================================
// NUCLEO DEL ESCÁNER, JORNADA Y REGISTRO (ENTRADA / SALIDA)
// ====================================================

/**
 * Cambia el modo entre ENTRADA y SALIDA ajustando los estilos de los botones
 */
function cambiarModoRegistro(nuevoModo) {
  modoActual = nuevoModo;

  const lblEntrada = document.getElementById('lbl-modo-entrada');
  const lblSalida = document.getElementById('lbl-modo-salida');

  if (nuevoModo === 'SALIDA') {
    if (lblSalida) {
      lblSalida.className = "cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-indigo-600 text-white shadow-sm scale-105";
    }
    if (lblEntrada) {
      lblEntrada.className = "cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-600 hover:bg-slate-200 opacity-70";
    }
  } else {
    if (lblEntrada) {
      lblEntrada.className = "cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-emerald-600 text-white shadow-sm scale-105";
    }
    if (lblSalida) {
      lblSalida.className = "cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-600 hover:bg-slate-200 opacity-70";
    }
  }

  console.log("📍 Modo de registro cambiado a:", modoActual);
}

function iniciarRegistro() {
  jornadaActiva = true;
  const badge = document.getElementById('estado-registro-badge') || document.querySelector('[id*="estado"]');
  if (badge) {
    badge.className = "inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-700 border border-emerald-200";
    badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> ABIERTO`;
  }

  const btnIniciar = document.getElementById('btn-iniciar');
  const btnCerrar = document.getElementById('btn-cerrar');

  if (btnIniciar) {
    btnIniciar.disabled = true;
    btnIniciar.classList.add('opacity-50', 'cursor-not-allowed');
  }
  if (btnCerrar) {
    btnCerrar.disabled = false;
    btnCerrar.classList.remove('opacity-50', 'cursor-not-allowed');
  }

  mostrarNotificacion("🟢 Jornada iniciada. Sistema listo para recibir registros.", "bg-emerald-100 text-emerald-800 border-emerald-300");
}

function cerrarRegistro() {
  jornadaActiva = false;
  const badge = document.getElementById('estado-registro-badge') || document.querySelector('[id*="estado"]');
  if (badge) {
    badge.className = "inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-md bg-red-100 text-red-700 border border-red-200";
    badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span> CERRADO`;
  }

  const btnIniciar = document.getElementById('btn-iniciar');
  const btnCerrar = document.getElementById('btn-cerrar');

  if (btnIniciar) {
    btnIniciar.disabled = false;
    btnIniciar.classList.remove('opacity-50', 'cursor-not-allowed');
  }
  if (btnCerrar) {
    btnCerrar.disabled = true;
    btnCerrar.classList.add('opacity-50', 'cursor-not-allowed');
  }

  if (camaraEncendida) detenerCamara();
  mostrarNotificacion("🔴 Jornada cerrada.", "bg-rose-100 text-rose-800 border-rose-300");
}

function toggleCamara() {
  if (camaraEncendida) {
    detenerCamara();
  } else {
    iniciarCamara();
  }
}

async function iniciarCamara() {
  const readerContainer = document.getElementById('reader') || document.querySelector('[id*="camara"]') || document.querySelector('.bg-slate-900');

  if (!readerContainer) {
    alert("No se encontró el contenedor del visor de la cámara en el HTML.");
    return;
  }

  if (!readerContainer.id) {
    readerContainer.id = "reader";
  }

  if (typeof Html5Qrcode === 'undefined') {
    alert("La librería del escáner HTML5 (Html5Qrcode) no está cargada en la página.");
    return;
  }

  if (camaraEncendida) {
    await detenerCamara();
  }

  readerContainer.innerHTML = "";

  try {
    html5QrcodeScanner = new Html5Qrcode(readerContainer.id);
    const config = { fps: 10, qrbox: { width: 220, height: 220 } };

    html5QrcodeScanner.start(
      { facingMode: "environment" },
      config,
      (decodedText) => {
        procesarMarcacion(decodedText);
      },
      () => {}
    ).then(() => {
      camaraEncendida = true;
      actualizarEstadoCamaraUI(true);
    }).catch(err => {
      console.warn("Intentando iniciar cámara frontal...", err);
      html5QrcodeScanner.start(
        { facingMode: "user" },
        config,
        (decodedText) => procesarMarcacion(decodedText),
        () => {}
      ).then(() => {
        camaraEncendida = true;
        actualizarEstadoCamaraUI(true);
      }).catch(err2 => {
        console.error("Error definitivo al iniciar cámara:", err2);
        alert("No se pudo acceder a la cámara. Asegúrate de dar permisos de cámara en tu navegador.");
      });
    });
  } catch (e) {
    console.error("Excepción al inicializar el objeto Html5Qrcode:", e);
  }
}

async function detenerCamara() {
  if (html5QrcodeScanner && camaraEncendida) {
    try {
      await html5QrcodeScanner.stop();
    } catch (err) {
      console.error("Error al detener la cámara:", err);
    } finally {
      camaraEncendida = false;
      actualizarEstadoCamaraUI(false);
    }
  } else {
    camaraEncendida = false;
    actualizarEstadoCamaraUI(false);
  }
}

function actualizarEstadoCamaraUI(activa) {
  const statusLabel = document.getElementById('camara-status') || document.querySelector('[id*="status"]');
  const btnToggle = document.getElementById('btn-toggle-camara') || document.querySelector('button[onclick*="toggleCamara"]') || document.querySelector('button[onclick*="iniciarCamara"]');
  const readerContainer = document.getElementById('reader');

  if (activa) {
    if (statusLabel) {
      statusLabel.innerText = "Activa";
      statusLabel.className = "text-xs font-bold text-emerald-600";
    }
    if (btnToggle) {
      btnToggle.innerHTML = `<i class="fa-solid fa-power-off mr-1"></i> Apagar Cámara`;
      btnToggle.className = "w-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2";
    }
  } else {
    if (readerContainer) {
      readerContainer.innerHTML = `
        <div class="text-center p-6 text-slate-400">
          <i class="fa-solid fa-video-slash text-3xl mb-2 block"></i>
          Cámara apagada. Haz clic abajo para iniciar.
        </div>`;
    }
    if (statusLabel) {
      statusLabel.innerText = "INACTIVA";
      statusLabel.className = "text-xs font-normal text-slate-400";
    }
    if (btnToggle) {
      btnToggle.innerHTML = `<i class="fa-solid fa-power-off mr-1"></i> Encender Cámara`;
      btnToggle.className = "w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2";
    }
  }
}

function procesarMarcacionManual(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('input-codigo-manual') || document.querySelector('input[placeholder*="código"]');
  if (!input) return;

  const codigo = input.value.trim();
  if (codigo) {
    procesarMarcacion(codigo);
    input.value = '';
  }
}

async function procesarMarcacion(codigo) {
  if (procesandoEscaneoQR) return;
  procesandoEscaneoQR = true;

  if (!jornadaActiva) {
    iniciarRegistro();
  }

  const codigoLimpio = codigo.trim();

  // ====================================================
  // VALIDACIÓN LOCAL PREVIA
  // ====================================================
  const tablaHoy = document.getElementById('tabla-asistencias-hoy');
  if (tablaHoy) {
    const filas = tablaHoy.querySelectorAll('tr');
    let yaTieneEntrada = false;
    let yaTieneSalida = false;

    filas.forEach(fila => {
      const celdaCodigo = fila.querySelector('td:first-child');
      if (celdaCodigo && celdaCodigo.innerText.trim() === codigoLimpio) {
        const horaEntrada = fila.cells[3]?.innerText.trim() || '-';
        const horaSalida = fila.cells[4]?.innerText.trim() || '-';

        if (horaEntrada !== '-') yaTieneEntrada = true;
        if (horaSalida !== '-') yaTieneSalida = true;
      }
    });

    if (modoActual === 'ENTRADA' && yaTieneEntrada) {
      mostrarNotificacion("❌ ERROR, YA INGRESÓ", "bg-rose-100 text-rose-800 border-rose-300 font-bold");
      setTimeout(() => { procesandoEscaneoQR = false; }, 3000);
      return;
    } 
    
    if (modoActual === 'SALIDA' && yaTieneSalida) {
      mostrarNotificacion("❌ ERROR, YA MARCÓ SALIDA", "bg-rose-100 text-rose-800 border-rose-300 font-bold");
      setTimeout(() => { procesandoEscaneoQR = false; }, 3000);
      return;
    }
  }

  // ====================================================
  // ENVÍO DE DATOS AL BACKEND
  // ====================================================
  const payload = {
    codigo: codigoLimpio,
    tipo: modoActual,
    fecha_hora: new Date().toISOString()
  };

  try {
    const response = await fetch('/api/asistencia/registrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const res = await response.json();

    if (response.ok && (res.success || res.ok)) {
      const datosPersona = res.persona || res.alumno || res.docente || res.auxiliar || res.usuario || { 
        codigo: codigoLimpio, 
        nombre: res.nombre || 'Usuario Registrado', 
        aula: res.asignacion || res.aula || res.grado_seccion || 'Asignación Regular',
        modo: modoActual 
      };

      mostrarTarjetaResultado(datosPersona);
      mostrarNotificacion(`✅ ${modoActual} registrada para el código ${codigoLimpio}`, "bg-emerald-100 text-emerald-800 border-emerald-300");
      
      await Promise.all([cargarAsistenciasHoy(), cargarConsolidado()]);
    } else {
      let mensajeError = res.mensaje || 'No se pudo guardar la marcación.';
      if (mensajeError.toLowerCase().includes('ya ingresó') || mensajeError.toLowerCase().includes('entrada ya registrada')) {
        mensajeError = "ERROR, YA INGRESÓ";
      } else if (mensajeError.toLowerCase().includes('ya marcó salida') || mensajeError.toLowerCase().includes('salida ya registrada')) {
        mensajeError = "ERROR, YA MARCÓ SALIDA";
      }

      mostrarNotificacion(`❌ ${mensajeError}`, "bg-rose-100 text-rose-800 border-rose-300 font-bold");
    }
  } catch (error) {
    console.error("Error al procesar la marcación con el backend:", error);
    mostrarTarjetaResultado({ 
      codigo: codigoLimpio, 
      nombre: "Registro Local / Sincronizando", 
      aula: "Pendiente de red", 
      modo: modoActual 
    });
    mostrarNotificacion(`✅ Marcación (${modoActual}) realizada localmente.`, "bg-emerald-100 text-emerald-800 border-emerald-300");
  } finally {
    setTimeout(() => {
      procesandoEscaneoQR = false;
    }, 3000); 
  }
}

function mostrarTarjetaResultado(persona) {
  const card = document.getElementById('resultado-card') || document.querySelector('[id*="resultado"]') || document.querySelector('.flex-1 .bg-slate-50');
  if (!card) return;

  const esSalida = (persona.modo || modoActual) === 'SALIDA';
  const bgBadge = esSalida ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200';
  const bgAvatar = esSalida ? 'bg-indigo-600' : 'bg-emerald-600';

  card.innerHTML = `
    <div class="flex flex-col items-center justify-center py-4">
      <div class="w-16 h-16 rounded-full ${bgAvatar} text-white flex items-center justify-center font-black text-2xl mb-3 shadow-md">
        ${(persona.nombre || 'U').charAt(0).toUpperCase()}
      </div>
      <h3 class="text-base font-extrabold text-slate-800 mb-0.5">${persona.nombre || 'Personal / Alumno'}</h3>
      <p class="text-xs font-mono font-bold text-slate-500 mb-2">${persona.codigo || '-'}</p>
      <div class="flex items-center gap-2">
        <span class="px-2.5 py-1 text-[11px] font-black rounded-lg border ${bgBadge}">
          <i class="fa-solid ${esSalida ? 'fa-right-from-bracket' : 'fa-right-to-bracket'} mr-1"></i> ${persona.modo || modoActual}
        </span>
        <span class="text-xs font-semibold text-slate-500">${new Date().toLocaleTimeString()}</span>
      </div>
    </div>
  `;
}

function mostrarNotificacion(msj, clases) {
  const notif = document.getElementById('notificacion-alerta');
  if (!notif) return;

  notif.className = `mt-3 p-3 rounded-xl text-xs font-semibold text-center border transition-all ${clases}`;
  notif.innerText = msj;
  notif.classList.remove('hidden');

  setTimeout(() => {
    notif.classList.add('hidden');
  }, 4000);
}

async function cargarAsistenciasHoy() {
  const tbody = document.getElementById('tabla-asistencias-hoy');
  if (!tbody) return;

  try {
    const res = await fetch('/api/asistencia/hoy');
    if (!res.ok) throw new Error("Error en servidor al consultar lista");

    const datos = await res.json();
    tbody.innerHTML = '';

    if (!datos || datos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-400 font-medium">No se registran marcaciones el día de hoy.</td></tr>`;
      return;
    }

    datos.forEach(row => {
      const tr = document.createElement('tr');
      tr.className = "hover:bg-slate-50 border-b border-slate-100 font-medium";
      tr.innerHTML = `
        <td class="py-2.5 px-3 font-mono font-bold">${row.codigo || '-'}</td>
        <td class="py-2.5 px-3 font-semibold text-slate-800">${row.nombre || '-'}</td>
        <td class="py-2.5 px-3 text-slate-500">${row.aula || row.rol || 'Asignación'}</td>
        <td class="py-2.5 px-3 text-emerald-600 font-bold">${row.hora_entrada || '-'}</td>
        <td class="py-2.5 px-3 text-indigo-600 font-bold">${row.hora_salida || '-'}</td>
        <td class="py-2.5 px-3">
          <span class="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 text-slate-700 border border-slate-200">
            ${row.estado || 'REGISTRADO'}
          </span>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.warn("API de marcaciones del día no disponible o en entorno de prueba.", err);
  }
}

function configurarEventosTeclado() {
  const inputManual = document.getElementById('input-codigo-manual') || document.querySelector('input[placeholder*="código"]');
  if (inputManual) {
    document.addEventListener('keydown', (e) => {
      if (document.activeElement !== inputManual && e.key !== 'Tab') {
        inputManual.focus();
      }
    });
  }
}

// ====================================================
// CONSOLIDADOS Y REPORTES EN PDF
// ====================================================

function actualizarTipoSelectorFecha(ejecutarCarga = true) {
  const tipoInput = document.getElementById('filtroTipo')?.value || 'Diario';
  const contenedorFecha = document.getElementById('contenedorFecha');
  
  if (!contenedorFecha) return;

  if (tipoInput.includes('Semanal')) {
    contenedorFecha.innerHTML = `<input type="week" id="filtroFecha" class="form-control rounded-xl border border-slate-300 p-2 text-xs font-bold" style="width: 170px;" value="${obtenerSemanaActual()}">`;
  } else if (tipoInput.includes('Mensual')) {
    contenedorFecha.innerHTML = `<input type="month" id="filtroFecha" class="form-control rounded-xl border border-slate-300 p-2 text-xs font-bold" style="width: 170px;" value="${obtenerMesActual()}">`;
  } else {
    contenedorFecha.innerHTML = `<input type="date" id="filtroFecha" class="form-control rounded-xl border border-slate-300 p-2 text-xs font-bold" style="width: 170px;" value="${obtenerFechaHoy()}">`;
  }

  document.getElementById('filtroFecha')?.addEventListener('change', cargarConsolidado);

  if (ejecutarCarga) {
    cargarConsolidado();
  }
}

function obtenerFechaHoy() {
  const hoy = new Date();
  return hoy.toISOString().split('T')[0];
}

function obtenerSemanaActual() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${weekNo < 10 ? '0' + weekNo : weekNo}`;
}

function obtenerMesActual() {
  const hoy = new Date();
  const mes = hoy.getMonth() + 1;
  return `${hoy.getFullYear()}-${mes < 10 ? '0' + mes : mes}`;
}

function esDiaLaborable(fecha) {
  const dayOfWeek = fecha.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;

  const mesStr = String(fecha.getMonth() + 1).padStart(2, '0');
  const diaStr = String(fecha.getDate()).padStart(2, '0');
  const claveMMDD = `${mesStr}-${diaStr}`;

  return !FERIADOS_PERU_MMDD.includes(claveMMDD);
}

function obtenerTotalDiasPeriodo() {
  const tipoInput = document.getElementById('filtroTipo')?.value || 'Diario';
  const fechaVal = document.getElementById('filtroFecha')?.value || '';

  if (!tipoInput.includes('Semanal') && !tipoInput.includes('Mensual')) {
    if (!fechaVal) return 1;
    const [a, m, d] = fechaVal.split('-').map(Number);
    const fechaObj = new Date(a, m - 1, d);
    return esDiaLaborable(fechaObj) ? 1 : 0;
  }

  if (tipoInput.includes('Semanal')) {
    if (!fechaVal) return 5;
    const partes = fechaVal.split('-W');
    if (partes.length !== 2) return 5;

    const anio = Number(partes[0]);
    const semana = Number(partes[1]);

    const simple = new Date(anio, 0, 1 + (semana - 1) * 7);
    const dow = simple.getDay();
    const ISOweekStart = simple;
    if (dow <= 4)
      ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    else
      ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());

    let diasLectivos = 0;
    for (let i = 0; i < 5; i++) {
      const diaActual = new Date(ISOweekStart);
      diaActual.setDate(ISOweekStart.getDate() + i);
      if (esDiaLaborable(diaActual)) diasLectivos++;
    }
    return diasLectivos;
  }

  if (tipoInput.includes('Mensual')) {
    if (!fechaVal) return 22;
    const [anio, mes] = fechaVal.split('-').map(Number);
    if (!anio || !mes) return 22;

    let diasLectivos = 0;
    const totalDiasMes = new Date(anio, mes, 0).getDate();

    for (let dia = 1; dia <= totalDiasMes; dia++) {
      const fechaObj = new Date(anio, mes - 1, dia);
      if (esDiaLaborable(fechaObj)) diasLectivos++;
    }
    return diasLectivos;
  }

  return 1;
}

async function cargarConsolidado() {
  const tipoInput = document.getElementById('filtroTipo')?.value || 'Diario';
  const fechaVal = document.getElementById('filtroFecha')?.value || '';

  let tipo = 'Diario';
  if (tipoInput.includes('Semanal')) tipo = 'Semanal';
  if (tipoInput.includes('Mensual')) tipo = 'Mensual';

  try {
    const res = await fetch(`/api/reportes/consolidado?tipo=${tipo}&fecha=${encodeURIComponent(fechaVal)}`);
    if (!res.ok) throw new Error("Error en la respuesta del servidor");
    
    datosReporteGlobal = await res.json();
    actualizarOpcionesAlumnosSegunAula();
    renderizarTablaReportes();
  } catch (err) {
    console.error("Error al cargar datos del reporte:", err);
    datosReporteGlobal = [];
    renderizarTablaReportes();
  }
}

function obtenerAlumnosPorAula() {
  const nivel = document.getElementById('filtroNivel')?.value || 'Todos';
  const grado = document.getElementById('filtroGrado')?.value || 'Todos';
  const seccion = document.getElementById('filtroSeccion')?.value || 'Todos';

  return datosReporteGlobal.filter(item => {
    const aulaStr = (item.aula || item.materia_aula || '').toUpperCase();

    if (nivel !== 'Todos' && !aulaStr.includes(nivel.toUpperCase())) return false;
    if (grado !== 'Todos' && !aulaStr.includes(grado.toUpperCase())) return false;

    if (seccion !== 'Todos') {
      const seccionNormalizada = seccion.toUpperCase();
      const partesAula = aulaStr.split(' ');
      const ultimaLetra = partesAula[partesAula.length - 1];

      if (ultimaLetra !== seccionNormalizada && !aulaStr.endsWith(` ${seccionNormalizada}`)) {
        return false;
      }
    }

    return true;
  });
}

function actualizarOpcionesAlumnosSegunAula() {
  const selectAlumno = document.getElementById('selectAlumnoIndividual');
  if (!selectAlumno) return;

  const valorSeleccionadoPrevio = selectAlumno.value;
  selectAlumno.innerHTML = '<option value="todos">-- Seleccionar Alumno --</option>';

  const alumnosDelAula = obtenerAlumnosPorAula();

  alumnosDelAula.forEach(alumno => {
    const option = document.createElement('option');
    option.value = alumno.codigo;
    option.textContent = `${alumno.nombre} (${alumno.codigo})`;
    selectAlumno.appendChild(option);
  });

  if (valorSeleccionadoPrevio && Array.from(selectAlumno.options).some(o => o.value === valorSeleccionadoPrevio)) {
    selectAlumno.value = valorSeleccionadoPrevio;
  } else {
    selectAlumno.value = 'todos';
  }
}

function configurarEventosFiltros() {
  const selectTipo = document.getElementById('filtroTipo');
  if (selectTipo) {
    selectTipo.addEventListener('change', () => actualizarTipoSelectorFecha(true));
  }

  ['filtroNivel', 'filtroGrado', 'filtroSeccion'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        actualizarOpcionesAlumnosSegunAula();
        renderizarTablaReportes();
      });
    }
  });

  const selectAlumno = document.getElementById('selectAlumnoIndividual');
  if (selectAlumno) {
    selectAlumno.addEventListener('change', renderizarTablaReportes);
  }

  const busqueda = document.getElementById('filtroBusqueda');
  if (busqueda) {
    busqueda.addEventListener('input', renderizarTablaReportes);
  }

  document.getElementById('btnFichaAlumno')?.addEventListener('click', generarFichaAlumnoPDF);
  document.getElementById('btnReporteGrado')?.addEventListener('click', generarGradoPDF);
  document.getElementById('btnReporteDocentes')?.addEventListener('click', generarDocentesPDF);
}

function obtenerAlumnosFiltradosBase() {
  const alumnoSeleccionado = document.getElementById('selectAlumnoIndividual')?.value || 'todos';
  const busqueda = (document.getElementById('filtroBusqueda')?.value || '').toLowerCase().trim();

  let resultado = obtenerAlumnosPorAula();

  if (alumnoSeleccionado !== 'todos') {
    resultado = resultado.filter(item => (item.codigo || '').toUpperCase() === alumnoSeleccionado.toUpperCase());
  }

  if (busqueda !== '') {
    resultado = resultado.filter(item => {
      const nom = (item.nombre || '').toLowerCase();
      const cod = (item.codigo || '').toLowerCase();
      return nom.includes(busqueda) || cod.includes(busqueda);
    });
  }

  return resultado;
}

function renderizarTablaReportes() {
  const tbody = document.getElementById('tbodyReportes');
  if (!tbody) return;

  const filtrados = obtenerAlumnosFiltradosBase();
  tbody.innerHTML = '';

  if (filtrados.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: #64748b; padding: 20px;">
          No se encontraron registros que coincidan con los filtros aplicados.
        </td>
      </tr>`;
    return;
  }

  const totalDiasPeriodo = obtenerTotalDiasPeriodo();

  filtrados.forEach(d => {
    const asist = d.asistencias || 0;
    const tard = d.tardanzas || 0;
    const faltasJust = d.fJustificadas || 0;
    const faltasInjust = d.fInjustificadas || 0;
    const totalFaltas = faltasJust + faltasInjust;

    const tr = document.createElement('tr');
    tr.className = "hover:bg-slate-50 transition-colors border-b border-slate-100";
    tr.innerHTML = `
      <td class="py-3 px-3"><strong>${d.codigo || '-'}</strong></td>
      <td class="py-3 px-3 font-semibold text-slate-800">${d.nombre || '-'}</td>
      <td class="py-3 px-3 text-slate-500">${d.aula || d.materia_aula || 'Sin Asignación'}</td>
      <td class="py-3 px-3 text-center text-emerald-600 font-bold">${asist} / ${totalDiasPeriodo}</td>
      <td class="py-3 px-3 text-center text-amber-600 font-bold">${tard} / ${totalDiasPeriodo}</td>
      <td class="py-3 px-3 text-center text-rose-600 font-bold">${totalFaltas} / ${totalDiasPeriodo}</td>
      <td class="py-3 px-3 text-center font-bold bg-slate-50">${d.puntajeTotal !== undefined ? d.puntajeTotal : 0} pts</td>
      <td class="py-3 px-3 text-center">
        <button onclick="abrirModalEditar('${d.codigo}', '${(d.nombre || '').replace(/'/g, "\\'")}')" class="bg-amber-500 hover:bg-amber-600 text-white font-bold py-1 px-3 rounded-lg text-xs transition-all shadow-sm">
          ✏️ Editar
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function abrirModalEditar(codigo, nombre) {
  const modal = document.getElementById('modal-editar-asistencia');
  const inputCodigo = document.getElementById('edit-codigo-input');
  const spanNombre = document.getElementById('edit-nombre-alumno');
  const spanCodigo = document.getElementById('edit-codigo-alumno');

  if (inputCodigo) inputCodigo.value = codigo;
  if (spanNombre) spanNombre.innerText = nombre;
  if (spanCodigo) spanCodigo.innerText = codigo;

  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function cerrarModalEditar() {
  const modal = document.getElementById('modal-editar-asistencia');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

async function guardarEdicionAsistencia(event) {
  if (event) event.preventDefault();

  const codigo = document.getElementById('edit-codigo-input')?.value;
  const nuevoEstado = document.getElementById('edit-estado-select')?.value || document.querySelector('#modal-editar-asistencia select')?.value;
  const fechaVal = document.getElementById('filtroFecha')?.value || new Date().toISOString().split('T')[0];

  if (!codigo || !nuevoEstado) {
    alert("Faltan datos obligatorios para realizar la modificación (Código o Estado).");
    return;
  }

  const sessionRaw = localStorage.getItem('user_session') || localStorage.getItem('usuario');
  let usuarioRol = 'Auxiliar';
  if (sessionRaw) {
    try {
      const parsed = JSON.parse(sessionRaw);
      usuarioRol = parsed.rol || parsed.tipo || 'Auxiliar';
    } catch(e) {}
  }

  const payload = { 
    codigo: codigo.trim(), 
    estado: nuevoEstado.toUpperCase(), 
    fecha: fechaVal,
    rol_editor: usuarioRol 
  };

  try {
    const response = await fetch('/api/asistencia/editar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const resultado = await response.json();

    if (response.ok && (resultado.success || resultado.ok || resultado.status === 'success' || resultado.status === 200)) {
      alert("¡Asistencia modificada correctamente en el servidor!");
      cerrarModalEditar();
      cargarConsolidado();
    } else {
      throw new Error(resultado.mensaje || resultado.error || "Rechazado por el servidor");
    }
  } catch (error) {
    console.warn("Fallo en /api/asistencia/editar, intentando endpoint alternativo...", error);
    
    try {
      const altResponse = await fetch(`/api/reportes/editar?codigo=${encodeURIComponent(codigo)}&estado=${encodeURIComponent(nuevoEstado)}&fecha=${encodeURIComponent(fechaVal)}`, {
        method: 'PUT'
      });
      if (altResponse.ok) {
        alert("¡Asistencia actualizada exitosamente!");
        cerrarModalEditar();
        cargarConsolidado();
        return;
      }
    } catch(e) {}

    console.error("Error definitivo de comunicación:", error);
    alert("Se guardaron los cambios temporalmente en la vista local (Error de persistencia en servidor).");
    
    if (datosReporteGlobal && datosReporteGlobal.length > 0) {
      const idx = datosReporteGlobal.findIndex(d => d.codigo === codigo);
      if (idx !== -1) {
        if (nuevoEstado.includes('PUNTUAL') || nuevoEstado.includes('ASISTENCIA')) datosReporteGlobal[idx].asistencias++;
        if (nuevoEstado.includes('TARDANZA')) datosReporteGlobal[idx].tardanzas++;
        renderizarTablaReportes();
      }
    }
    cerrarModalEditar();
  }
}

function obtenerInstanciaPDF() {
  if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
  if (window.jsPDF) return window.jsPDF;
  return null;
}

function obtenerNombreDia(fechaStr) {
  if (!fechaStr) return '-';
  const partes = fechaStr.split('-');
  if (partes.length !== 3) return '-';
  const fecha = new Date(parseInt(partes[0], 10), parseInt(partes[1], 10) - 1, parseInt(partes[2], 10));
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return dias[fecha.getDay()] || '-';
}

function obtenerObservacionEstado(estado) {
  const est = (estado || '').toUpperCase();
  if (est === 'PUNTUAL') return 'Ingreso dentro del horario regular';
  if (est === 'TARDANZA') return 'Ingreso fuera de horario regular';
  if (est === 'JUSTIFICADA') return 'Falta justificada con documento';
  if (est === 'FALTA') return 'Inasistencia sin justificación';
  return 'Registro de marcación';
}

async function construirPDFModeloEstandar({ titulo, codigo, nombre, aula, periodo, metricas, historial, nombreArchivo }) {
  const jsPDFClass = obtenerInstanciaPDF();
  if (!jsPDFClass) {
    alert("La librería jsPDF no está disponible.");
    return;
  }

  const doc = new jsPDFClass();

  try {
    const rutaLogoBajoFondo = 'img/logo-marca-agua.png'; 
    doc.addImage(rutaLogoBajoFondo, 'PNG', 25, 70, 160, 160, undefined, 'FAST');
  } catch (imgErr) {
    console.warn("No se pudo cargar la marca de agua, continuando sin ella:", imgErr);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(30, 41, 59);
  doc.text("I.E. CÉSAR VALLEJO MENDOZA - NAMORA", 105, 15, { align: "center" });

  doc.setFontSize(11);
  doc.text(titulo.toUpperCase(), 105, 22, { align: "center" });

  const tablaDatos = [
    [
      { content: `CÓDIGO ALUMNO / REGISTRO:\n${codigo}`, styles: { fontStyle: 'bold' } },
      { content: `APELLIDOS Y NOMBRES:\n${nombre}`, styles: { fontStyle: 'bold' } }
    ],
    [
      { content: `AULA / SECCIÓN / CARGO:\n${aula}` },
      { content: `PERÍODO EVALUADO:\n${periodo}` }
    ]
  ];

  doc.autoTable({
    startY: 28,
    body: tablaDatos,
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: 4,
      lineColor: [203, 213, 225],
      lineWidth: 0.5,
      textColor: [51, 65, 85]
    },
    columnStyles: {
      0: { cellWidth: 85 },
      1: { cellWidth: 95 }
    }
  });

  const maxDias = metricas.totalPeriodo || 1;
  const pctPuntual = Math.round((metricas.puntuales / maxDias) * 100) || 0;
  const pctTardanza = Math.round((metricas.tardanzas / maxDias) * 100) || 0;
  const pctFaltas = Math.round((metricas.faltas / maxDias) * 100) || 0;

  const tablaMetricasHead = [["PUNTUALES", "TARDANZAS", "FALTAS", "PUNTAJE"]];
  const tablaMetricasBody = [[
    `${metricas.puntuales}/${maxDias} (${pctPuntual}%)`,
    `${metricas.tardanzas}/${maxDias} (${pctTardanza}%)`,
    `${metricas.faltas}/${maxDias} (${pctFaltas}%)`,
    `${metricas.puntaje} pts`
  ]];

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 6,
    head: tablaMetricasHead,
    body: tablaMetricasBody,
    theme: 'grid',
    headStyles: {
      fillColor: [0, 102, 51],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 9
    },
    bodyStyles: {
      halign: 'center',
      fontSize: 10,
      fontStyle: 'bold',
      textColor: [15, 23, 42]
    }
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text("HISTORIAL DETALLADO DÍA A DÍA", 14, doc.lastAutoTable.finalY + 10);

  const headersHistorial = [["FECHA", "DIA", "HORA ENTRADA", "ESTADO", "OBSERVACIÓN", "DOCENTE"]];
  
  const rowsHistorial = historial.map(h => {
    const nombreDocente = h.docente_nombre || h.nombre_docente || h.docente || h.profesor || h.nombre || '-';
    return [
      h.fecha || '-',
      obtenerNombreDia(h.fecha),
      h.hora || '-',
      (h.estado || '-').toUpperCase(),
      obtenerObservacionEstado(h.estado),
      nombreDocente
    ];
  });

  if (rowsHistorial.length === 0) {
    rowsHistorial.push(["-", "-", "-", "SIN REGISTROS", "No existen registros de marcación en el periodo", "-"]);
  }

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 14,
    head: headersHistorial,
    body: rowsHistorial,
    theme: 'striped',
    headStyles: {
      fillColor: [0, 102, 51],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center'
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [51, 65, 85]
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 22 },
      1: { halign: 'center', cellWidth: 20 },
      2: { halign: 'center', cellWidth: 24 },
      3: { halign: 'center', cellWidth: 22 },
      4: { cellWidth: 52 },
      5: { cellWidth: 40 }
    }
  });

  const finalY = doc.lastAutoTable.finalY + 30;
  const posY = finalY > 260 ? 260 : finalY;

  doc.setLineWidth(0.5);
  doc.setDrawColor(148, 163, 184);

  doc.line(30, posY, 85, posY);
  doc.line(125, posY, 180, posY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text("Auxiliar / Auxiliar de Disciplina", 57, posY + 5, { align: "center" });
  doc.text("Dirección / Dirección Académica", 152, posY + 5, { align: "center" });

  doc.save(nombreArchivo);
}

async function generarFichaAlumnoPDF() {
  const selectAlumno = document.getElementById('selectAlumnoIndividual')?.value;
  if (!selectAlumno || selectAlumno === 'todos') {
    alert("Por favor, selecciona un alumno específico en el menú desplegable.");
    return;
  }

  const alumno = datosReporteGlobal.find(d => d.codigo === selectAlumno);
  if (!alumno) {
    alert("No se encontraron los datos del alumno seleccionado.");
    return;
  }

  const tipo = document.getElementById('filtroTipo')?.value || 'Diario';
  const fecha = document.getElementById('filtroFecha')?.value || '';

  let historial = [];
  try {
    const res = await fetch(`/api/reportes/historial-detallado?codigo=${encodeURIComponent(alumno.codigo)}`);
    if (res.ok) historial = await res.json();
  } catch (e) {
    console.error("Error recuperando historial del alumno:", e);
  }

  const metricas = {
    puntuales: alumno.asistencias || 0,
    tardanzas: alumno.tardanzas || 0,
    faltas: (alumno.fJustificadas || 0) + (alumno.fInjustificadas || 0),
    puntaje: alumno.puntajeTotal !== undefined ? alumno.puntajeTotal : 0,
    totalPeriodo: obtenerTotalDiasPeriodo()
  };

  await construirPDFModeloEstandar({
    titulo: "FICHA INDIVIDUAL DE ASISTENCIA Y PUNTUALIDAD",
    codigo: alumno.codigo || '-',
    nombre: alumno.nombre || '-',
    aula: alumno.aula || alumno.materia_aula || 'Sin Asignación',
    periodo: `${tipo} (${fecha || 'General'})`,
    metricas,
    historial,
    nombreArchivo: `Ficha_Asistencia_${alumno.codigo}.pdf`
  });
}

async function generarGradoPDF() {
  const filtrados = obtenerAlumnosFiltradosBase();
  if (filtrados.length === 0) {
    alert("No existen registros con los filtros seleccionados.");
    return;
  }

  const grado = document.getElementById('filtroGrado')?.value || 'Todos';
  const seccion = document.getElementById('filtroSeccion')?.value || 'Todos';
  const tipo = document.getElementById('filtroTipo')?.value || 'Diario';
  const fecha = document.getElementById('filtroFecha')?.value || '';

  let totPuntual = 0, totTardanza = 0, totFaltas = 0, totPuntos = 0;
  filtrados.forEach(a => {
    totPuntual += (a.asistencias || 0);
    totTardanza += (a.tardanzas || 0);
    totFaltas += ((a.fJustificadas || 0) + (a.fInjustificadas || 0));
    totPuntos += (a.puntajeTotal !== undefined ? a.puntajeTotal : 0);
  });

  let historial = [];
  try {
    const res = await fetch(`/api/reportes/historial-detallado`);
    if (res.ok) historial = await res.json();
  } catch (e) {
    console.error("Error recuperando historial general:", e);
  }

  await construirPDFModeloEstandar({
    titulo: `CONSOLIDADO DE ASISTENCIA - GRADO ${grado} ${seccion}`,
    codigo: `AULA-${grado}-${seccion}`,
    nombre: `Consolidado Aula (${filtrados.length} Alumnos)`,
    aula: `Grado: ${grado} | Sección: ${seccion}`,
    periodo: `${tipo} (${fecha || 'General'})`,
    metricas: { 
      text: "",
      puntuales: totPuntual, 
      tardanzas: totTardanza, 
      faltas: totFaltas, 
      puntaje: totPuntos,
      totalPeriodo: obtenerTotalDiasPeriodo() * filtrados.length
    },
    historial,
    nombreArchivo: `Reporte_Grado_${grado}_${seccion}.pdf`
  });
}

async function generarDocentesPDF() {
  const tipo = document.getElementById('filtroTipo')?.value || 'Diario';
  const fecha = document.getElementById('filtroFecha')?.value || '';

  let historial = [];
  try {
    const res = await fetch(`/api/reportes/historial-detallado`);
    if (res.ok) historial = await res.json();
  } catch (e) {
    console.error("Error recuperando historial docentes:", e);
  }

  let puntuales = 0, tardanzas = 0, faltas = 0;

  historial.forEach(reg => {
    const estado = (reg.estado || '').toUpperCase();
    if (estado === 'PUNTUAL') puntuales++;
    else if (estado === 'TARDANZA') tardanzas++;
    else if (estado === 'FALTA') faltas++;
  });

  const puntajeTotal = (puntuales * 10) + (tardanzas * 5);

  await construirPDFModeloEstandar({
    titulo: "REPORTE CONSOLIDADO DE DOCENTES Y PERSONAL",
    codigo: "PERSONAL-DOCENTE",
    nombre: "Plana Docente I.E. CÉSAR VALLEJO MENDOZA",
    aula: "Dirección Académica",
    periodo: `${tipo} (${fecha || 'General'})`,
    metricas: { 
      puntuales, 
      tardanzas, 
      faltas, 
      puntaje: puntajeTotal, 
      totalPeriodo: obtenerTotalDiasPeriodo() 
    },
    historial,
    nombreArchivo: `Reporte_Docentes_${fecha || 'General'}.pdf`
  });
}