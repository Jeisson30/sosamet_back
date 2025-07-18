const db = require("../../config/db");

// 🔹 Función para inferir el tipo de campo
const inferirTipoCampo = (nombreCampo, descripcionCampo) => {
    const nombre = nombreCampo.toLowerCase();
    const descripcion = descripcionCampo.toLowerCase();

    if (nombre.includes("fecha") || descripcion.includes("fecha")) return "date";
    if (nombre.includes("email")) return "email";
    if (nombre.includes("telefono") || nombre.includes("celular")) return "tel";
    if (nombre.includes("foto") || descripcion.includes("evidencia")) return "file";

    if (
        descripcion.includes("alfanumerico") ||
        nombre.includes("numero_contrato") ||
        descripcion.includes("número de contrato")
    ) return "text";

    if (
        nombre.includes("nit") ||
        nombre.includes("cedula") ||
        nombre.includes("documento") ||
        descripcion.includes("cantidad") ||
        descripcion.includes("valor")
    ) return "number";

    return "text"; // default
};


const getTypeFields = (req, res) => {
    const tipoDoc = req.params.type;

    if (!tipoDoc) {
        return res.status(400).json({
            message: "El parámetro 'type' es requerido.",
        });
    }

    db.query("CALL SP_GET_CAMPOS_POR_TIPO(?)", [tipoDoc], (err, results) => {
        if (err) {
            console.error("Error al ejecutar el SP:", err);
            return res.status(500).json({
                message: "Error al obtener los campos del tipo de documento.",
                error: err,
            });
        }

        const campos = results[0];

        if (!campos || campos.length === 0) {
            return res.status(404).json({
                message: `No se encontraron campos para el tipo de documento '${tipoDoc}'.`,
            });
        }

        // 🔹 Anexar tipo_dato dinámico
        const camposConTipo = campos.map(campo => ({
            ...campo,
            tipo_dato: inferirTipoCampo(campo.nombre_campo_doc, campo.desc_campo_doc)
        }));
        

        res.status(200).json(camposConTipo);
    });
};

module.exports = { getTypeFields };
