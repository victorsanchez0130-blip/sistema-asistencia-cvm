// Manejo de autenticación y sesiones corregido
function checkAuth(requiredRol = null) {
  // 1. Obtener la sesión (soporta 'user_session' o 'usuario')
  const sessionData = localStorage.getItem('user_session') || localStorage.getItem('usuario');
  let user = null;

  try {
    user = JSON.parse(sessionData);
  } catch (e) {
    console.error('Error al parsear la sesión:', e);
  }

  // Identificar página actual
  const currentPage = window.location.pathname.split('/').pop().toLowerCase() || 'index.html';
  const isLoginPage = currentPage === 'index.html' || currentPage === '';

  // 2. Si no hay usuario activo y no está en el login, redirigir al login
  if (!user) {
    if (!isLoginPage) {
      window.location.href = 'index.html';
    }
    return;
  }

  // 3. Normalizar el rol a minúsculas
  const userRol = (user.rol || '').trim().toLowerCase();

  // 4. Redirección inteligente desde el Login (index.html) según privilegios estrictos
  if (isLoginPage) {
    switch (userRol) {
      case 'director':
      case 'admin':
      case 'directivo':
      case 'docente': // Ambos entran al dashboard, pero el docente con restricciones visuales
        window.location.href = 'dashboard.html';
        break;
      case 'auxiliar':
        window.location.href = 'escaner.html';
        break;
      default:
        localStorage.clear();
        window.location.href = 'index.html';
        break;
    }
    return;
  }

// --- MATRIZ DE PERMISOS ESTRICTA POR ROL ---

  // DIRECTOR / ADMIN / DIRECTIVO: Acceso total
  if (['director', 'admin', 'directivo'].includes(userRol)) {
    return; // Pasa sin restricciones por cualquier archivo .html
  }

  // DOCENTE: ÚNICA Y EXCLUSIVAMENTE dashboard.html, reportes.html y rankings.html
  if (userRol === 'docente') {
    const paginasPermitidas = ['dashboard.html', 'reportes.html', 'rankings.html'];

    if (!paginasPermitidas.includes(currentPage)) {
      alert('Acceso restringido: Los docentes solo tienen acceso al Dashboard, Reportes y Rankings.');
      window.location.href = 'dashboard.html';
      return;
    }
    return;
  }

  // AUXILIAR: ÚNICA Y EXCLUSIVAMENTE escaner.html
  if (userRol === 'auxiliar') {
    if (currentPage !== 'escaner.html') {
      alert('Acceso restringido: Los auxiliares solo tienen acceso al módulo Escáner.');
      window.location.href = 'escaner.html';
    }
    return;
  }

  // ALUMNO: ÚNICA Y EXCLUSIVAMENTE rankings.html
  if (userRol === 'alumno') {
    if (currentPage !== 'rankings.html') {
      alert('Acceso restringido: Los alumnos solo tienen acceso a Rankings.');
      window.location.href = 'rankings.html';
    }
    return;
  }

  // CUALQUIER OTRO ROL NO AUTORIZADO
  alert('Acceso denegado: Su rol no cuenta con permisos para esta plataforma.');
  logout();
}