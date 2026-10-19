import { HttpException, HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';

interface Regra {
  maximo: number;
  janelaMs: number;
}

/** Permite controlar o tempo nos testes. */
export const RELOGIO = Symbol('RELOGIO');

const QUINZE_MINUTOS = 15 * 60 * 1000;
// Ataque a uma conta específica.
const POR_CONTA: Regra = { maximo: 10, janelaMs: QUINZE_MINUTOS };
// Varredura de várias contas a partir do mesmo IP.
const POR_IP: Regra = { maximo: 100, janelaMs: QUINZE_MINUTOS };

export class MuitasTentativasException extends HttpException {
  constructor(readonly retryAfterSegundos: number) {
    super(
      'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * Conta só as tentativas de login que falharam; um login bem-sucedido zera a contagem da conta.
 * Fica em memória por instância; com Redis (Marco 2) passa a ser compartilhado entre réplicas.
 * Atrás de proxy reverso, configure SIM_TRUST_PROXY, senão todos os acessos parecem vir do mesmo IP.
 */
@Injectable()
export class TentativasDeLoginService {
  private readonly falhas = new Map<string, number[]>();
  private readonly agora: () => number;

  constructor(@Optional() @Inject(RELOGIO) agora?: () => number) {
    this.agora = agora ?? Date.now;
  }

  private chaves(ip: string, email: string) {
    return [
      { chave: `conta:${ip}|${email}`, regra: POR_CONTA },
      { chave: `ip:${ip}`, regra: POR_IP },
    ];
  }

  private recentes(chave: string, regra: Regra) {
    const limite = this.agora() - regra.janelaMs;
    const recentes = (this.falhas.get(chave) ?? []).filter((instante) => instante > limite);
    if (recentes.length) this.falhas.set(chave, recentes);
    else this.falhas.delete(chave);
    return recentes;
  }

  /** Lança 429 se a conta ou o IP excederam o limite de falhas na janela. */
  verificar(ip: string, email: string) {
    for (const { chave, regra } of this.chaves(ip, email)) {
      const recentes = this.recentes(chave, regra);
      if (recentes.length >= regra.maximo) {
        const liberaEm = recentes[0]! + regra.janelaMs;
        throw new MuitasTentativasException(Math.ceil((liberaEm - this.agora()) / 1000));
      }
    }
  }

  registrarFalha(ip: string, email: string) {
    for (const { chave, regra } of this.chaves(ip, email)) {
      this.falhas.set(chave, [...this.recentes(chave, regra), this.agora()]);
    }
  }

  registrarSucesso(ip: string, email: string) {
    this.falhas.delete(`conta:${ip}|${email}`);
  }
}
