const db = require("../../../config/db")

const getAllUsers = (req, res) => {
    db.query("CALL SP_USUARIOS_SEL()", (err, results) => {
        if(err){
            return res.status(500).json({
                success : false,
                message: "Error a consultar los usuarios",
                error: err
            })
        }
        return res.status(200).json({
            success : true,
            data: results[0]
        })
    })
}

module.exports = { getAllUsers }