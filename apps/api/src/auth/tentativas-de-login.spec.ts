import { describe, expect, it } from 'vitest';
import { MuitasTentativasException, TentativasDeLoginService } from './tentativas-de-login';

function relogio() {
  let instante = 1_000_000;
  return { agora: () => instante, avancar: (ms: number) => (instante += ms) };
}

describe('TentativasDeLoginService', () => {
  it('bloqueia a conta depois de 10 falhas e libera quando a janela passa', () => {
    const tempo = relogio();
    const tentativas = new TentativasDeLoginService(tempo.agora);
    for (let i = 0; i < 10; i++) tentativas.registrarFalha('1.1.1.1', 'ana@x.test');

    expect(() => tentativas.verificar('1.1.1.1', 'ana@x.test')).toThrow(MuitasTentativasException);
    expect(() => tentativas.verificar('1.1.1.1', 'bia@x.test')).not.toThrow();
    expect(() => tentativas.verificar('2.2.2.2', 'ana@x.test')).not.toThrow();

    tempo.avancar(15 * 60 * 1000 + 1);
    expect(() => tentativas.verificar('1.1.1.1', 'ana@x.test')).not.toThrow();
  });

  it('informa quanto tempo falta para liberar', () => {
    const tempo = relogio();
    const tentativas = new TentativasDeLoginService(tempo.agora);
    for (let i = 0; i < 10; i++) tentativas.registrarFalha('1.1.1.1', 'ana@x.test');
    tempo.avancar(5 * 60 * 1000);
    try {
      tentativas.verificar('1.1.1.1', 'ana@x.test');
      expect.unreachable();
    } catch (erro) {
      expect((erro as MuitasTentativasException).retryAfterSegundos).toBe(10 * 60);
    }
  });

  it('login bem-sucedido zera a contagem da conta', () => {
    const tentativas = new TentativasDeLoginService();
    for (let i = 0; i < 9; i++) tentativas.registrarFalha('1.1.1.1', 'ana@x.test');
    tentativas.registrarSucesso('1.1.1.1', 'ana@x.test');
    for (let i = 0; i < 9; i++) tentativas.registrarFalha('1.1.1.1', 'ana@x.test');
    expect(() => tentativas.verificar('1.1.1.1', 'ana@x.test')).not.toThrow();
  });

  it('bloqueia um IP que varre muitas contas diferentes', () => {
    const tentativas = new TentativasDeLoginService();
    for (let i = 0; i < 100; i++) tentativas.registrarFalha('1.1.1.1', `pessoa${i}@x.test`);
    expect(() => tentativas.verificar('1.1.1.1', 'nova@x.test')).toThrow(MuitasTentativasException);
  });
});
