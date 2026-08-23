document.addEventListener("DOMContentLoaded", () => {
  checkAuth('Director');
  loadUsuarios();

  document.getElementById('form-registro').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('reg-nombre').value;
    const rol = document.getElementById('reg-rol').value;
    const materia_aula = document.getElementById('reg-materia').value;

    const res = await fetch('/api/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, rol, materia_aula })
    });

    const data = await res.json();
    if (data.success) {
      alert(`Usuario registrado con éxito. Código: ${data.codigo}`);
      document.getElementById('form-registro').reset();
      loadUsuarios();
    }
  });
});

async function loadUsuarios() {
  const res = await fetch('/api/usuarios');
  const usuarios = await res.json();
  const tbody = document.getElementById('crud-body');
  tbody.innerHTML = '';

  usuarios.forEach(u => {
    tbody.innerHTML += `
      <tr class="border-b border-slate-100 text-xs hover:bg-slate-50">
        <td class="p-3 font-mono text-blue-600">${u.codigo}</td>
        <td class="p-3 font-medium">${u.nombre}</td>
        <td class="p-3">${u.rol}</td>
        <td class="p-3">${u.materia_aula}</td>
        <td class="p-3 text-center flex justify-center gap-2">
          <button onclick="editarUsuario(${u.id}, '${u.nombre}', '${u.rol}', '${u.materia_aula}')" class="bg-amber-500 text-white px-2 py-1 rounded text-[10px]">Editar</button>
          <button onclick="eliminarUsuario(${u.id})" class="bg-red-600 text-white px-2 py-1 rounded text-[10px]">Eliminar</button>
        </td>
      </tr>
    `;
  });
}

async function editarUsuario(id, nombreAct, rolAct, materiaAct) {
  const nuevoNombre = prompt("Nombre completo:", nombreAct);
  const nuevaMateria = prompt("Materia / Aula:", materiaAct);
  if (!nuevoNombre) return;

  await fetch(`/api/usuarios/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: nuevoNombre, rol: rolAct, materia_aula: nuevaMateria })
  });

  loadUsuarios();
}

async function eliminarUsuario(id) {
  if (confirm("¿Está seguro de eliminar este usuario? Se eliminarán todas sus marcaciones asociadas.")) {
    await fetch(`/api/usuarios/${id}`, { method: 'DELETE' });
    loadUsuarios();
  }
}