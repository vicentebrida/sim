import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type Browser,
  createApp,
  createCollaborator,
  signInAsAdministrator,
  type TestApp,
} from './support/app';

describe('Similar Ideas', () => {
  let sim: TestApp;
  let admin: Browser;
  let ana: Browser;
  let carla: Browser;
  let ti: string;
  let field: { situation: string; proposal: string };
  const number: Record<string, number> = {};

  async function publish(title: string, situation: string, proposal: string, who = ana) {
    const { body } = await who
      .post('/api/ideas')
      .send({
        title,
        categoryId: ti,
        values: { [field.situation]: situation, [field.proposal]: proposal },
        publish: true,
      })
      .expect(201);
    return body.number as number;
  }

  async function similar(title: string, text = '', extra: Record<string, unknown> = {}) {
    const { body } = await carla
      .get('/api/ideas/similar')
      .query({ title, text, ...extra })
      .expect(200);
    return (body as { title: string }[]).map((idea) => idea.title);
  }

  beforeAll(async () => {
    sim = await createApp();
    admin = await signInAsAdministrator(sim);
    ana = (await createCollaborator(sim, admin, 'Ana')).browser;
    carla = (await createCollaborator(sim, admin, 'Carla')).browser;
    ti = (await admin.post('/api/categories').send({ name: 'Geral' }).expect(201)).body.id;
    const fields = (await ana.get('/api/custom-fields').expect(200)).body as {
      id: string;
      label: string;
    }[];
    const byLabel = (label: string) => fields.find((f) => f.label === label)!.id;
    field = { situation: byLabel('Situação atual'), proposal: byLabel('Proposta') };

    number.sales = await publish(
      'Relatório de vendas mais rápido',
      'O relatório mensal de vendas leva duas horas para gerar no ERP',
      'Agendar a geração durante a madrugada',
    );
    number.coffee = await publish(
      'Máquina de café nova na copa',
      'A máquina do terceiro andar vive quebrada',
      'Comprar uma máquina nova',
    );
    number.parking = await publish(
      'Estacionamento para motos',
      'Faltam vagas cobertas para motocicletas',
      'Demarcar vagas no subsolo',
    );
    number.payroll = await publish(
      'Exportar folha de pagamento para Excel',
      'O RH digita a folha à mão numa planilha',
      'Gerar o arquivo direto do sistema de folha',
    );
    number.helpdesk = await publish(
      'Melhorar o sistema de chamados de TI',
      'Chamados demoram para ser atendidos',
      'Priorizar por impacto',
    );
  });

  afterAll(() => sim.close());

  it.each([
    ['Relatorio de vendas demora', '', 'Relatório de vendas mais rápido'],
    ['Gerar relatórios de vendas mais rápido', '', 'Relatório de vendas mais rápido'],
    [
      'Agilizar o relatório de vendas',
      'Hoje gerar o relatório de vendas no ERP demora horas',
      'Relatório de vendas mais rápido',
    ],
    [
      'Planilha da folha do RH',
      'Exportar a folha em Excel',
      'Exportar folha de pagamento para Excel',
    ],
    ['Vagas para moto', '', 'Estacionamento para motos'],
    ['Mais vagas de estacionamento', '', 'Estacionamento para motos'],
    ['Chamados de TI demoram', '', 'Melhorar o sistema de chamados de TI'],
    ['Cafe', '', 'Máquina de café nova na copa'],
  ])(
    '"%s" finds the existing Idea (accents and word forms do not matter)',
    async (title, text, expected) => {
      expect((await similar(title, text))[0]).toBe(expected);
    },
  );

  it.each([
    ['Melhorar a comunicação interna', 'Criar um mural de avisos'],
    ['Sistema de ponto eletrônico', 'Melhorar o registro de ponto dos funcionários'],
    ['Trocar as cadeiras do escritório', 'As cadeiras estão quebradas e causam dor nas costas'],
  ])('"%s" shares only generic words and finds nothing', async (title, text) => {
    expect(await similar(title, text)).toEqual([]);
  });

  it('includes Archived Ideas, but not Duplicates or Drafts', async () => {
    const archived = await publish(
      'Horta comunitária no pátio',
      'O pátio dos fundos está sem uso',
      'Fazer uma horta',
    );
    await admin
      .post(`/api/ideas/${archived}/status`)
      .send({ to: 'archived', justification: 'Sem andamento' })
      .expect(200);
    expect(await similar('Horta no pátio')).toEqual(['Horta comunitária no pátio']);

    const duplicate = await publish('Horta comunitária nos fundos', 'Pátio sem uso', 'Horta');
    await admin
      .post(`/api/ideas/${duplicate}/status`)
      .send({ to: 'duplicate', justification: 'Repetida', originalIdeaNumber: archived })
      .expect(200);
    await ana
      .post('/api/ideas')
      .send({ title: 'Horta comunitária com temperos', categoryId: ti })
      .expect(201);

    expect(await similar('Horta comunitária')).toEqual(['Horta comunitária no pátio']);
  });

  it('leaves out the Idea being edited', async () => {
    expect(await similar('Estacionamento para motos', '', { exclude: number.parking })).toEqual([]);
  });

  it('follows the Administrator choice of fields used for detection', async () => {
    // "subsolo" only appears in the Proposta field of the parking Idea.
    expect(await similar('Demarcar subsolo', '')).toEqual(['Estacionamento para motos']);
    await admin
      .patch(`/api/custom-fields/${field.proposal}`)
      .send({ useForDetection: false })
      .expect(200);
    expect(await similar('Demarcar subsolo', '')).toEqual([]);
    await admin
      .patch(`/api/custom-fields/${field.proposal}`)
      .send({ useForDetection: true })
      .expect(200);
  });

  it('keeps the detection text up to date when the Idea is edited', async () => {
    const created = await publish('Bebedouro no galpão', 'Calor no galpão', 'Instalar bebedouro');
    expect(await similar('Climatizar o galpão de estoque')).toEqual([]);
    await ana
      .patch(`/api/ideas/${created}`)
      .send({
        values: { [field.situation]: 'Calor no galpão de estoque', [field.proposal]: 'Climatizar' },
      })
      .expect(200);
    expect(await similar('Climatizar o galpão de estoque')).toEqual(['Bebedouro no galpão']);
  });

  it('requires a title with at least 3 characters', async () => {
    await carla.get('/api/ideas/similar').query({ title: 'ab' }).expect(400);
  });
});
