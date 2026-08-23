document.addEventListener('DOMContentLoaded', () => {
  cargarUsuarios();
  alternarCamposRol();
});

function alternarCamposRol() {
  const rol = document.getElementById('regRol').value;
  const secAlumno = document.getElementById('seccionAlumno');
  const secDocente = document.getElementById('seccionDocente');

  if (rol === 'Alumno') {
    secAlumno.style.display = 'grid';
    secDocente.style.display = 'none';
  } else if (rol === 'Docente') {
    secAlumno.style.display = 'none';
    secDocente.style.display = 'block';
  } else {
    secAlumno.style.display = 'none';
    secDocente.style.display = 'none';
  }
}

document.getElementById('formRegistro').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = document.getElementById('regNombre').value;
  const rol = document.getElementById('regRol').value;
  
  let materia_aula = '';
  if (rol === 'Alumno') {
    const nivel = document.getElementById('regNivel').value;
    const grado = document.getElementById('regGrado').value;
    const seccion = document.getElementById('regSeccion').value;
    materia_aula = `${nivel} ${grado} ${seccion}`;
  } else if (rol === 'Docente') {
    materia_aula = document.getElementById('regMateria').value;
  } else {
    materia_aula = 'Auxiliar de Educación';
  }

  // Obtener rol actual o por defecto 'admin' para cumplir con el middleware del servidor
  const rolUsuarioLogueado = localStorage.getItem('userRol') || 'admin';

  try {
    const res = await fetch('/api/usuarios', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-user-rol': rolUsuarioLogueado // <- ¡Clave para que el servidor autorice la inserción!
      },
      body: JSON.stringify({ nombre, rol, materia_aula })
    });

    const data = await res.json();
    if (data.success) {
      alert(`Usuario registrado con éxito. Código: ${data.codigo}`);
      document.getElementById('formRegistro').reset();
      alternarCamposRol();
      cargarUsuarios();
    } else {
      alert('Error al registrar: ' + (data.mensaje || 'No se pudo completar la acción.'));
    }
  } catch (err) {
    console.error("Error de red:", err);
    alert("Error al conectar con el servidor.");
  }
});

async function cargarUsuarios() {
  try {
    const res = await fetch('/api/usuarios');
    const usuarios = await res.json();
    const tbody = document.getElementById('tbodyUsuarios');
    if (!tbody) return;
    
    tbody.innerHTML = '';

    if (usuarios.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px;">No hay usuarios registrados.</td></tr>`;
      return;
    }

    usuarios.forEach(u => {
      tbody.innerHTML += `
        <tr>
          <td><b>${u.codigo}</b></td>
          <td>${u.nombre}</td>
          <td>${u.rol}</td>
          <td>${u.materia_aula || '-'}</td>
          <td style="display:flex; gap:5px;">
            <button onclick="descargarFotocheck('${u.codigo}', '${u.nombre}', '${u.rol}', '${u.materia_aula}')" class="btn-submit" style="background:#0284c7; padding:6px 12px; font-size:12px;">📱 Fotocheck</button>
            <button onclick="abrirModalEditar(${u.id}, '${u.nombre}', '${u.rol}', '${u.materia_aula}')" class="btn-submit" style="background:#eab308; padding:6px 12px; font-size:12px;">✏️ Editar</button>
            <button onclick="eliminarUsuario(${u.id})" class="btn-delete" style="padding:6px 12px; font-size:12px;">Eliminar</button>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    console.error("Error al cargar usuarios:", err);
  }
}

function abrirModalEditar(id, nombre, rol, materia_aula) {
  document.getElementById('editId').value = id;
  document.getElementById('editNombre').value = nombre;
  document.getElementById('editRol').value = rol;
  document.getElementById('editAsignacion').value = materia_aula || '';
  document.getElementById('modalEditar').style.display = 'flex';
}

function cerrarModalEditar() {
  document.getElementById('modalEditar').style.display = 'none';
}

async function guardarEdicionUsuario() {
  const id = document.getElementById('editId').value;
  const nombre = document.getElementById('editNombre').value;
  const rol = document.getElementById('editRol').value;
  const materia_aula = document.getElementById('editAsignacion').value;
  const rolUsuarioLogueado = localStorage.getItem('userRol') || 'admin';

  try {
    const res = await fetch(`/api/usuarios/${id}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'x-user-rol': rolUsuarioLogueado
      },
      body: JSON.stringify({ nombre, rol, materia_aula })
    });

    const data = await res.json();
    if (data.success) {
      alert('Usuario actualizado correctamente');
      cerrarModalEditar();
      cargarUsuarios();
    } else {
      alert('Error al actualizar: ' + (data.mensaje || ''));
    }
  } catch (err) {
    console.error("Error al editar:", err);
  }
}

async function eliminarUsuario(id) {
  if (confirm('¿Desea eliminar este usuario?')) {
    const rolUsuarioLogueado = localStorage.getItem('userRol') || 'admin';
    try {
      const res = await fetch(`/api/usuarios/${id}`, { 
        method: 'DELETE',
        headers: {
          'x-user-rol': rolUsuarioLogueado
        }
      });
      const data = await res.json();
      if (data.success) {
        cargarUsuarios();
      } else {
        alert('Error al eliminar: ' + (data.mensaje || ''));
      }
    } catch (err) {
      console.error("Error al eliminar:", err);
    }
  }
}

function descargarFotocheck(codigo, nombre, rol, asignacion) {
  const qrDiv = document.getElementById('qrcode');
  if (!qrDiv) return;
  qrDiv.innerHTML = '';
  
  new QRCode(qrDiv, { text: codigo, width: 128, height: 128 });

  setTimeout(() => {
    const imgElement = qrDiv.querySelector('img');
    if (!imgElement) return;
    const imgData = imgElement.src;
    const { jsPDF } = window.jspdf;
    
    const doc = new jsPDF({ unit: 'mm', format: [54, 85] });

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 54, 18, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text("I.E. CÉSAR VALLEJO MENDOZA", 27, 7, { align: "center" });
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.text("NAMORA - CAJAMARCA", 27, 12, { align: "center" });

    doc.addImage(imgData, 'PNG', 12, 21, 30, 30);

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    let fontSizeNombre = 8;
    if (nombre.length > 25) fontSizeNombre = 7;
    doc.setFontSize(fontSizeNombre);
    
    const lineasNombre = doc.splitTextToSize(nombre, 48);
    let currentY = 55;
    doc.text(lineasNombre, 27, currentY, { align: "center" });
    currentY += (lineasNombre.length * 3.5);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`ROL: ${rol.toUpperCase()}`, 27, currentY, { align: "center" });
    currentY += 4;

    const textoAsignacion = asignacion || '';
    let fontSizeAsignacion = 6.5;
    if (textoAsignacion.length > 30) fontSizeAsignacion = 5.5;
    doc.setFontSize(fontSizeAsignacion);

    const lineasAsignacion = doc.splitTextToSize(textoAsignacion, 48);
    doc.text(lineasAsignacion, 27, currentY, { align: "center" });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(2, 132, 199);
    doc.text(codigo, 27, 80, { align: "center" });

    doc.save(`Fotocheck_${codigo}.pdf`);
  }, 300);
}