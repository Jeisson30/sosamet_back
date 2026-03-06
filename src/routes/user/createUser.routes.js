const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { createUser } = require('../../controllers/users/createUser.controller');
const { validateRequest } = require('../../middlewares/validation.middleware');

/**
 * @swagger
 * tags:
 *   name: Usuarios
 *   description: Endpoints para gestión de usuarios
 */

/**
 * @swagger
 * /api/createUser:
 *   post:
 *     summary: Crear un nuevo usuario
 *     tags: [Usuarios]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - p_nombre
 *               - p_apellido
 *               - p_identificacion
 *               - p_email
 *               - p_idrol
 *               - p_idperfil
 *             properties:
 *               p_nombre:
 *                 type: string
 *                 example: Juan
 *               p_apellido:
 *                 type: string
 *                 example: Pérez
 *               p_identificacion:
 *                 type: string
 *                 example: 123456789
 *               p_email:
 *                 type: string
 *                 example: juan.perez@sosamet.com
 *               p_idrol:
 *                 type: integer
 *                 example: 1
 *               p_idperfil:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       201:
 *         description: Usuario creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Usuario creado exitosamente
 *       400:
 *         description: Faltan campos obligatorios o dato duplicado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Identificación o correo ya existe
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Error al crear usuario
 */

router.post(
  '/',
  [
    body('p_nombre')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('El nombre es obligatorio'),
    body('p_apellido')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('El apellido es obligatorio'),
    body('p_identificacion')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('La identificación es obligatoria'),
    body('p_email')
      .isEmail()
      .withMessage('El email debe tener un formato válido'),
    body('p_idrol')
      .isInt()
      .withMessage('El id de rol debe ser numérico'),
    body('p_idperfil')
      .optional()
      .isInt()
      .withMessage('El id de perfil debe ser numérico'),
    validateRequest,
  ],
  createUser
);

module.exports = router;
