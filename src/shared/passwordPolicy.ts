export interface PasswordPolicyResult {
  valid: boolean;
  errors: string[];
}

const SPECIAL = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/;
const DIGIT = /\d/;
const LETTER = /[a-zA-Z]/;

export function validateMasterPassword(password: string): PasswordPolicyResult {
  const errors: string[] = [];

  if (password.length < 12) {
    errors.push("At least 12 characters");
  }
  if (!LETTER.test(password)) {
    errors.push("At least one letter");
  }
  if (!DIGIT.test(password)) {
    errors.push("At least one number");
  }
  if (!SPECIAL.test(password)) {
    errors.push("At least one special character (!@#$% etc.)");
  }

  return { valid: errors.length === 0, errors };
}

export function masterPasswordPolicyHint(): string {
  return "12+ characters, with a letter, a number, and a special character.";
}
