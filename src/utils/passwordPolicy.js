/**
 * Política de contraseña Sosamet (alta por link y recuperación).
 * Mínimo 8, 1 mayúscula, 1 número, 1 carácter especial.
 */

function evaluatePassword(password) {
  const value = String(password || '');
  return {
    minLength: value.length >= 8,
    uppercase: /[A-ZÁÉÍÓÚÑ]/.test(value),
    number: /[0-9]/.test(value),
    special: /[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9]/.test(value),
  };
}

function isPasswordPolicyOk(password) {
  const c = evaluatePassword(password);
  return c.minLength && c.uppercase && c.number && c.special;
}

function passwordPolicyMessage() {
  return 'La contraseña debe tener mínimo 8 caracteres, una mayúscula, un número y un carácter especial.';
}

module.exports = {
  evaluatePassword,
  isPasswordPolicyOk,
  passwordPolicyMessage,
};
