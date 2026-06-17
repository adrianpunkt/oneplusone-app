export function getRuntimeEnv(name: string) {
  return process.env[name]?.trim() || "";
}
