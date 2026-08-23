let listaDocentes = [];
let listaAlumnos = [];
let listaAlumnosFiltradaGlobal = []; // Mantiene la lista en memoria para sincronizar la pantalla y el PDF

document.addEventListener('DOMContentLoaded', cargarRankings);

async function cargarRankings() {
  try {
    const res = await fetch('/api/rankings');
    if (!res.ok) {
      throw new Error('Error al conectar con el servidor de rankings');
    }

    const data = await res.json();

    // Adaptabilidad: soporta múltiples estructuras de respuesta del backend
    const docentesData = data.docentes || data.dataDocentes || (Array.isArray(data) ? data : []);
    const alumnosData = data.alumnos || data.dataAlumnos || [];

    listaDocentes = Array.isArray(docentesData) ? docentesData : [];
    listaAlumnos = Array.isArray(alumnosData) ? alumnosData : [];

    // Renderizar Tabla Docentes
    const tbodyDocentes = document.getElementById('tbodyRankingDocentes');
    if (tbodyDocentes) {
      tbodyDocentes.innerHTML = '';
      if (listaDocentes.length === 0) {
        tbodyDocentes.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400 font-medium">No hay docentes registrados en el ranking</td></tr>';
      } else {
        listaDocentes.forEach((d, index) => {
          const nombre = d.nombre || d.nombre_completo || 'Sin nombre';
          const asignacion = d.asignacion || d.materia || d.area || '-';
          const puntaje = d.puntaje_acumulado || d.puntaje || d.puntos || 0;

          tbodyDocentes.innerHTML += `
            <tr class="border-b border-slate-100 text-xs hover:bg-slate-50">
              <td class="p-3 font-bold text-slate-700">#${index + 1}</td>
              <td class="p-3 font-medium text-slate-800">${nombre}</td>
              <td class="p-3 text-slate-600">${asignacion}</td>
              <td class="p-3 font-bold text-sky-600">${puntaje} pts</td>
            </tr>
          `;
        });
      }
    }

    // Ejecuta la lógica inicial de pintado y filtrado para la tabla de alumnos
    filtrarYRenderizarAlumnos();

  } catch (error) {
    console.error('Error al cargar los rankings:', error);
    const tbodyDocentes = document.getElementById('tbodyRankingDocentes');
    const tbodyAlumnos = document.getElementById('tbodyRankingAlumnos');
    if (tbodyDocentes) tbodyDocentes.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-rose-500 font-medium">Error al cargar datos del servidor</td></tr>';
    if (tbodyAlumnos) tbodyAlumnos.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-rose-500 font-medium">Error al cargar datos del servidor</td></tr>';
  }
}

// NUEVA FUNCIÓN: Filtra la lista en memoria, re-calcula las posiciones de mérito y redibuja la tabla
function filtrarYRenderizarAlumnos() {
  const grado = document.getElementById('filtroGradoRanking')?.value || 'Todos';
  const seccion = document.getElementById('filtroSeccionRanking')?.value || 'Todos';
  const tbodyAlumnos = document.getElementById('tbodyRankingAlumnos');

  if (!tbodyAlumnos) return;

  const gradoUpper = grado.toUpperCase();
  const seccionUpper = seccion.toUpperCase();
  
  // Filtrado de alta precisión buscando coincidencias por columnas separadas o strings agrupados
  listaAlumnosFiltradaGlobal = listaAlumnos.filter(a => {
    if (a.grado !== undefined || a.seccion !== undefined) {
      const cumpleGrado = grado === 'Todos' || String(a.grado || '').toUpperCase().includes(gradoUpper);
      const cumpleSeccion = seccion === 'Todos' || String(a.seccion || '').toUpperCase().trim() === seccionUpper.trim();
      return cumpleGrado && cumpleSeccion;
    }

    const asignacion = (a.asignacion || a.grado || a.aula || '').toUpperCase();
    const cumpleGradoCadena = grado === 'Todos' || asignacion.includes(gradoUpper);
    const cumpleSeccionCadena = seccion === 'Todos' || 
          asignacion.includes(` ${seccionUpper}`) || 
          asignacion.endsWith(seccionUpper);

    return cumpleGradoCadena && cumpleSeccionCadena;
    });

  // Re-ordenamiento descendente estricto por puntaje para que los puestos se asignen bien tras el filtro
  listaAlumnosFiltradaGlobal.sort((x, y) => {
    const ptsX = x.puntaje_acumulado || x.puntaje || x.puntos || 0;
    const ptsY = y.puntaje_acumulado || y.puntaje || y.puntos || 0;
    return ptsY - ptsX;
  });

  tbodyAlumnos.innerHTML = '';
  if (listaAlumnosFiltradaGlobal.length === 0) {
    tbodyAlumnos.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400 font-medium">No hay alumnos registrados para los filtros seleccionados</td></tr>';
    return;
  }

  listaAlumnosFiltradaGlobal.forEach((a, index) => {
    const nombre = a.nombre || a.nombre_completo || 'Sin nombre';
    const asignacion = a.asignacion || a.grado || a.aula || '-';
    const puntaje = a.puntaje_acumulado || a.puntaje || a.puntos || 0;

    tbodyAlumnos.innerHTML += `
      <tr class="border-b border-slate-100 text-xs hover:bg-slate-50">
        <td class="p-3 font-bold text-slate-700">#${index + 1}</td>
        <td class="p-3 font-medium text-slate-800">${nombre}</td>
        <td class="p-3 text-slate-600">${asignacion}</td>
        <td class="p-3 font-bold text-emerald-600">${puntaje} pts</td>
      </tr>
    `;
  });
}

function agregarMembreteInstitucional(doc, titulo) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(14, 42, 71);
  doc.text("I.E. CÉSAR VALLEJO MENDOZA - NAMORA", 105, 15, { align: "center" });

  doc.setFontSize(12);
  doc.setTextColor(71, 85, 105);
  doc.text(titulo, 105, 22, { align: "center" });

  doc.setLineWidth(0.5);
  doc.setDrawColor(226, 232, 240);
  doc.line(14, 26, 196, 26);
}

function preCargarLogoRankings(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = url;
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
  });
}

async function imprimirRankingDocentesPDF() {
  if (listaDocentes.length === 0) {
    alert("No hay datos cargados para generar el ranking.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const imgLogo = await preCargarLogoRankings('img/logo.png');

  agregarMembreteInstitucional(doc, "RANKING OFICIAL DE MÉRITOS - DOCENTES");

  const bodyData = listaDocentes.map((d, index) => [
    `#${index + 1}`,
    d.nombre || d.nombre_completo || 'Sin nombre',
    d.asignacion || d.materia || d.area || '-',
    `${d.puntaje_acumulado || d.puntaje || 0} pts`
  ]);

  doc.autoTable({
    startY: 30,
    head: [['Posición', 'Nombre Completo', 'Materia / Área', 'Puntaje']],
    body: bodyData,
    theme: 'grid',
    headStyles: { 
      fillColor: [0, 102, 51], 
      textColor: [255, 255, 255], 
      fontStyle: 'bold' 
    },
    styles: { 
      fontSize: 8,
      fillColor: false 
    },
    didDrawPage: function (data) {
      if (imgLogo) {
        doc.saveGraphicsState();
        const opacityState = new doc.GState({ opacity: 0.2 });
        doc.setGState(opacityState);
        doc.addImage(imgLogo, 'PNG', 25, 70, 160, 160, undefined, 'FAST');
        doc.restoreGraphicsState();
      }
    }
  });

  doc.save('Ranking_Docentes_Santa_Rosa.pdf');
}

async function imprimirRankingAlumnosPDF() {
  if (listaAlumnosFiltradaGlobal.length === 0) {
    alert("No hay datos cargados para generar el ranking.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const imgLogo = await preCargarLogoRankings('img/logo.png');

  const grado = document.getElementById('filtroGradoRanking')?.value || 'Todos';
  const seccion = document.getElementById('filtroSeccionRanking')?.value || 'Todos';

  // Configuración del membrete adaptada a los filtros visuales activos
  agregarMembreteInstitucional(doc, `RANKING OFICIAL DE MÉRITOS - ALUMNOS (${grado.toUpperCase()} ${seccion.toUpperCase()})`);

  const bodyData = listaAlumnosFiltradaGlobal.map((a, index) => [
    `#${index + 1}`,
    a.nombre || a.nombre_completo || 'Sin nombre',
    a.asignacion || a.grado || a.aula || '-',
    `${a.puntaje_acumulado || a.puntaje || 0} pts`
  ]);

  doc.autoTable({
    startY: 30,
    head: [['Posición', 'Nombre Completo', 'Aula / Grado', 'Puntaje']],
    body: bodyData,
    theme: 'grid',
    headStyles: { 
      fillColor: [0, 102, 51], 
      textColor: [255, 255, 255], 
      fontStyle: 'bold' 
    },
    styles: { 
      fontSize: 8,
      fillColor: false 
    },
    didDrawPage: function (data) {
      if (imgLogo) {
        doc.saveGraphicsState();
        const opacityState = new doc.GState({ opacity: 0.2 });
        doc.setGState(opacityState);
        doc.addImage(imgLogo, 'PNG', 25, 70, 160, 160, undefined, 'FAST');
        doc.restoreGraphicsState();
      }
    }
  });

  document.getElementById('filtroGradoRanking')?.addEventListener('change', filtrarYRenderizarAlumnos);
  document.getElementById('filtroSeccionRanking')?.addEventListener('change', filtrarYRenderizarAlumnos);
  doc.save(`Ranking_Alumnos_${grado}_${seccion}.pdf`);
}