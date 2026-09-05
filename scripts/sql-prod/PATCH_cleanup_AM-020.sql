-- Corrige AM-020: solo debe quedar el ítem 9 (DUCTOS).
-- Ejecutar una vez en el entorno donde se guardó el acta erróneo.

DELETE FROM actas_medida_detalle
 WHERE TRIM(amd_consecutivo) = 'AM-020'
   AND TRIM(amd_item) <> '9';

-- Verificación (debe devolver solo DUCTOS / ítem 9)
SELECT amd_consecutivo, amd_numero_contrato, amd_item, amd_detalle, amd_cantidad
  FROM actas_medida_detalle
 WHERE TRIM(amd_consecutivo) = 'AM-020';
