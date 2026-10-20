export function validateAuthFields({ register, name, email, password }) {
  const errors = {};
  const normalizedEmail = email.trim();

  if (register && !name.trim()) errors.name = 'Enter your full name.';
  else if (register && name.trim().length > 50) errors.name = 'Your name must be 50 characters or fewer.';

  if (!normalizedEmail) errors.email = 'Enter your email address.';
  else if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    errors.email = 'Enter a valid email address.';
  }

  if (!password) errors.password = 'Enter your password.';
  else if (register && password.length < 12) errors.password = 'Password must be at least 12 characters.';
  else if (password.length > 128) errors.password = 'Password must be 128 characters or fewer.';

  return errors;
}
