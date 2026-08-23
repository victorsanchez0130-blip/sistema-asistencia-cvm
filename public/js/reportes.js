// Variable global para almacenar los datos del consolidado recuperados de la API
let datosReporteGlobal = [];

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

document.addEventListener('DOMContentLoaded', () => {
  configurarEventosFiltros();
  // Se envía 'false' para evitar ejecuciones innecesarias al inicializar
  actualizarTipoSelectorFecha(false);
  cargarConsolidado();

  // Escuchar el envío del formulario del modal si existe
  const formEditar = document.getElementById('form-editar-asistencia') || document.querySelector('#modal-editar-asistencia form');
  if (formEditar) {
    formEditar.addEventListener('submit', guardarEdicionAsistencia);
  }
});

// ----------------------------------------------------
// CAMBIO DINÁMICO DEL INPUT DE FECHA Y CÁLCULO DE DÍAS
// ----------------------------------------------------

function actualizarTipoSelectorFecha(ejecutarCarga = true) {
  const tipoInput = document.getElementById('filtroTipo')?.value || 'Diario';
  const contenedorFecha = document.getElementById('contenedorFecha');
  
  if (!contenedorFecha) return;

  if (tipoInput.includes('Semanal')) {
    contenedorFecha.innerHTML = `<input type="week" id="filtroFecha" class="form-control" style="width: 170px;" value="${obtenerSemanaActual()}">`;
  } else if (tipoInput.includes('Mensual')) {
    contenedorFecha.innerHTML = `<input type="month" id="filtroFecha" class="form-control" style="width: 170px;" value="${obtenerMesActual()}">`;
  } else {
    contenedorFecha.innerHTML = `<input type="date" id="filtroFecha" class="form-control" style="width: 170px;" value="${obtenerFechaHoy()}">`;
  }

  // Reasignar el evento change al nuevo elemento dinámico
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

/**
 * Verifica si una fecha dada en formato Date es un día laborable (Lunes a Viernes y NO feriado)
 */
function esDiaLaborable(fecha) {
  const dayOfWeek = fecha.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;

  const mesStr = String(fecha.getMonth() + 1).padStart(2, '0');
  const diaStr = String(fecha.getDate()).padStart(2, '0');
  const claveMMDD = `${mesStr}-${diaStr}`;

  return !FERIADOS_PERU_MMDD.includes(claveMMDD);
}

/**
 * Retorna el número exacto de días lectivos del periodo descartando fines de semana y feriados.
 */
function obtenerTotalDiasPeriodo() {
  const tipoInput = document.getElementById('filtroTipo')?.value || 'Diario';
  const fechaVal = document.getElementById('filtroFecha')?.value || '';

  // 1. REPORTE DIARIO
  if (!tipoInput.includes('Semanal') && !tipoInput.includes('Mensual')) {
    if (!fechaVal) return 1;
    const [a, m, d] = fechaVal.split('-').map(Number);
    const fechaObj = new Date(a, m - 1, d);
    return esDiaLaborable(fechaObj) ? 1 : 0;
  }

  // 2. REPORTE SEMANAL
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
      if (esDiaLaborable(diaActual)) {
        diasLectivos++;
      }
    }
    return diasLectivos;
  }

  // 3. REPORTE MENSUAL
  if (tipoInput.includes('Mensual')) {
    if (!fechaVal) return 22;
    
    const [anio, mes] = fechaVal.split('-').map(Number);
    if (!anio || !mes) return 22;

    let diasLectivos = 0;
    const totalDiasMes = new Date(anio, mes, 0).getDate();

    for (let dia = 1; dia <= totalDiasMes; dia++) {
      const fechaObj = new Date(anio, mes - 1, dia);
      if (esDiaLaborable(fechaObj)) {
        diasLectivos++;
      }
    }
    return diasLectivos;
  }

  return 1;
}

// ----------------------------------------------------
// CARGA Y CONSULTA DE DATOS DESDE EL SERVIDOR
// ----------------------------------------------------

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
    // Normalizamos quitando espacios extraños al inicio/final
    const aulaStr = (item.aula || item.materia_aula || '').toUpperCase().trim();

    // 1. Validar Nivel (ej. "SECUNDARIA")
    if (nivel !== 'Todos' && !aulaStr.includes(nivel.toUpperCase())) return false;
    
    // 2. Validar Grado (ej. "5TO")
    if (grado !== 'Todos' && !aulaStr.includes(grado.toUpperCase())) return false;

    // 3. CORRECCIÓN DEFINITIVA PARA LA SECCIÓN:
    // En lugar de usar .includes(), validamos que la cadena termine exactamente en la sección
    // Ejemplo: "SECUNDARIA 5TO B" termina en "B", "SECUNDARIA 5TO A" termina en "A".
    if (seccion !== 'Todos') {
      const seccionNormalizada = seccion.toUpperCase().trim();
      // Verificamos si termina en " A", " B", " C", etc. para evitar confundirse con letras internas de "Secundaria"
      if (!aulaStr.endsWith(" " + seccionNormalizada)) {
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

  document.getElementById('btn-guardar-edicion')?.addEventListener('click', guardarEdicionAsistencia);
}

// ----------------------------------------------------
// FILTRADO Y RENDERIZADO EN TABLA HTML
// ----------------------------------------------------

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
    tr.innerHTML = `
      <td><strong>${d.codigo || '-'}</strong></td>
      <td>${d.nombre || '-'}</td>
      <td>${d.aula || d.materia_aula || 'Sin Asignación'}</td>
      <td style="text-align: center; color: #16a34a; font-weight: bold;">${asist} / ${totalDiasPeriodo}</td>
      <td style="text-align: center; color: #d97706; font-weight: bold;">${tard} / ${totalDiasPeriodo}</td>
      <td style="text-align: center; color: #dc2626; font-weight: bold;">${totalFaltas} / ${totalDiasPeriodo}</td>
      <td style="text-align: center; font-weight: bold; background-color: #f8fafc;">${d.puntajeTotal !== undefined ? d.puntajeTotal : 0} pts</td>
      <td style="text-align: center;">
        <button onclick="abrirModalEditar('${d.codigo}', '${(d.nombre || '').replace(/'/g, "\\'")}')" style="background: #f59e0b; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 11px;">
          ✏️ Editar
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ----------------------------------------------------
// CONTROLADOR DE EDICIÓN DIRECTIVA (MODAL)
// ----------------------------------------------------

function abrirModalEditar(codigo, nombre) {
  const modal = document.getElementById('modal-editar-asistencia');
  const inputCodigo = document.getElementById('edit-codigo-input');
  const spanNombre = document.getElementById('edit-nombre-alumno') || document.querySelector('.modal text-slate-800');
  const spanCodigo = document.getElementById('edit-codigo-alumno');

  if (inputCodigo) inputCodigo.value = codigo;
  if (spanNombre) spanNombre.innerText = nombre;
  if (spanCodigo) spanCodigo.innerText = codigo;

  if (modal) {
    modal.style.display = 'flex';
    modal.classList.remove('hidden');
  }
}

function cerrarModalEditar() {
  const modal = document.getElementById('modal-editar-asistencia');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.add('hidden');
  }
}

async function guardarEdicionAsistencia(event) {
  if (event) event.preventDefault();

  const codigo = document.getElementById('edit-codigo-input')?.value;
  const nuevoEstado = document.getElementById('edit-estado-select')?.value || document.querySelector('#modal-editar-asistencia select')?.value;
  const fechaVal = document.getElementById('filtroFecha')?.value || obtenerFechaHoy();

  if (!codigo || !nuevoEstado) {
    alert("Faltan datos obligatorios para realizar la modificación.");
    return;
  }

  try {
    // CORRECCIÓN: Cambiar '/api/asistencia/manual' por '/api/asistencia/editar' 
    // y la propiedad 'usuario_codigo' por 'codigo' para que coincida con el servidor.
    const response = await fetch('/api/asistencia/editar', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-user-rol': 'admin' // Envía los permisos requeridos por el middleware del servidor
      },
      body: JSON.stringify({ 
        codigo: codigo,          // <- Corregido de usuario_codigo a codigo
        estado: nuevoEstado, 
        fecha: fechaVal 
      })
    });

    if (!response.ok) {
      throw new Error(`Código de respuesta de error del servidor: ${response.status}`);
    }

    const resultado = await response.json();

    if (resultado.success) {
      alert("¡Asistencia actualizada correctamente!");
      cerrarModalEditar();
      cargarConsolidado();
    } else {
      alert("Error al actualizar: " + (resultado.mensaje || "No se pudo completar la acción."));
    }
  } catch (error) {
    console.error("Error crítico de red/conexión al guardar asistencia:", error);
    alert("Error de conexión con el servidor. Por favor, asegúrate de que el backend esté encendido.");
  }
}

// ----------------------------------------------------
// GENERACIÓN DE REPORTES EN PDF (CON MARCA DE AGUA CORREGIDA)
// ----------------------------------------------------

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

function cargarImagenLogoAsync(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = url;
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
  });
}

async function construirPDFModeloEstandar({ titulo, codigo, nombre, aula, periodo, metricas, historial, nombreArchivo }) {
  const jsPDFClass = obtenerInstanciaPDF();
  if (!jsPDFClass) {
    alert("La librería jsPDF no está disponible.");
    return;
  }

  const doc = new jsPDFClass();

  let imgLogoLoaded = null;
  let imgFirmaDireccionLoaded = null;
  let imgFirmaAuxiliarLoaded = null; // Opcional por si agregas la del auxiliar luego

  try {
    // Precargar imágenes en paralelo
    const [logo, firmaDir, firmaAux] = await Promise.all([
      cargarImagenLogoAsync('img/logo.png'),
      cargarImagenLogoAsync('img/firma_direccion.png'), // Ruta de la firma de Dirección
      cargarImagenLogoAsync('img/firma_auxiliar.png').catch(() => null) // Opcional
    ]);
    imgLogoLoaded = logo;
    imgFirmaDireccionLoaded = firmaDir;
    imgFirmaAuxiliarLoaded = firmaAux;
  } catch (imgErr) {
    console.warn("No se pudieron precargar las imágenes:", imgErr);
  }

  const pintarFondoMarcaAgua = () => {
    if (imgLogoLoaded) {
      doc.saveGraphicsState();
      const opacityState = new doc.GState({ opacity: 0.15 });
      doc.setGState(opacityState);
      doc.addImage(imgLogoLoaded, 'PNG', 25, 70, 160, 160, undefined, 'FAST');
      doc.restoreGraphicsState();
    }
  };

  pintarFondoMarcaAgua();

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
      cellPadding: 3,
      lineColor: [203, 213, 225],
      lineWidth: 0.5,
      textColor: [51, 65, 85],
      fillColor: false
    },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 92 }
    }
  });

  const maxDias = metricas.totalPeriodo || 1;
  const pctPuntual = Math.round((metricas.puntuales / maxDias) * 100);
  const pctTardanza = Math.round((metricas.tardanzas / maxDias) * 100);
  const pctFaltas = Math.round((metricas.faltas / maxDias) * 100);

  const tablaMetricasHead = [["PUNTUALES", "TARDANZAS", "FALTAS", "PUNTAJE"]];
  const tablaMetricasBody = [[
    `${metricas.puntuales}/${maxDias} (${pctPuntual}%)`,
    `${metricas.tardanzas}/${maxDias} (${pctTardanza}%)`,
    `${metricas.faltas}/${maxDias} (${pctFaltas}%)`,
    `${metricas.puntaje} pts`
  ]];

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 5,
    head: tablaMetricasHead,
    body: tablaMetricasBody,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 9
    },
    bodyStyles: {
      halign: 'center',
      fontSize: 9,
      fontStyle: 'bold',
      textColor: [15, 23, 42],
      fillColor: false
    }
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text("HISTORIAL DETALLADO DÍA A DÍA", 14, doc.lastAutoTable.finalY + 8);

  const headersHistorial = [["FECHA", "DÍA", "NOMBRES", "H. ENTRADA", "H. SALIDA", "ESTADO", "OBSERVACIÓN"]];
  
  const rowsHistorial = historial.map(h => {
    const estadoLimpio = (h.estado || '').toUpperCase();
    let entradaDisplay = h.hora || h.hora_entrada || '-';
    let salidaDisplay = h.hora_salida || h.salida;

    if (estadoLimpio === 'PUNTUAL' || estadoLimpio === 'TARDANZA') {
      // Si la salida está vacía, o es igual a la hora de entrada, la forzamos a 13:10:00
      if (!salidaDisplay || salidaDisplay === '-' || salidaDisplay === 'null' || salidaDisplay === '00:00:00' || salidaDisplay === entradaDisplay) {
        salidaDisplay = '13:10:00';
      }
    } else if (estadoLimpio === 'FALTA' || estadoLimpio === 'INJUSTIFICADA' || entradaDisplay === '-' || entradaDisplay === '00:00:00') {
      entradaDisplay = 'FALTA';
      salidaDisplay = 'FALTA';
    } else {
      if (!salidaDisplay) salidaDisplay = '-';
    }

    return [
      h.fecha || '-',
      obtenerNombreDia(h.fecha),
      h.nombre || h.alumno || nombre || '-',
      entradaDisplay,
      salidaDisplay, // <--- Ahora dirá 13:10:00 correctamente
      estadoLimpio,
      obtenerObservacionEstado(h.estado)
    ];
  });

  if (rowsHistorial.length === 0) {
    rowsHistorial.push(["-", "-", "FALTA", "FALTA", "SIN REGISTROS", "No existen registros en el periodo"]);
  }

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 12,
    head: headersHistorial,
    body: rowsHistorial,
    theme: 'striped',
    tableWidth: 'auto',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
      valign: 'middle'
    },
    styles: {
      fontSize: 7.5,
      textColor: [51, 65, 85],
      fillColor: false,
      cellPadding: 2,
      overflow: 'linebreak'
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 20 },
      1: { halign: 'center', cellWidth: 18 },
      2: { halign: 'center', cellWidth: 40 },
      3: { halign: 'center', cellWidth: 20 },
      4: { halign: 'center', cellWidth: 20 },
      5: { halign: 'center', cellWidth: 22 },
      6: { halign: 'left',   cellWidth: 42 }
    },
    didDrawPage: function (data) {
      pintarFondoMarcaAgua();
    }
  });

  // ====================================================
  // POSICIONAMIENTO Y DIBUJO DE FIRMAS
  // ====================================================
  let posY = doc.lastAutoTable.finalY + 30; // Margen para dar espacio a la imagen de la firma

  // Si no hay espacio en la página actual, crea una nueva hoja
  if (posY > 245) {
    doc.addPage();
    pintarFondoMarcaAgua();
    posY = 60; // Posición limpia en la nueva hoja
  }

  // 1. Dibujar Imagen de Firma de Dirección (si cargó correctamente)
  if (imgFirmaDireccionLoaded) {
    // addImage(imagen, formato, x, y, ancho, alto)
    // Se ubica a x: 135 (sobre la línea derecha) y justo encima de posY
    doc.addImage(imgFirmaDireccionLoaded, 'PNG', 135, posY - 22, 40, 20);
  }

  // 2. Dibujar Imagen de Firma de Auxiliar (opcional)
  if (imgFirmaAuxiliarLoaded) {
    doc.addImage(imgFirmaAuxiliarLoaded, 'PNG', 35, posY - 22, 40, 20);
  }

  // 3. Líneas de firma
  doc.setLineWidth(0.4);
  doc.setDrawColor(148, 163, 184);

  doc.line(25, posY, 85, posY);
  doc.line(125, posY, 185, posY);

  // 4. Textos de firma
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text("Auxiliar / Auxiliar de Disciplina", 55, posY + 5, { align: "center" });
  doc.text("Dirección / Dirección Académica", 155, posY + 5, { align: "center" });

  doc.save(nombreArchivo);
}

async function generarFichaAlumnoPDF() {
  const selectAlumno = document.getElementById('selectAlumnoIndividual')?.value;
  if (!selectAlumno || selectAlumno === 'todos') {
    alert("Por favor, selecciona un alumno específico en el menú desplegable.");
    return;
  }

  const alumno = datosReporteGlobal.find(d => String(d.codigo).trim().toUpperCase() === String(selectAlumno).trim().toUpperCase());
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

  let historialGeneral = [];
  try {
    // Intentamos pasar los parámetros de filtro a la API para reducir la carga
    const res = await fetch(`/api/reportes/historial-detallado?tipo=${tipo}&fecha=${encodeURIComponent(fecha)}`);
    if (res.ok) {
      historialGeneral = await res.json();
    } else {
      const resClean = await fetch(`/api/reportes/historial-detallado`);
      if (resClean.ok) historialGeneral = await resClean.json();
    }
  } catch (e) {
    console.error("Error recuperando historial general:", e);
  }

  // =========================================================================
  // FILTRADO ESTRICTO POR AULA Y POR FECHA SELECCIONADA
  // =========================================================================
  const historialFiltrado = historialGeneral.filter(reg => {
    // Si el filtro es Diario, descartamos estrictamente registros de otras fechas
    if (tipo === 'Diario' && fecha && reg.fecha && reg.fecha !== fecha) {
      return false;
    }

    if (grado === 'Todos' && seccion === 'Todos') return true;

    const aulaBuscada = `${grado.toUpperCase()} ${seccion.toUpperCase()}`;
    const campoAula = (reg.aula || '').toUpperCase();
    const campoMateriaAula = (reg.materia_aula || '').toUpperCase();
    const campoGradoSeccionDirecto = `${(reg.grado || '').toUpperCase()} ${(reg.seccion || '').toUpperCase()}`.trim();

    const coincideEnAula = campoAula.includes(aulaBuscada) || 
                          (campoAula.includes(`${grado.toUpperCase()}`) && campoAula.includes(`SECCIÓN: ${seccion.toUpperCase()}`));
                          
    const coincideEnMateria = campoMateriaAula.includes(aulaBuscada);
    const coincideDirecto = campoGradoSeccionDirecto.includes(aulaBuscada);

    return coincideEnAula || coincideEnMateria || coincideDirecto;
  });

  // =========================================================================
  // NUEVO RE-CÁLCULO DE MÉTRICAS BASADO EXCLUSIVAMENTE EN EL HISTORIAL FILTRADO
  // =========================================================================
  let totPuntual = 0, totTardanza = 0, totFaltas = 0, totPuntos = 0;

  historialFiltrado.forEach(reg => {
    const estado = (reg.estado || '').toUpperCase();
    if (estado === 'PUNTUAL') {
      totPuntual++;
      totPuntos += 10; // O el puntaje que asignes por puntualidad
    } else if (estado === 'TARDANZA') {
      totTardanza++;
      totPuntos += 5;  // O el puntaje que asignes por tardanza
    } else if (estado === 'FALTA' || estado === 'INJUSTIFICADA') {
      totFaltas++;
    }
  });

  // El universo total de registros evaluados es la suma de los estados procesados
  const universoTotal = totPuntual + totTardanza + totFaltas;

  await construirPDFModeloEstandar({
    titulo: `CONSOLIDADO DE ASISTENCIA - GRADO ${grado} ${seccion}`,
    codigo: `AULA-${grado}-${seccion}`,
    nombre: `Consolidado Aula (${filtrados.length} Alumnos)`,
    aula: `Grado: ${grado} | Sección: ${seccion}`,
    periodo: `${tipo} (${fecha || 'General'})`,
    metricas: { 
      puntuales: totPuntual, 
      tardanzas: totTardanza, 
      faltas: totFaltas, 
      textPuntaje: totPuntos, // Puntos acumulados en el periodo
      get puntaje() { return totPuntos; },
      totalPeriodo: universoTotal || 1 // Evita división por cero si está vacío
    },
    historial: historialFiltrado,
    nombreArchivo: `Reporte_Grado_${grado}_${seccion}.pdf`
  });
}

async function generarDocentesPDF() {
  const tipo = document.getElementById('filtroTipo')?.value || 'Diario';
  const fecha = document.getElementById('filtroFecha')?.value || '';

  let historialGeneral = [];
  try {
    const res = await fetch(`/api/reportes/historial-detallado`);
    if (res.ok) historialGeneral = await res.json();
  } catch (e) {
    console.error("Error recuperando historial docentes:", e);
  }

  const historialDocentes = historialGeneral.filter(reg => {
    const rolUsuario = (reg.rol || '').toUpperCase();
    return rolUsuario === 'DOCENTE' || rolUsuario === 'Docente' || rolUsuario === 'Director' || rolUsuario === 'Auxiliar';
  });

  let puntuales = 0;
  let tardanzas = 0;
  let faltas = 0;

  historialDocentes.forEach(reg => {
    const fontEstado = (reg.estado || '').toUpperCase();
    
    if (fontEstado === 'PUNTUAL') {
      puntuales++;
    } else if (fontEstado === 'TARDANZA') {
      tardanzas++;
    } else if (fontEstado === 'FALTA') {
      faltas++;
    }
  });

  const puntajeTotal = (puntuales * 10) + (tardanzas * 5);

  await construirPDFModeloEstandar({
    titulo: "REPORTE CONSOLIDADO DE DOCENTES Y PERSONAL",
    codigo: "PERSONAL-DOCENTE",
    nombre: "Plana Docente I.E. CÉSAR VALLEJO MENDOZA",
    aula: "Dirección Académica",
    periodo: `${tipo} (${fecha || 'General'})`,
    metricas: { 
      puntuales: puntuales, 
      tardanzas: tardanzas, 
      faltas: faltas, 
      puntaje: puntajeTotal, 
      totalPeriodo: obtenerTotalDiasPeriodo() 
    },
    historial: historialDocentes,
    nombreArchivo: `Reporte_Docentes_${fecha || 'General'}.pdf`
  });
}