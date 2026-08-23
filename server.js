const express = require('express');
const path = require('path');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Estado global para controlar si la toma de asistencia está habilitada
let registroActivo = false;

const dbPath = process.env.RAILWAY_VOLUME_MOUNT_PATH 
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'asistencia.db') 
  : 'asistencia.db';

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Error al conectar con SQLite:', err.message);
  else console.log('Base de datos conectada correctamente en:', dbPath);
});

function getFechaPeru() {
  const d = new Date();
  const options = { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' };
  const parts = new Intl.DateTimeFormat('es-PE', options).formatToParts(d);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  return `${year}-${month}-${day}`;
}

function getHoraPeru() {
  return new Date().toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour12: false });
}

// Middleware de verificación de permisos
function verificarPermisoAdmin(req, res, next) {
  const userRol = (req.headers['x-user-rol'] || req.body.rol_editor || '').trim().toLowerCase();
  if (['admin', 'director', 'directivo', 'auxiliar'].includes(userRol)) {
    next();
  } else {
    return res.status(403).json({ 
      success: false, 
      mensaje: 'Acceso denegado: No cuenta con los permisos necesarios.' 
    });
  }
}

// Inicialización de esquema y migraciones seguras
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      rol TEXT NOT NULL,
      materia_aula TEXT DEFAULT ''
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS asistencias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_codigo TEXT NOT NULL,
      fecha TEXT NOT NULL,
      hora TEXT NOT NULL,
      hora_salida TEXT,
      estado TEXT NOT NULL
    )
  `, () => {
    db.run(`ALTER TABLE asistencias ADD COLUMN hora_salida TEXT`, (err) => {});
  });

  const stmt = db.prepare("INSERT OR IGNORE INTO usuarios (codigo, nombre, rol, materia_aula) VALUES (?, ?, ?, ?)");
  stmt.run('DIR-SRN-001', 'Manuel Asencio Málaga', 'Director', 'Dirección General');
  stmt.finalize();
});

// Control de Jornada
app.post('/api/asistencia/iniciar', (req, res) => {
  registroActivo = true;
  res.json({ success: true, mensaje: 'Registro de asistencia iniciado con éxito.' });
});

app.post('/api/asistencia/cerrar', (req, res) => {
  registroActivo = false;
  const hoy = getFechaPeru();

  // 1. Marcar automáticamente la hora máxima (13:10:00) a quienes tengan entrada pero no salida registrada
  db.run("UPDATE asistencias SET hora_salida = '13:10:00' WHERE fecha = ? AND hora_salida IS NULL AND estado != 'FALTA'", [hoy], (errUpd) => {
    if (errUpd) console.error('Error al autocompletar horas de salida:', errUpd);

    // 2. Procesar faltas para quienes nunca marcaron
    db.all("SELECT codigo FROM usuarios WHERE LOWER(rol) IN ('alumno', 'docente')", [], (err, usuarios) => {
      if (err) return res.status(500).json({ success: false, mensaje: 'Error al consultar usuarios.' });

      db.all("SELECT usuario_codigo FROM asistencias WHERE fecha = ?", [hoy], (err, marcaciones) => {
        if (err) return res.status(500).json({ success: false, mensaje: 'Error al validar marcaciones.' });

        const marcadosSet = new Set(marcaciones.map(m => m.usuario_codigo));
        const ausentes = usuarios.filter(u => !marcadosSet.has(u.codigo));

        if (ausentes.length === 0) {
          return res.json({ success: true, mensaje: 'Registro cerrado. Se ajustaron salidas pendientes y no hay ausentes.' });
        }

        db.serialize(() => {
          db.run('BEGIN TRANSACTION');
          const stmt = db.prepare("INSERT INTO asistencias (usuario_codigo, fecha, hora, hora_salida, estado) VALUES (?, ?, '00:00:00', '-', 'FALTA')");
          ausentes.forEach(u => stmt.run(u.codigo, hoy));
          stmt.finalize();
          db.run('COMMIT', (errCommit) => {
            if (errCommit) return res.status(500).json({ success: false, mensaje: 'Error al procesar faltas automáticas.' });
            res.json({ success: true, mensaje: `Asistencia cerrada. Se ajustaron salidas y se asignaron ${ausentes.length} faltas automáticas.` });
          });
        });
      });
    });
  });
});

// Autenticación
app.post('/api/auth/login', (req, res) => {
  const { codigo } = req.body;
  if (!codigo) return res.status(400).json({ success: false, mensaje: 'Ingrese un código.' });

  db.get('SELECT * FROM usuarios WHERE UPPER(codigo) = UPPER(?)', [codigo.trim()], (err, usuario) => {
    if (err) return res.status(500).json({ success: false, mensaje: 'Error en la base de datos.' });
    if (!usuario) return res.status(401).json({ success: false, mensaje: 'Código no encontrado.' });
    
    const rolNormalizado = (usuario.rol || '').trim().toLowerCase();
    let redirectUrl = 'escaner.html';
    if (['admin', 'director', 'directivo', 'docente'].includes(rolNormalizado)) redirectUrl = 'dashboard.html';

    res.json({
      success: true,
      mensaje: 'Acceso concedido',
      redirectUrl,
      usuario
    });
  });
});

// Listado y CRUD de Usuarios
app.get('/api/usuarios', (req, res) => {
  db.all('SELECT * FROM usuarios ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json([]);
    res.json(rows || []);
  });
});

app.post('/api/usuarios', verificarPermisoAdmin, (req, res) => {
  const { nombre, rol, materia_aula } = req.body;
  let prefijo = 'ALU';
  const rolUpper = (rol || '').toUpperCase();
  if (rolUpper === 'DOCENTE') prefijo = 'DOC';
  if (rolUpper === 'AUXILIAR') prefijo = 'AUX';
  if (rolUpper === 'DIRECTOR' || rolUpper === 'ADMIN') prefijo = 'DIR';

  const codigoGenerado = `${prefijo}-SRN-${Math.floor(1000 + Math.random() * 9000)}`;

  db.run(`INSERT INTO usuarios (codigo, nombre, rol, materia_aula) VALUES (?, ?, ?, ?)`, [codigoGenerado, nombre, rol, materia_aula], function (err) {
    if (err) return res.status(500).json({ success: false, mensaje: err.message });
    res.json({ success: true, codigo: codigoGenerado, id: this.lastID });
  });
});

app.delete('/api/usuarios/:id', verificarPermisoAdmin, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM usuarios WHERE id = ?', [id], function (err) {
    if (err) {
      return res.status(500).json({ success: false, mensaje: 'Error al eliminar el usuario en la base de datos.' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ success: false, mensaje: 'El usuario no fue encontrado.' });
    }

    res.json({ success: true, mensaje: 'Usuario eliminado correctamente.' });
  });
});

// Marcación Inteligente Optimizada
const procesarMarcacionLogica = (req, res) => {
  const codigoQR = req.body.codigoQR || req.body.codigo;

  if (!codigoQR) {
    return res.status(400).json({ success: false, mensaje: 'Código no proporcionado.' });
  }

  db.get('SELECT * FROM usuarios WHERE UPPER(codigo) = UPPER(?)', [codigoQR.trim()], (err, usuario) => {
    if (err || !usuario) {
      return res.status(404).json({ success: false, mensaje: 'Código QR no registrado en el sistema.' });
    }

    const hoy = getFechaPeru();
    const horaActual = getHoraPeru();

    db.get('SELECT * FROM asistencias WHERE usuario_codigo = ? AND fecha = ?', [usuario.codigo, hoy], (err, registroHoy) => {
      if (err) return res.status(500).json({ success: false, mensaje: 'Error al verificar marcación.' });

      // ==========================================
      // CASO 1: REGISTRAR INGRESO (ENTRADA)
      // ==========================================
      if (!registroHoy) {
        // Estricto: Hasta las 07:30:00 es PUNTUAL. 07:30:01 en adelante ya es TARDANZA.
        const estado = horaActual > '07:30:00' ? 'TARDANZA' : 'PUNTUAL';
        
        db.run('INSERT INTO asistencias (usuario_codigo, fecha, hora, hora_salida, estado) VALUES (?, ?, ?, NULL, ?)', 
          [usuario.codigo, hoy, horaActual, estado], (err) => {
            if (err) return res.status(500).json({ success: false, mensaje: 'Error al registrar entrada.' });
            
            return res.json({ 
              success: true, 
              tipo: 'ENTRADA',
              mensaje: `Entrada [${estado}] registrada para ${usuario.nombre} a las ${horaActual}`, 
              persona: usuario,
              usuario, 
              hora: horaActual, 
              estado 
            });
        });
      } 
      
      // ==========================================
      // CASO 2: REGISTRAR SALIDA
      // ==========================================
      else if (!registroHoy.hora_salida) {
        // Eliminamos el límite de 30 min y el tope de las 13:10:00. Se registra la hora real de salida.
        const horaSalidaFinal = horaActual; 
        
        db.run('UPDATE asistencias SET hora_salida = ? WHERE id = ?', [horaSalidaFinal, registroHoy.id], (err) => {
          if (err) return res.status(500).json({ success: false, mensaje: 'Error al registrar salida.' });
          
          return res.json({ 
            success: true, 
            tipo: 'SALIDA',
            mensaje: `Salida registrada exitosamente para ${usuario.nombre} a las ${horaSalidaFinal}`, 
            persona: usuario,
            usuario, 
            horaSalida: horaSalidaFinal 
          });
        });
      } 
      
      // ==========================================
      // CASO 3: INTENTO DE DUPLICADO (ERRORES)
      // ==========================================
      else {
        // Si el flujo llega aquí, significa que ya tiene 'hora' y también 'hora_salida' registradas.
        // Por ende, cualquier escaneo posterior es un intento de marcar un tercer registro (Doble Salida).
        return res.status(400).json({ 
          success: false, 
          duplicado: true,
          mensaje: 'ERROR, YA MARCÓ SALIDA',
          persona: usuario,
          usuario
        });
      }
    });
  });
};

app.post('/api/asistencia/marcar', procesarMarcacionLogica);
app.post('/api/asistencia/registrar', procesarMarcacionLogica);

app.get('/api/asistencia/hoy', (req, res) => {
  const hoy = getFechaPeru();
  const query = `
    SELECT 
      a.usuario_codigo AS codigo,
      u.nombre,
      u.materia_aula AS aula,
      u.rol,
      a.hora AS hora_entrada,
      COALESCE(a.hora_salida, '-') AS hora_salida,
      a.estado
    FROM asistencias a
    JOIN usuarios u ON a.usuario_codigo = u.codigo
    WHERE a.fecha = ?
    ORDER BY a.id DESC
  `;
  db.all(query, [hoy], (err, rows) => {
    if (err) return res.status(500).json([]);
    res.json(rows || []);
  });
});

app.post('/api/asistencia/editar', verificarPermisoAdmin, (req, res) => {
  const { codigo, fecha, estado, hora_salida } = req.body;
  if (!codigo || !fecha || !estado) return res.status(400).json({ success: false, mensaje: 'Datos incompletos.' });

  db.get('SELECT id FROM asistencias WHERE usuario_codigo = ? AND fecha = ?', [codigo, fecha], (err, row) => {
    if (row) {
      db.run('UPDATE asistencias SET estado = ?, hora_salida = COALESCE(?, hora_salida) WHERE id = ?', [estado, hora_salida, row.id], (err2) => {
        if (err2) return res.status(500).json({ success: false, mensaje: 'Error al actualizar.' });
        res.json({ success: true, mensaje: 'Asistencia actualizada.' });
      });
    } else {
      db.run('INSERT INTO asistencias (usuario_codigo, fecha, hora, hora_salida, estado) VALUES (?, ?, ?, ?, ?)', 
        [codigo, fecha, '07:30:00', hora_salida || '13:10:00', estado], (err2) => {
          if (err2) return res.status(500).json({ success: false, mensaje: 'Error al registrar.' });
          res.json({ success: true, mensaje: 'Asistencia creada de forma manual.' });
      });
    }
  });
});

app.get('/api/reportes/consolidado', (req, res) => {
  db.all("SELECT * FROM usuarios WHERE LOWER(rol) = 'alumno' OR rol IS NULL", [], (err, usuarios) => {
    if (err) return res.status(500).json([]);
    db.all("SELECT * FROM asistencias", [], (err, asistencias) => {
      if (err) return res.status(500).json([]);

      const consolidado = usuarios.map(u => {
        const marcaciones = asistencias.filter(a => a.usuario_codigo === u.codigo);
        let asistenciasCount = 0, tardanzas = 0, fJustificadas = 0, fInjustificadas = 0;

        marcaciones.forEach(m => {
          const est = (m.estado || '').toUpperCase();
          if (est === 'PUNTUAL') asistenciasCount++;
          else if (est === 'TARDANZA') tardanzas++;
          else if (est === 'JUSTIFICADA') fJustificadas++;
          else if (est === 'INJUSTIFICADA' || est === 'FALTA') fInjustificadas++;
        });

        return {
          id: u.id,
          codigo: u.codigo,
          nombre: u.nombre,
          rol: u.rol || 'Alumno',
          aula: u.materia_aula || 'Sin Asignación',
          asistencias: asistenciasCount,
          tardanzas,
          fJustificadas,
          fInjustificadas,
          puntajeTotal: (asistenciasCount * 2.0) + (tardanzas * 1.0)
        };
      });
      res.json(consolidado);
    });
  });
});

app.get('/api/reportes/historial-detallado', (req, res) => {
  const { codigo } = req.query;
  let query = `
    SELECT a.fecha, a.hora, a.hora_salida, a.estado, u.codigo, u.nombre, u.materia_aula AS aula
    FROM asistencias a JOIN usuarios u ON a.usuario_codigo = u.codigo
  `;
  const params = [];
  if (codigo && codigo !== 'todos') {
    query += ` WHERE a.usuario_codigo = ?`;
    params.push(codigo);
  }
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json([]);
    res.json(rows || []);
  });
});

// Endpoint para Rankings de Méritos
app.get('/api/rankings', (req, res) => {
  // 1. Obtener todos los usuarios
  db.all("SELECT * FROM usuarios", [], (err, usuarios) => {
    if (err) return res.status(500).json({ success: false, mensaje: 'Error al consultar usuarios.' });

    // 2. Obtener todas las asistencias registradas
    db.all("SELECT * FROM asistencias", [], (err, asistencias) => {
      if (err) return res.status(500).json({ success: false, mensaje: 'Error al consultar asistencias.' });

      // 3. Procesar puntajes por usuario (Puntual = 2 pts, Tardanza = 1 pt, etc.)
      const listaProcesada = usuarios.map(u => {
        const marcaciones = asistencias.filter(a => a.usuario_codigo === u.codigo);
        let puntajeAcumulado = 0;

        marcaciones.forEach(m => {
          const est = (m.estado || '').toUpperCase();
          if (est === 'PUNTUAL') puntajeAcumulado += 2;
          else if (est === 'TARDANZA') puntajeAcumulado += 1;
        });

        return {
          nombre: u.nombre,
          rol: (u.rol || '').toLowerCase(),
          asignacion: u.materia_aula || 'General',
          puntaje_acumulado: puntajeAcumulado
        };
      });

      // 4. Separar y ordenar de mayor a menor puntaje
      const docentes = listaProcesada
        .filter(u => ['docente', 'director', 'directivo', 'auxiliar'].includes(u.rol))
        .sort((a, b) => b.puntaje_acumulado - a.puntaje_acumulado);

      const alumnos = listaProcesada
        .filter(u => ['alumno', 'estudiante'].includes(u.rol) || (!['docente', 'director', 'directivo', 'auxiliar'].includes(u.rol)))
        .sort((a, b) => b.puntaje_acumulado - a.puntaje_acumulado);

      // 5. Enviar respuesta estructurada
      res.json({
        success: true,
        docentes,
        alumnos
      });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Servidor optimizado ejecutándose en el puerto ${PORT}`);
});

app.get('/api/reportes/historial-detallado', (req, res) => {
  const { codigo } = req.query;
  let query = `
    SELECT 
      a.fecha, 
      a.hora, 
      CASE 
        WHEN UPPER(a.estado) IN ('PUNTUAL', 'TARDANZA') AND (a.hora_salida IS NULL OR a.hora_salida = '' OR a.hora_salida = '-') 
          THEN '13:10:00'
        ELSE COALESCE(a.hora_salida, '-')
      END AS hora_salida,
      a.estado, 
      u.codigo, 
      u.nombre, 
      u.materia_aula AS aula
    FROM asistencias a 
    JOIN usuarios u ON a.usuario_codigo = u.codigo
  `;
  const params = [];
  if (codigo && codigo !== 'todos') {
    query += ` WHERE a.usuario_codigo = ?`;
    params.push(codigo);
  }
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json([]);
    res.json(rows || []);
  });
});
