export const demoMemberEmail = "hello@oneplusoneclub.com";

export function isDemoMemberEmail(email: string) {
  return email.trim().toLowerCase() === demoMemberEmail;
}
