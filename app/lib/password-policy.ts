export function meetsPasswordPolicy(password:string){
  return password.length>=8&&/[a-z]/.test(password)&&/[A-Z]/.test(password)&&/\d/.test(password)&&/[^A-Za-z0-9]/.test(password);
}

export const passwordRequirements="Use at least eight characters, including upper and lowercase letters, a number and a symbol.";
