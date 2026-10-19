import { randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

export function hashSenha(senha: string): Promise<string> {
  return hash(senha);
}

let hashFicticio: Promise<string> | undefined;

/**
 * Compara a senha com o hash. Sem hash (Colaborador inexistente ou só SSO), compara com um hash
 * fictício para que o tempo de resposta não revele quais e-mails têm conta.
 */
export async function verificarSenha(senhaHash: string | null | undefined, senha: string) {
  if (!senhaHash) {
    hashFicticio ??= hash(randomBytes(16).toString('hex'));
    await verify(await hashFicticio, senha);
    return false;
  }
  return verify(senhaHash, senha).catch(() => false);
}

export function gerarSenhaTemporaria(): string {
  return randomBytes(12).toString('base64url');
}
