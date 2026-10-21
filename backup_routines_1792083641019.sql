-- PROCEDURE SP_ActualizarAsistencia (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `SP_ActualizarAsistencia`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `SP_ActualizarAsistencia`(
    IN p_numerodoc VARCHAR(50),
    IN p_campos JSON
)
BEGIN

    DECLARE i INT DEFAULT 0;
    DECLARE total INT DEFAULT 0;

    DECLARE v_nombre VARCHAR(100);
    DECLARE v_valor TEXT;

    -- Validar JSON
    IF p_campos IS NOT NULL AND JSON_LENGTH(p_campos) > 0 THEN

        SET total = JSON_LENGTH(p_campos);

        WHILE i < total DO

            SET v_nombre = JSON_UNQUOTE(JSON_EXTRACT(p_campos, CONCAT('$[', i, '].nombre')));
            SET v_valor  = JSON_UNQUOTE(JSON_EXTRACT(p_campos, CONCAT('$[', i, '].valor')));

            -- Validar que el nombre no sea nulo o vacío
            IF v_nombre IS NOT NULL AND v_nombre <> '' THEN

                -- UPSERT (UPDATE si existe, INSERT si no)
                IF EXISTS (
                    SELECT 1 
                    FROM sosamet.item_documentos 
                    WHERE numerodoc = p_numerodoc
                      AND UPPER(tipo_doc) = 'ASISTENCIA'
                      AND nombre_campo_doc = v_nombre
                ) THEN

                    UPDATE sosamet.item_documentos
                    SET valor_campo_doc = IFNULL(v_valor, valor_campo_doc)
                    WHERE numerodoc = p_numerodoc
                      AND UPPER(tipo_doc) = 'ASISTENCIA'
                      AND nombre_campo_doc = v_nombre;

                ELSE

                    INSERT INTO sosamet.item_documentos (
                        tipo_doc,
                        numerodoc,
                        nombre_campo_doc,
                        valor_campo_doc
                    ) VALUES (
                        'ASISTENCIA',
                        p_numerodoc,
                        v_nombre,
                        IFNULL(v_valor, '')
                    );

                END IF;

            END IF;

            SET i = i + 1;

        END WHILE;

    END IF;

END$$
DELIMITER ;

-- PROCEDURE sp_actualizar_contratista (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_actualizar_contratista`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_actualizar_contratista`(
    IN p_id INT,
    IN p_nombre VARCHAR(100),
    IN p_identificacion VARCHAR(50),
    IN p_telefono VARCHAR(20),
    IN p_email VARCHAR(100)
)
BEGIN
    UPDATE contratistas
    SET nombre = p_nombre,
        identificacion = p_identificacion,
        telefono = p_telefono,
        email = p_email
    WHERE id = p_id;
END$$
DELIMITER ;

-- PROCEDURE sp_actualizar_contrato (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_actualizar_contrato`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_actualizar_contrato`(
    IN p_id INT,
    IN p_id_contratista INT,
    IN p_fecha_inicio DATE,
    IN p_fecha_fin DATE,
    IN p_valor DECIMAL(18,2)
)
BEGIN
    UPDATE contratos
    SET id_contratista = p_id_contratista,
        fecha_inicio = p_fecha_inicio,
        fecha_fin = p_fecha_fin,
        valor = p_valor
    WHERE id = p_id;
END$$
DELIMITER ;

-- PROCEDURE sp_actualizar_estado_usuario (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_actualizar_estado_usuario`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_actualizar_estado_usuario`(
    IN p_id_usuario INT,
    IN p_estado ENUM('ACTIVO','INACTIVO','BLOQUEADO','ELIMINADO')
)
BEGIN
    DECLARE v_filas INT;

    UPDATE usuarios
    SET estado = p_estado,
        fecha_actualizacion = NOW()
    WHERE id_usuario = p_id_usuario;

    SET v_filas = ROW_COUNT();

    IF v_filas > 0 THEN
        SELECT 'Estado actualizado correctamente' AS mensaje, 1 AS exito;
    ELSE
        SELECT 'Usuario no encontrado' AS mensaje, 0 AS exito;
    END IF;
END$$
DELIMITER ;

-- PROCEDURE sp_actualizar_orden_compra (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_actualizar_orden_compra`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_actualizar_orden_compra`(
    IN p_id INT,
    IN p_id_contrato INT,
    IN p_fecha DATE,
    IN p_monto DECIMAL(18,2)
)
BEGIN
    UPDATE ordenes_compra
    SET id_contrato = p_id_contrato,
        fecha = p_fecha,
        monto = p_monto
    WHERE id = p_id;
END$$
DELIMITER ;

-- PROCEDURE sp_actualizar_orden_compra_detalle (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_actualizar_orden_compra_detalle`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_actualizar_orden_compra_detalle`(
    IN p_id INT,
    IN p_id_orden_compra INT,
    IN p_descripcion VARCHAR(255),
    IN p_cantidad INT,
    IN p_precio_unitario DECIMAL(18,2)
)
BEGIN
    UPDATE ordenes_compra_detalles
    SET id_orden_compra = p_id_orden_compra,
        descripcion = p_descripcion,
        cantidad = p_cantidad,
        precio_unitario = p_precio_unitario
    WHERE id = p_id;
END$$
DELIMITER ;

-- PROCEDURE sp_actualizar_perfil (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_actualizar_perfil`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_actualizar_perfil`(
    IN p_id_perfil INT,
    IN p_perfil VARCHAR(50),
    IN p_estado VARCHAR(10)
)
BEGIN
    DECLARE v_filas INT;

    UPDATE perfiles
    SET 
        perfil = p_perfil,
        estado = p_estado,
        fecha_actualizacion = CURDATE()
    WHERE id_perfil = p_id_perfil;

    SET v_filas = ROW_COUNT();

    IF v_filas > 0 THEN
        SELECT 'Perfil actualizado correctamente' AS mensaje, 1 AS exito;
    ELSE
        SELECT 'Perfil no encontrado' AS mensaje, 0 AS exito;
    END IF;
END$$
DELIMITER ;

-- PROCEDURE sp_actualizar_proveedor (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_actualizar_proveedor`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_actualizar_proveedor`(
    IN p_id INT,
    IN p_nombre VARCHAR(100),
    IN p_nit VARCHAR(50),
    IN p_direccion VARCHAR(150),
    IN p_telefono VARCHAR(20),
    IN p_email VARCHAR(100)
)
BEGIN
    UPDATE proveedores
    SET nombre = p_nombre,
        nit = p_nit,
        direccion = p_direccion,
        telefono = p_telefono,
        email = p_email
    WHERE id = p_id;
END$$
DELIMITER ;

-- PROCEDURE sp_actualizar_proyecto (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_actualizar_proyecto`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_actualizar_proyecto`(
    IN p_id INT,
    IN p_nombre VARCHAR(100),
    IN p_descripcion TEXT,
    IN p_fecha_inicio DATE,
    IN p_fecha_fin DATE
)
BEGIN
    UPDATE proyectos
    SET nombre = p_nombre,
        descripcion = p_descripcion,
        fecha_inicio = p_fecha_inicio,
        fecha_fin = p_fecha_fin
    WHERE id = p_id;
END$$
DELIMITER ;

-- PROCEDURE sp_actualizar_usuario (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_actualizar_usuario`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_actualizar_usuario`(
    IN p_nit VARCHAR(50),
    IN p_nombre VARCHAR(50),
    IN p_apellido VARCHAR(50),
    IN p_email VARCHAR(50),
    IN p_rol VARCHAR(20)
)
BEGIN
    UPDATE usuarios
    SET nombre = p_nombre,
        apellido = p_apellido,
        email = p_email,
        fecha_actualizacion = NOW()
    WHERE identificacion = p_nit;
   
    UPDATE r_usuarios_perfiles rel
	JOIN usuarios u ON rel.id_usuario = u.id_usuario
	SET rel.id_perfil = p_rol
	WHERE u.identificacion = p_nit;
    
    INSERT INTO notificaciones_pendientes(correo_destino, asunto, mensaje)
    VALUES( p_email, 'Actualización de datos', CONCAT('Hola ', p_nombre, ', tus datos fueron actualizados satisfactoriamente.'));
    
    -- IMPORTANTE: devolver un resultado
    SELECT 'Usuario actualizado correctamente' AS message, 1 AS code;
END$$
DELIMITER ;

-- PROCEDURE sp_cambiar_estado_usuario (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_cambiar_estado_usuario`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_cambiar_estado_usuario`(
    IN p_id_usuario INT,
    IN p_nuevo_estado ENUM('ACTIVO','INACTIVO','BLOQUEADO','ELIMINADO'),
    OUT p_resultado VARCHAR(100),
    OUT p_codigo INT
)
BEGIN
    DECLARE v_existente INT;

    -- Verificar si el usuario existe
    SELECT COUNT(*) INTO v_existente
    FROM usuarios
    WHERE id_usuario = p_id_usuario;

    IF v_existente = 0 THEN
        SET p_resultado = 'USUARIO NO EXISTE';
        SET p_codigo = 0;
    ELSE
        -- Actualizar estado del usuario
        UPDATE usuarios
        SET estado = p_nuevo_estado,
            fecha_actualizacion = CURRENT_TIMESTAMP
        WHERE id_usuario = p_id_usuario;

        SET p_resultado = CONCAT('Estado cambiado a:  ', p_nuevo_estado);
        SET p_codigo = 1;
    END IF;
END$$
DELIMITER ;

-- PROCEDURE sp_cambiar_password (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_cambiar_password`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_cambiar_password`(
    IN p_id_usuario VARCHAR(50),
    IN p_clave_actual VARCHAR(255),
    IN p_nueva_password VARCHAR(255),
    OUT p_estado VARCHAR(50)
)
BEGIN
    DECLARE v_password_actual VARCHAR(255);

    -- Obtener la contraseña actual encriptada
    SELECT password INTO v_password_actual
    FROM usuarios
    WHERE identificacion = p_id_usuario
      AND estado IN ('ACTIVO', 'INACTIVO');

    -- Validar si la clave ingresada coincide
   -- IF v_password_actual IS NOT NULL AND v_password_actual = SHA2(p_clave_actual, 256) THEN
        -- Actualizar la contraseña
        UPDATE usuarios
        SET password = SHA2(p_nueva_password, 256),
            fecha_actualizacion = CURRENT_TIMESTAMP,
            intentos_fallidos = 0
        WHERE identificacion = p_id_usuario;

        SET p_estado = 'CONTRASEÑA CAMBIADA';
    -- ELSE
    --    SET p_estado = 'CLAVE ACTUAL INCORRECTA';
    -- END IF  ;
    
END$$
DELIMITER ;

-- PROCEDURE SP_ConsultarAsistencia (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `SP_ConsultarAsistencia`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `SP_ConsultarAsistencia`(
    IN p_buscar VARCHAR(100),
    IN p_fecha_desde DATE,
    IN p_fecha_hasta DATE,
    IN p_trabajador VARCHAR(150),
    IN p_constructora VARCHAR(150),
    IN p_proyecto VARCHAR(150)
)
BEGIN

    SELECT 
        numerodoc,

        MAX(CASE WHEN nombre_campo_doc = 'consecutivo' THEN valor_campo_doc END) AS consecutivo,
        MAX(CASE WHEN nombre_campo_doc = 'constructora' THEN valor_campo_doc END) AS constructora,
        MAX(CASE WHEN nombre_campo_doc = 'proyecto' THEN valor_campo_doc END) AS proyecto,
        MAX(CASE WHEN nombre_campo_doc = 'ubicacion' THEN valor_campo_doc END) AS ubicacion,
        MAX(CASE WHEN nombre_campo_doc = 'detalle_visita' THEN valor_campo_doc END) AS detalle_visita,
        MAX(CASE WHEN nombre_campo_doc = 'foto1' THEN valor_campo_doc END) AS foto1,
        MAX(CASE WHEN nombre_campo_doc = 'foto2' THEN valor_campo_doc END) AS foto2,

        -- opcionales (para filtros)
        MAX(CASE WHEN nombre_campo_doc = 'fecha' THEN valor_campo_doc END) AS fecha,
        MAX(CASE WHEN nombre_campo_doc = 'trabajador' THEN valor_campo_doc END) AS trabajador

    FROM sosamet.item_documentos
    WHERE tipo_doc = 'ASISTENCIA'

    GROUP BY numerodoc

    HAVING 1=1

    -- BUSCAR
    AND (
        p_buscar IS NULL OR p_buscar = '' OR
        numerodoc LIKE CONCAT('%', p_buscar, '%') OR
        constructora LIKE CONCAT('%', p_buscar, '%') OR
        proyecto LIKE CONCAT('%', p_buscar, '%')
    )

    -- FECHA DESDE
    AND (
        p_fecha_desde IS NULL OR
        STR_TO_DATE(fecha, '%Y-%m-%d') >= p_fecha_desde
    )

    -- FECHA HASTA
    AND (
        p_fecha_hasta IS NULL OR
        STR_TO_DATE(fecha, '%Y-%m-%d') <= p_fecha_hasta
    )

    -- TRABAJADOR
    AND (
        p_trabajador IS NULL OR p_trabajador = '' OR
        trabajador LIKE CONCAT('%', p_trabajador, '%')
    )

    -- CONSTRUCTORA
    AND (
        p_constructora IS NULL OR p_constructora = '' OR
        constructora = p_constructora
    )

    -- PROYECTO
    AND (
        p_proyecto IS NULL OR p_proyecto = '' OR
        proyecto = p_proyecto
    )

    ORDER BY numerodoc DESC;

END$$
DELIMITER ;

-- PROCEDURE SP_ConsultarOrdenCompra (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `SP_ConsultarOrdenCompra`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `SP_ConsultarOrdenCompra`(
    IN p_buscar VARCHAR(100),
    IN p_fecha_desde DATE,
    IN p_fecha_hasta DATE,
    IN p_estado VARCHAR(50),
    IN p_proyecto VARCHAR(100)
)
BEGIN

SELECT 
    oc.id,
    oc.contrato,
    oc.item,
    oc.elemento,
    oc.descripcion,
    oc.ubicacion,
    oc.um,
    oc.base,
    oc.altura,
    oc.total,
    oc.otros,
    oc.cantidad,
    oc.proveedor,
    oc.tipo_doc,
    oc.numdoc,
    oc.fecha_creacion,

    MAX(CASE WHEN idoc.nombre_campo_doc = 'constructora'
        THEN idoc.valor_campo_doc END) AS constructora,

    MAX(CASE WHEN idoc.nombre_campo_doc = 'estado'
        THEN idoc.valor_campo_doc END) AS estado,

    MAX(CASE WHEN idoc.nombre_campo_doc = 'proyecto'
        THEN idoc.valor_campo_doc END) AS proyecto,

    MAX(CASE WHEN idoc.nombre_campo_doc = 'numero_contrato'
        THEN idoc.valor_campo_doc END) AS numero_contrato,

    MAX(CASE WHEN idoc.nombre_campo_doc = 'numero_plano'
        THEN idoc.valor_campo_doc END) AS numero_plano,

    MAX(CASE WHEN idoc.nombre_campo_doc = 'observaciones'
        THEN idoc.valor_campo_doc END) AS observaciones,

    MAX(CASE WHEN idoc.nombre_campo_doc = 'fecha_terminacion'
        THEN idoc.valor_campo_doc END) AS fecha_terminacion,

    MAX(CASE WHEN idoc.nombre_campo_doc = 'foto_1_orden'
        THEN idoc.valor_campo_doc END) AS foto_1_orden

FROM orden_compra oc

LEFT JOIN item_documentos cons
ON cons.nombre_campo_doc = 'consecutivo'
AND cons.valor_campo_doc = oc.numdoc

LEFT JOIN item_documentos idoc
ON idoc.numerodoc = cons.numerodoc

WHERE
(p_fecha_desde IS NULL OR oc.fecha_creacion >= p_fecha_desde)
AND (p_fecha_hasta IS NULL OR oc.fecha_creacion <= p_fecha_hasta)

GROUP BY
oc.id,
oc.contrato,
oc.item,
oc.elemento,
oc.descripcion,
oc.ubicacion,
oc.um,
oc.base,
oc.altura,
oc.total,
oc.otros,
oc.cantidad,
oc.proveedor,
oc.tipo_doc,
oc.numdoc,
oc.fecha_creacion

HAVING
(p_buscar IS NULL OR
 oc.numdoc LIKE CONCAT('%',p_buscar,'%') OR
 oc.contrato LIKE CONCAT('%',p_buscar,'%') OR
 numero_contrato LIKE CONCAT('%',p_buscar,'%') OR
 constructora LIKE CONCAT('%',p_buscar,'%')
)

AND (p_estado IS NULL OR estado = p_estado)
AND (p_proyecto IS NULL OR proyecto = p_proyecto)

ORDER BY oc.fecha_creacion DESC;

END$$
DELIMITER ;

-- PROCEDURE sp_consultar_aiu (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_consultar_aiu`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_consultar_aiu`(
    IN p_tipo_doc VARCHAR(50),
    IN p_numdoc VARCHAR(50)
)
BEGIN
  SELECT * FROM aiu
  WHERE tipo_doc = p_tipo_doc AND numdoc = p_numdoc;
END$$
DELIMITER ;

-- PROCEDURE sp_consultar_contratistas (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_consultar_contratistas`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_consultar_contratistas`()
BEGIN
    SELECT * FROM contratistas;
END$$
DELIMITER ;

-- PROCEDURE sp_consultar_documento_detalle (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_consultar_documento_detalle`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_consultar_documento_detalle`(
  IN p_tipo_doc VARCHAR(50),
  IN p_numerodoc VARCHAR(50)
)
BEGIN
  DECLARE columnas TEXT;

  -- Aumentar límite para GROUP_CONCAT
  SET SESSION group_concat_max_len = 10000;

  -- Generar lista de columnas dinámicas
  SELECT GROUP_CONCAT(
           DISTINCT CONCAT(
             'MAX(CASE WHEN nombre_campo_doc = ''',
             nombre_campo_doc,
             ''' THEN valor_campo_doc END) AS `',
             nombre_campo_doc,
             '`'
           ) SEPARATOR ', '
         ) INTO columnas
  FROM item_documentos
  WHERE tipo_doc = p_tipo_doc AND numerodoc = p_numerodoc;

  -- Validar que haya columnas
  IF columnas IS NOT NULL THEN

    SET @sql_query = CONCAT(
      'SELECT tipo_doc, numerodoc, ', columnas,
      ' FROM item_documentos ',
      'WHERE tipo_doc = ''', p_tipo_doc,
      ''' AND numerodoc = ''', p_numerodoc, ''' ',
      'GROUP BY tipo_doc, numerodoc'
    );

    -- Ejecutar consulta dinámica
    PREPARE stmt FROM @sql_query;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;

  ELSE
    SELECT '⚠️ No hay datos para ese tipo_doc y numerodoc.' AS mensaje;
  END IF;
END$$
DELIMITER ;

-- PROCEDURE sp_consultar_empresas (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_consultar_empresas`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_consultar_empresas`()
BEGIN
    SELECT 
        id,
        nombre_empresa,
        nit,
        estado
    FROM empresa;
END$$
DELIMITER ;

-- PROCEDURE sp_consultar_iva_pleno (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_consultar_iva_pleno`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_consultar_iva_pleno`(
    IN p_tipo_doc VARCHAR(50),
    IN p_numdoc VARCHAR(50)
)
BEGIN
  SELECT * FROM iva_pleno
  WHERE tipo_doc = p_tipo_doc AND numdoc = p_numdoc;
END$$
DELIMITER ;

-- PROCEDURE sp_consultar_ordenes_compra (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_consultar_ordenes_compra`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_consultar_ordenes_compra`()
BEGIN
    SELECT * FROM ordenes_compra;
END$$
DELIMITER ;

-- PROCEDURE sp_consultar_ordenes_compra_detalles (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_consultar_ordenes_compra_detalles`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_consultar_ordenes_compra_detalles`()
BEGIN
    SELECT * FROM ordenes_compra_detalles;
END$$
DELIMITER ;

-- PROCEDURE sp_consultar_proveedores (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_consultar_proveedores`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_consultar_proveedores`()
BEGIN
    SELECT * FROM proveedores;
END$$
DELIMITER ;

-- PROCEDURE sp_consultar_proyectos (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_consultar_proyectos`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_consultar_proyectos`()
BEGIN
    SELECT * FROM proyectos;
END$$
DELIMITER ;

-- PROCEDURE sp_consultar_usuario_perfiles_por_identificacion (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_consultar_usuario_perfiles_por_identificacion`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_consultar_usuario_perfiles_por_identificacion`(IN p_identificacion VARCHAR(20))
BEGIN
    SELECT 
        rup.id_rup,
        rup.id_usuario,
        u.nombre AS nombre_usuario,
        u.identificacion,
        rup.id_perfil,
        p.perfil AS nombre_perfil,
        rup.descripcion,
        rup.id_rol,
        rup.fecha_creacion,
        rup.fecha_actualizacion
    FROM 
        r_usuarios_perfiles rup
    INNER JOIN 
        usuarios u ON rup.id_usuario = u.id_usuario
    INNER JOIN 
        perfiles p ON rup.id_perfil = p.id_perfil
    WHERE 
        u.identificacion = p_identificacion;
END$$
DELIMITER ;

-- PROCEDURE sp_crear_contratista (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_crear_contratista`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_crear_contratista`(
    IN p_nombre VARCHAR(100),
    IN p_identificacion VARCHAR(50),
    IN p_telefono VARCHAR(20),
    IN p_email VARCHAR(100)
)
BEGIN
    INSERT INTO contratistas (nombre, identificacion, telefono, email)
    VALUES (p_nombre, p_identificacion, p_telefono, p_email);
END$$
DELIMITER ;

-- PROCEDURE sp_crear_contrato (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_crear_contrato`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_crear_contrato`(
    IN p_id_contratista INT,
    IN p_fecha_inicio DATE,
    IN p_fecha_fin DATE,
    IN p_valor DECIMAL(18,2)
)
BEGIN
    INSERT INTO contratos (id_contratista, fecha_inicio, fecha_fin, valor)
    VALUES (p_id_contratista, p_fecha_inicio, p_fecha_fin, p_valor);
END$$
DELIMITER ;

-- PROCEDURE sp_crear_orden_compra (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_crear_orden_compra`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_crear_orden_compra`(
    IN p_id_contrato INT,
    IN p_fecha DATE,
    IN p_monto DECIMAL(18,2)
)
BEGIN
    INSERT INTO ordenes_compra (id_contrato, fecha, monto)
    VALUES (p_id_contrato, p_fecha, p_monto);
END$$
DELIMITER ;

-- PROCEDURE sp_crear_perfil (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_crear_perfil`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_crear_perfil`(
    IN p_perfil VARCHAR(50),
    IN p_estado VARCHAR(10)
)
BEGIN
    DECLARE v_id INT;

    INSERT INTO perfiles (perfil, estado, fecha_creacion, fecha_actualizacion)
    VALUES (p_perfil, p_estado, CURDATE(), CURDATE());

    SET v_id = LAST_INSERT_ID();

    SELECT v_id AS id_perfil, 'Perfil creado correctamente' AS mensaje, 1 AS exito;
END$$
DELIMITER ;

-- PROCEDURE sp_crear_proveedor (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_crear_proveedor`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_crear_proveedor`(
    IN p_nombre VARCHAR(100),
    IN p_nit VARCHAR(50),
    IN p_direccion VARCHAR(150),
    IN p_telefono VARCHAR(20),
    IN p_email VARCHAR(100)
)
BEGIN
    INSERT INTO proveedores (nombre, nit, direccion, telefono, email)
    VALUES (p_nombre, p_nit, p_direccion, p_telefono, p_email);
END$$
DELIMITER ;

-- PROCEDURE sp_crear_proyecto (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_crear_proyecto`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_crear_proyecto`(
    IN p_nombre VARCHAR(100),
    IN p_descripcion TEXT,
    IN p_fecha_inicio DATE,
    IN p_fecha_fin DATE
)
BEGIN
    INSERT INTO proyectos (nombre, descripcion, fecha_inicio, fecha_fin)
    VALUES (p_nombre, p_descripcion, p_fecha_inicio, p_fecha_fin);
END$$
DELIMITER ;

-- PROCEDURE sp_delete_detalle (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_delete_detalle`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_delete_detalle`(IN vod_id INT)
BEGIN
    DELETE FROM ordenes_compra_detalles WHERE od_id = vod_id;
END$$
DELIMITER ;

-- PROCEDURE sp_delete_orden (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_delete_orden`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_delete_orden`(IN vo_id INT)
BEGIN
    DELETE FROM ordenes_compra WHERE o_id = vo_id;
END$$
DELIMITER ;

-- PROCEDURE sp_delete_proveedor (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_delete_proveedor`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_delete_proveedor`(IN p_id INT)
BEGIN
    DELETE FROM proveedores WHERE p_id = p_id;
END$$
DELIMITER ;

-- PROCEDURE sp_delete_proyecto (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_delete_proyecto`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_delete_proyecto`(IN pr_id INT)
BEGIN
    DELETE FROM proyectos WHERE pr_id = pr_id;
END$$
DELIMITER ;

-- PROCEDURE sp_eliminar_contratista (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_eliminar_contratista`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_eliminar_contratista`(
    IN p_id INT
)
BEGIN
    DELETE FROM contratistas WHERE id = p_id;
END$$
DELIMITER ;

-- PROCEDURE sp_eliminar_contrato (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_eliminar_contrato`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_eliminar_contrato`(
    IN p_id INT
)
BEGIN
    DELETE FROM contratos WHERE id = p_id;
END$$
DELIMITER ;

-- PROCEDURE sp_eliminar_orden_compra (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_eliminar_orden_compra`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_eliminar_orden_compra`(
    IN p_id INT
)
BEGIN
    DELETE FROM ordenes_compra WHERE id = p_id;
END$$
DELIMITER ;

-- PROCEDURE sp_eliminar_orden_compra_detalle (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_eliminar_orden_compra_detalle`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_eliminar_orden_compra_detalle`(
    IN p_id INT
)
BEGIN
    DELETE FROM ordenes_compra_detalles WHERE id = p_id;
END$$
DELIMITER ;

-- PROCEDURE sp_eliminar_proveedor (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_eliminar_proveedor`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_eliminar_proveedor`(
    IN p_id INT
)
BEGIN
    DELETE FROM proveedores WHERE id = p_id;
END$$
DELIMITER ;

-- PROCEDURE sp_eliminar_proyecto (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_eliminar_proyecto`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_eliminar_proyecto`(
    IN p_id INT
)
BEGIN
    DELETE FROM proyectos WHERE id = p_id;
END$$
DELIMITER ;

-- PROCEDURE sp_get_detalles_por_orden (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_get_detalles_por_orden`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_get_detalles_por_orden`(IN od_o_id INT)
BEGIN
    SELECT * FROM ordenes_compra_detalles WHERE od_o_id = od_o_id;
END$$
DELIMITER ;

-- PROCEDURE sp_get_ordenes (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_get_ordenes`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_get_ordenes`()
BEGIN
    SELECT * FROM ordenes_compra;
END$$
DELIMITER ;

-- PROCEDURE sp_get_proveedores (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_get_proveedores`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_get_proveedores`()
BEGIN
    SELECT * FROM proveedores;
END$$
DELIMITER ;

-- PROCEDURE sp_get_proyectos (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_get_proyectos`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_get_proyectos`()
BEGIN
    SELECT * FROM proyectos;
END$$
DELIMITER ;

-- PROCEDURE sp_insertar_actas_pago_plano (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_insertar_actas_pago_plano`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_insertar_actas_pago_plano`(
    IN p_ref VARCHAR(50),
    IN p_empresa VARCHAR(100),
    IN p_numero_contrato VARCHAR(50),
    IN p_item VARCHAR(50),
    IN p_cant VARCHAR(255),
    IN p_um VARCHAR(20),
    IN p_descripcion TEXT,
    IN p_valor_base DECIMAL(18,2),
    IN p_valor_total DECIMAL(18,2),
    IN p_tipo_doc VARCHAR(50)
)
BEGIN
    INSERT INTO actas_pago_plano (
        ref,
        empresa,
        numero_contrato,
        item,
        cant,
        um,
        descripcion,
        valor_base,
        valor_total,
        tipo_doc,
        fecha_creacion
    )
    VALUES (
        p_ref,
        p_empresa,
        p_numero_contrato,
        p_item,
        p_cant,
        p_um,
        p_descripcion,
        p_valor_base,
        p_valor_total,
        p_tipo_doc,
        NOW()
    );
END$$
DELIMITER ;

-- PROCEDURE sp_insertar_acta_pago_completa (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_insertar_acta_pago_completa`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_insertar_acta_pago_completa`(
    IN p_ref VARCHAR(50),
    IN p_empresa VARCHAR(100),
    IN p_numero_contrato VARCHAR(50),
    IN p_tipo_doc VARCHAR(50),
    IN p_vr_total_documento DECIMAL(18,2),
    IN p_base_retenciones DECIMAL(18,2),
    IN p_total_a_pagar DECIMAL(18,2)
)
BEGIN
    DECLARE v_acta_id INT;

    START TRANSACTION;

    INSERT INTO actas_pago_plano (
        ref,
        empresa,
        numero_contrato,
        tipo_doc,
        vr_total_documento,
        base_retenciones,
        total_a_pagar,
        fecha_creacion
    )
    VALUES (
        p_ref,
        p_empresa,
        p_numero_contrato,
        p_tipo_doc,
        p_vr_total_documento,
        p_base_retenciones,
        p_total_a_pagar,
        NOW()
    );

    SET v_acta_id = LAST_INSERT_ID();

    COMMIT;
END$$
DELIMITER ;

-- PROCEDURE sp_insertar_aiu (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_insertar_aiu`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_insertar_aiu`(
    IN p_item VARCHAR(50),
    IN p_empresa VARCHAR(100),
    IN p_insumo VARCHAR(255),       
    IN p_ref VARCHAR(50),
    IN p_cant DECIMAL(10,2),
    IN p_und VARCHAR(10),
    IN p_ancho DECIMAL(10,2),
    IN p_alto DECIMAL(10,2),
    IN p_descripcion TEXT,
    IN p_valor_base DECIMAL(15,2),
    IN p_porc_adm DECIMAL(5,2),
    IN p_vr_adm DECIMAL(15,2),
    IN p_porc_imp DECIMAL(5,2),
    IN p_vr_imp DECIMAL(15,2),
    IN p_porc_ut DECIMAL(5,2),
    IN p_vr_ut DECIMAL(15,2),
    IN p_porc_iva DECIMAL(5,2),
    IN p_vr_iva DECIMAL(15,2),
    IN p_vr_total DECIMAL(15,2),
    IN p_tipo_doc VARCHAR(50),
    IN p_numdoc VARCHAR(50)
)
BEGIN
  INSERT INTO aiu (
    item, empresa, insumo, ref, cant, und, ancho, alto, descripcion,
    valor_base, porc_adm, vr_adm, porc_imp, vr_imp,
    porc_ut, vr_ut, porc_iva, vr_iva, vr_total,
    tipo_doc, numdoc
  )
  VALUES (
    p_item, p_empresa, p_insumo, p_ref, p_cant, p_und, p_ancho, p_alto, p_descripcion,
    p_valor_base, p_porc_adm, p_vr_adm, p_porc_imp, p_vr_imp,
    p_porc_ut, p_vr_ut, p_porc_iva, p_vr_iva, p_vr_total,
    p_tipo_doc, p_numdoc
  );
END$$
DELIMITER ;

-- PROCEDURE sp_insertar_iva_pleno (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_insertar_iva_pleno`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_insertar_iva_pleno`(
    IN p_item VARCHAR(50),
    IN p_empresa VARCHAR(100),
    IN p_insumo VARCHAR(255),       -- <-- nuevo
    IN p_ref VARCHAR(50),
    IN p_cant DECIMAL(10,2),
    IN p_und VARCHAR(10),
    IN p_ancho DECIMAL(10,2),
    IN p_alto DECIMAL(10,2),
    IN p_descripcion TEXT,
    IN p_valor_base DECIMAL(15,2),
    IN p_porc_iva DECIMAL(5,2),
    IN p_vr_iva DECIMAL(15,2),
    IN p_vr_total DECIMAL(15,2),
    IN p_tipo_doc VARCHAR(50),
    IN p_numdoc VARCHAR(50)
)
BEGIN
  INSERT INTO iva_pleno (
    item, empresa, insumo, ref, cant, und, ancho, alto, descripcion,
    valor_base, porc_iva, vr_iva, vr_total, tipo_doc, numdoc
  )
  VALUES (
    p_item, p_empresa, p_insumo, p_ref, p_cant, p_und, p_ancho, p_alto, p_descripcion,
    p_valor_base, p_porc_iva, p_vr_iva, p_vr_total, p_tipo_doc, p_numdoc
  );
END$$
DELIMITER ;

-- PROCEDURE sp_insertar_orden_compra (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_insertar_orden_compra`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_insertar_orden_compra`(
    IN p_contrato VARCHAR(50),
    IN p_item VARCHAR(50),
    IN p_elemento VARCHAR(255),
    IN p_descripcion TEXT,
    IN p_ubicacion VARCHAR(255),
    IN p_um VARCHAR(20),
    IN p_base DECIMAL(15,2),
    IN p_altura DECIMAL(15,2),
    IN p_total DECIMAL(15,2),
    IN p_otros TEXT,
    IN p_cantidad DECIMAL(15,2),
    IN p_proveedor VARCHAR(255),
    IN p_tipo_doc VARCHAR(50),
    IN p_numdoc VARCHAR(50)
)
BEGIN

    INSERT INTO orden_compra (
        contrato,
        item,
        elemento,
        descripcion,
        ubicacion,
        um,
        base,
        altura,
        total,
        otros,
        cantidad,
        proveedor,
        tipo_doc,
        numdoc
    )
    VALUES (
        p_contrato,
        p_item,
        p_elemento,
        p_descripcion,
        p_ubicacion,
        p_um,
        p_base,
        p_altura,
        p_total,
        p_otros,
        p_cantidad,
        p_proveedor,
        p_tipo_doc,
        p_numdoc
    );

END$$
DELIMITER ;

-- PROCEDURE sp_insertar_parametro_documento (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_insertar_parametro_documento`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_insertar_parametro_documento`(
    IN p_tipo_doc VARCHAR(50),
    IN p_nombre_campo_doc VARCHAR(50),
    IN p_desc_campo_doc VARCHAR(50),
    IN p_estadocampo VARCHAR(20)
)
BEGIN
    INSERT INTO parametros_documentos (
        tipo_doc,
        nombre_campo_doc,
        desc_campo_doc,
        estadocampo
    ) VALUES (
        p_tipo_doc,
        p_nombre_campo_doc,
        p_desc_campo_doc,
        p_estadocampo
    );
END$$
DELIMITER ;

-- PROCEDURE sp_insertar_usuario (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_insertar_usuario`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_insertar_usuario`(
    IN p_identificacion VARCHAR(20),
    IN p_nombre VARCHAR(50),
    IN p_apellido VARCHAR(50),
    IN p_email VARCHAR(50),
    in p_idrol varchar(20),
    in p_idperfil varchar(20)
)
BEGIN
DECLARE idrol varchar(20);
	
    IF EXISTS (SELECT 1 FROM usuarios WHERE identificacion = p_identificacion OR email = p_email) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Identificación o correo ya existe';
    ELSE
        INSERT INTO usuarios (identificacion, nombre, apellido, email, password, estado, fecha_creacion, fecha_actualizacion)
        VALUES (p_identificacion, p_nombre, p_apellido, p_email,  sha2('12345678',256), 'INACTIVO', NOW(), NOW());
        /*insertar el consumo del SP sp_insertar_usuario_perfil */
		select id_usuario 
			into @id_usuario from usuarios 
		where identificacion=p_identificacion;
		/*llamar al SP insertar usuario perfil para insertar el consumo del SP sp_insertar_usuario_perfil */
        INSERT INTO notificaciones_pendientes(correo_destino, asunto, mensaje)
        VALUES( p_email, 'Activa tu cuenta', CONCAT('Hola ', p_nombre, ', tu cuenta ha sido creada. Por favor ingresa al sistema para habilitarla. http://localhost:4200/changePassword')
    );
        
		CALL sp_insertar_usuario_perfil( @id_usuario, p_idperfil, p_idrol);
		SELECT 'Usuario creado exitosamente' AS message, 1 AS code; -- <- esto es clave
	END IF;
END$$
DELIMITER ;

-- PROCEDURE sp_insertar_usuario_perfil (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_insertar_usuario_perfil`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_insertar_usuario_perfil`(
    IN p_id_usuario INT,
    IN p_id_perfil INT,
    IN p_id_rol INT
)
BEGIN
    INSERT INTO r_usuarios_perfiles (
        id_usuario,
        id_perfil,
        descripcion,
        id_rol,
        fecha_creacion,
        fecha_actualizacion
    ) VALUES (
        p_id_usuario,
        p_id_perfil,
        'N/A',
        p_id_rol,
        CURRENT_DATE(),
        CURRENT_DATE()
    );
END$$
DELIMITER ;

-- PROCEDURE sp_insert_detalle (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_insert_detalle`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_insert_detalle`(
    IN od_o_id INT,
    IN od_insumo VARCHAR(100),
    IN od_um VARCHAR(5),
    IN od_cant INT,
    IN od_valor_unitario DOUBLE,
    IN od_descuento DOUBLE,
    IN od_iva DOUBLE,
    IN od_total DOUBLE
)
BEGIN
    INSERT INTO ordenes_compra_detalles (od_o_id, od_insumo, od_um, od_cant, od_valor_unitario, od_descuento, od_iva, od_total)
    VALUES (od_o_id, od_insumo, od_um, od_cant, od_valor_unitario, od_descuento, od_iva, od_total);
END$$
DELIMITER ;

-- PROCEDURE sp_insert_orden (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_insert_orden`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_insert_orden`(
    IN o_id_proveedor INT,
    IN o_id_proyecto INT,
    IN o_observaciones TEXT,
    IN o_total DOUBLE,
    IN o_ciudad VARCHAR(50)
)
BEGIN
    INSERT INTO ordenes_compra (o_id_proveedor, o_id_proyecto, o_observaciones, o_total, o_ciudad)
    VALUES (o_id_proveedor, o_id_proyecto, o_observaciones, o_total, o_ciudad);
END$$
DELIMITER ;

-- PROCEDURE sp_insert_proveedor (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_insert_proveedor`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_insert_proveedor`(
    IN p_nit VARCHAR(20),
    IN p_razon_social VARCHAR(50),
    IN p_direccion VARCHAR(50),
    IN p_ciudad VARCHAR(50),
    IN p_telefono VARCHAR(13),
    IN p_email VARCHAR(50),
    IN p_contacto VARCHAR(20),
    IN p_cond_pago VARCHAR(30)
)
BEGIN
    INSERT INTO proveedores (p_nit, p_razon_social, p_direccion, p_ciudad, p_telefono, p_email, p_contacto, p_cond_pago)
    VALUES (p_nit, p_razon_social, p_direccion, p_ciudad, p_telefono, p_email, p_contacto, p_cond_pago);
END$$
DELIMITER ;

-- PROCEDURE sp_insert_proyecto (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_insert_proyecto`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_insert_proyecto`(
    IN pr_nit VARCHAR(20),
    IN pr_razon_social VARCHAR(50),
    IN pr_direccion VARCHAR(50),
    IN pr_ciudad VARCHAR(50),
    IN pr_telefono VARCHAR(13),
    IN pr_email VARCHAR(50),
    IN pr_contacto VARCHAR(20),
    IN pr_fecha_entrega TIMESTAMP
)
BEGIN
    INSERT INTO proyectos (pr_nit, pr_razon_social, pr_direccion, pr_ciudad, pr_telefono, pr_email, pr_contacto, pr_fecha_entrega)
    VALUES (pr_nit, pr_razon_social, pr_direccion, pr_ciudad, pr_telefono, pr_email, pr_contacto, pr_fecha_entrega);
END$$
DELIMITER ;

-- PROCEDURE sp_obtener_tipo_documentos (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_obtener_tipo_documentos`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_obtener_tipo_documentos`()
BEGIN
    SELECT DISTINCT tipo_doc 
    FROM parametros_documentos
    WHERE estadocampo = '1';
END$$
DELIMITER ;

-- PROCEDURE sp_perfiles_activos (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_perfiles_activos`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_perfiles_activos`()
BEGIN
    SELECT id_perfil, perfil
    FROM perfiles
    WHERE estado = 'ACTIVO';
END$$
DELIMITER ;

-- PROCEDURE sp_registrar_login_log (sql_mode=NO_AUTO_VALUE_ON_ZERO)
DROP PROCEDURE IF EXISTS `sp_registrar_login_log`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_registrar_login_log`(
    IN p_id_usuario INT,
    IN p_ip_origen VARCHAR(100),
    IN p_exito TINYINT(1),
    IN p_detalle_error VARCHAR(255)
)
BEGIN
    INSERT INTO login_logs (id_usuario, ip_origen, exito, fecha_login, detalle_error)
    VALUES (p_id_usuario, p_ip_origen, p_exito, NOW(), p_detalle_error);
END$$
DELIMITER ;

-- PROCEDURE sp_update_detalle (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_update_detalle`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_update_detalle`(
    IN od_id INT,
    IN od_insumo VARCHAR(100),
    IN od_um VARCHAR(5),
    IN od_cant INT,
    IN od_valor_unitario DOUBLE,
    IN od_descuento DOUBLE,
    IN od_iva DOUBLE,
    IN od_total DOUBLE
)
BEGIN
    UPDATE ordenes_compra_detalles
    SET od_insumo = od_insumo,
        od_um = od_um,
        od_cant = od_cant,
        od_valor_unitario = od_valor_unitario,
        od_descuento = od_descuento,
        od_iva = od_iva,
        od_total = od_total
    WHERE od_id = od_id;
END$$
DELIMITER ;

-- PROCEDURE sp_update_orden (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_update_orden`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_update_orden`(
    IN o_id INT,
    IN o_id_proveedor INT,
    IN o_id_proyecto INT,
    IN o_observaciones TEXT,
    IN o_total DOUBLE,
    IN o_ciudad VARCHAR(50)
)
BEGIN
    UPDATE ordenes_compra
    SET o_id_proveedor = o_id_proveedor,
        o_id_proyecto = o_id_proyecto,
        o_observaciones = o_observaciones,
        o_total = o_total,
        o_ciudad = o_ciudad
    WHERE o_id = o_id;
END$$
DELIMITER ;

-- PROCEDURE sp_update_proveedor (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_update_proveedor`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_update_proveedor`(
    IN p_id INT,
    IN p_nit VARCHAR(20),
    IN p_razon_social VARCHAR(50),
    IN p_direccion VARCHAR(50),
    IN p_ciudad VARCHAR(50),
    IN p_telefono VARCHAR(13),
    IN p_email VARCHAR(50),
    IN p_contacto VARCHAR(20),
    IN p_cond_pago VARCHAR(30)
)
BEGIN
    UPDATE proveedores
    SET p_nit = p_nit,
        p_razon_social = p_razon_social,
        p_direccion = p_direccion,
        p_ciudad = p_ciudad,
        p_telefono = p_telefono,
        p_email = p_email,
        p_contacto = p_contacto,
        p_cond_pago = p_cond_pago
    WHERE p_id = p_id;
END$$
DELIMITER ;

-- PROCEDURE sp_update_proyecto (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_update_proyecto`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_update_proyecto`(
    IN pr_id INT,
    IN pr_nit VARCHAR(20),
    IN pr_razon_social VARCHAR(50),
    IN pr_direccion VARCHAR(50),
    IN pr_ciudad VARCHAR(50),
    IN pr_telefono VARCHAR(13),
    IN pr_email VARCHAR(50),
    IN pr_contacto VARCHAR(20),
    IN pr_fecha_entrega TIMESTAMP
)
BEGIN
    UPDATE proyectos
    SET pr_nit = pr_nit,
        pr_razon_social = pr_razon_social,
        pr_direccion = pr_direccion,
        pr_ciudad = pr_ciudad,
        pr_telefono = pr_telefono,
        pr_email = pr_email,
        pr_contacto = pr_contacto,
        pr_fecha_entrega = pr_fecha_entrega
    WHERE pr_id = pr_id;
END$$
DELIMITER ;

-- PROCEDURE SP_USUARIOS_SEL (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `SP_USUARIOS_SEL`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `SP_USUARIOS_SEL`()
BEGIN
	SELECT 
		u.id_usuario,
        u.identificacion,
        u.nombre,
        u.apellido,
        u.email,
        p.id_perfil,
        p.perfil,
        u.estado,
        u.fecha_creacion,
        u.fecha_actualizacion
	FROM usuarios u
    INNER JOIN r_usuarios_perfiles rup 
        ON rup.id_usuario = u.id_usuario
    INNER JOIN perfiles p 
        ON p.id_perfil = rup.id_perfil
    WHERE u.estado = 'ACTIVO'
      AND p.estado = 'ACTIVO'
    ORDER BY u.nombre, u.apellido;
END$$
DELIMITER ;

-- PROCEDURE sp_ver_dependencias_tabla (sql_mode=ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION)
DROP PROCEDURE IF EXISTS `sp_ver_dependencias_tabla`;
DELIMITER $$
CREATE DEFINER=`root`@`localhost` PROCEDURE `sp_ver_dependencias_tabla`(IN p_tabla VARCHAR(100))
BEGIN
  -- Procedimientos y funciones que contienen la tabla
  SELECT 'ROUTINE' AS tipo_objeto, ROUTINE_TYPE AS sub_tipo, ROUTINE_NAME AS nombre_objeto,
         ROUTINE_SCHEMA AS esquema, 'ROUTINES' AS origen
  FROM information_schema.ROUTINES
  WHERE ROUTINE_DEFINITION LIKE CONCAT('%', p_tabla, '%')

  UNION

  -- Vistas que contienen la tabla
  SELECT 'VIEW', NULL, TABLE_NAME, TABLE_SCHEMA, 'VIEWS'
  FROM information_schema.VIEWS
  WHERE VIEW_DEFINITION LIKE CONCAT('%', p_tabla, '%')

  UNION

  -- Triggers asociados a la tabla
  SELECT 'TRIGGER', EVENT_MANIPULATION, TRIGGER_NAME, TRIGGER_SCHEMA, 'TRIGGERS'
  FROM information_schema.TRIGGERS
  WHERE EVENT_OBJECT_TABLE = p_tabla

  UNION

  -- Eventos programados que hacen referencia a la tabla
  SELECT 'EVENT', NULL, EVENT_NAME, EVENT_SCHEMA, 'EVENTS'
  FROM information_schema.EVENTS
  WHERE EVENT_DEFINITION LIKE CONCAT('%', p_tabla, '%');
END$$
DELIMITER ;
