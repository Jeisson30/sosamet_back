const db = require('../../config/db');

const createUser = (req, res) => {
    const { p_nombre, p_apellido, p_identificacion, p_email, p_idrol, p_idperfil } = req.body;
  
    if (!p_nombre || !p_apellido || !p_identificacion || !p_email || !p_idrol) {
      return res.status(400).json({ message: 'Todos los campos son obligatorios' });
    }
    
    db.query(
      'CALL sp_insertar_usuario(?, ?, ?, ?, ?,?)',
      [p_identificacion, p_nombre, p_apellido, p_email, p_idrol, p_idperfil],
      (err, results) => {
        if (err) {
          if (err.sqlState === '45000') {
            return res.status(400).json({ message: err.message });
          }
          return res.status(500).json({ message: 'Error al crear usuario', error: err });
        }
        const message = results[0][0]?.message || 'Usuario creado exitosamente';
        res.status(201).json({ message });
      }
    );
  };
  

module.exports = { createUser };
