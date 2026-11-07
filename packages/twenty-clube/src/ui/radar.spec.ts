import { describe, expect, it } from 'vitest';

import {
  autoresDasConclusoes,
  faixaDoEvento,
  montarRadar,
  proximaOcorrencia,
  somarMeses,
} from 'src/ui/radar';

const HOJE = '2026-09-26';

const membro = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Membro ${id}`,
  clubeId: 'c1',
  situacao: 'ATIVO',
  fotoUrl: null,
  nascimento: null,
  entradaEm: null,
  ...extra,
});

const clube = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Clube ${id}`,
  situacao: 'ATIVO',
  mentor: 'Mentor',
  inicio: null,
  mouValidade: null,
  ...extra,
});

const etapa = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Etapa ${id}`,
  escopo: 'CLUBE',
  situacao: 'PENDENTE',
  prazo: null,
  concluidaEm: null,
  responsavel: null,
  clubeId: 'c1',
  membroId: null,
  ...extra,
});

const radar = (entrada: Partial<Parameters<typeof montarRadar>[0]>) =>
  montarRadar({
    hoje: HOJE,
    membros: [],
    clubes: [clube('c1')],
    socios: [],
    dependentes: [],
    etapas: [],
    autorDaConclusao: new Map(),
    ...entrada,
  });

describe('datas que se repetem', () => {
  it('acha o próximo aniversário, inclusive hoje', () => {
    expect(proximaOcorrencia('1980-09-26', HOJE)).toBe('2026-09-26');
    expect(proximaOcorrencia('1980-10-02', HOJE)).toBe('2026-10-02');
    expect(proximaOcorrencia('1980-01-10', HOJE)).toBe('2027-01-10');
  });

  // A equipe grava 0001 quando sabe o dia e não o ano.
  it('funciona com o ano 0001', () => {
    expect(proximaOcorrencia('0001-07-21', HOJE)).toBe('2027-07-21');
  });

  it('põe 29/02 em 28/02 nos anos comuns', () => {
    expect(proximaOcorrencia('2000-02-29', HOJE)).toBe('2027-02-28');
  });

  it('soma meses segurando o fim do mês', () => {
    expect(somarMeses('2026-08-31', 6)).toBe('2027-02-28');
    expect(somarMeses('2026-03-15', 12)).toBe('2027-03-15');
  });
});

describe('o que entra no radar', () => {
  it('mostra o prazo de etapa não concluída e o põe em vencidos quando passou', () => {
    const eventos = radar({ etapas: [etapa('e1', { prazo: '2026-09-20', responsavel: 'Carol' })] });

    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ tipo: 'prazo', dias: -6, link: '/clubes/c1' });
    expect(eventos[0].detalhe).toContain('responsável: Carol');
    expect(faixaDoEvento(eventos[0], 30)).toBe('vencidos');
  });

  it('não cobra prazo de etapa concluída', () => {
    const eventos = radar({
      etapas: [etapa('e1', { prazo: '2026-09-20', situacao: 'CONCLUIDA', concluidaEm: '2026-09-25' })],
    });

    expect(eventos.map((evento) => evento.tipo)).toEqual(['conclusao']);
  });

  it('mostra a conclusão recente com quem concluiu', () => {
    const eventos = radar({
      membros: [membro('m1')],
      etapas: [
        etapa('e1', {
          escopo: 'MEMBRO',
          membroId: 'm1',
          clubeId: null,
          situacao: 'CONCLUIDA',
          concluidaEm: '2026-09-23',
        }),
      ],
      autorDaConclusao: new Map([['e1', 'wm-thamirys']]),
    });

    expect(eventos[0]).toMatchObject({
      tipo: 'conclusao',
      titulo: 'Membro m1',
      link: '/membros/m1',
      autorId: 'wm-thamirys',
      dias: -3,
    });
    expect(faixaDoEvento(eventos[0], 30)).toBe('concluidas');
  });

  it('deixa a conclusão antiga fora das recentes', () => {
    const [evento] = radar({
      etapas: [etapa('e1', { situacao: 'CONCLUIDA', concluidaEm: '2026-07-01' })],
    });

    expect(faixaDoEvento(evento, 30)).toBeNull();
  });

  it('ignora etapa órfã, sem dono', () => {
    expect(
      radar({ etapas: [etapa('e1', { escopo: 'MEMBRO', membroId: null, clubeId: null, prazo: '2026-09-20' })] }),
    ).toEqual([]);
  });

  it('inclui aniversário de sócio e de dependente', () => {
    const eventos = radar({
      membros: [membro('m1')],
      socios: [{ id: 's1', name: 'Sócia', nascimento: '0001-09-28', clubeId: 'c1' }],
      dependentes: [
        { id: 'd1', name: 'Filho', nascimento: '2015-10-01', parentesco: 'Filho', membroId: 'm1' },
      ],
    });

    expect(eventos.map((evento) => [evento.tipo, evento.quando])).toEqual([
      ['aniversarioDeSocio', '2026-09-28'],
      ['aniversarioDeDependente', '2026-10-01'],
    ]);
    expect(eventos[0].detalhe).toContain('nasceu em 28/09');
    expect(eventos[0].detalhe).not.toContain('0001');
    expect(eventos[1].detalhe).toContain('Filho de Membro m1');
  });

  it('mantém o MOU vencido em vencidos até renovar', () => {
    const [mou] = radar({ clubes: [clube('c1', { mouValidade: '2026-01-31' })] });

    expect(mou.tipo).toBe('mou');
    expect(faixaDoEvento(mou, 30)).toBe('vencidos');
  });

  it('mostra o marco que acabou de passar, mas não o antigo', () => {
    const eventos = radar({ clubes: [clube('c1', { inicio: '2026-03-10' })] });
    const seisMeses = eventos.find((evento) => evento.chave === 'marco-c1-6');
    const umAno = eventos.find((evento) => evento.chave === 'marco-c1-12');

    expect(seisMeses?.quando).toBe('2026-09-10');
    expect(faixaDoEvento(seisMeses!, 30)).toBe('vencidos');
    expect(faixaDoEvento(umAno!, 30)).toBeNull();
    expect(faixaDoEvento(umAno!, 366)).toBe('proximos');
  });

  it('não cobra prazo nem MOU de clube perdido ou inativo', () => {
    expect(
      radar({
        clubes: [clube('c1', { situacao: 'PERDIDO', mouValidade: '2026-01-31', inicio: '2026-03-10' })],
        etapas: [etapa('e1', { prazo: '2026-09-20' })],
      }),
    ).toEqual([]);
  });
});

describe('quem concluiu a etapa', () => {
  it('fica com o último evento que levou a etapa para concluída', () => {
    const autores = autoresDasConclusoes([
      { targetEtapaJornadaId: 'e1', happensAt: '2026-09-20T10:00:00Z', workspaceMemberId: 'ana', properties: { diff: { situacao: { after: 'CONCLUIDA' } } } },
      { targetEtapaJornadaId: 'e1', happensAt: '2026-09-21T10:00:00Z', workspaceMemberId: 'ana', properties: { diff: { situacao: { after: 'PENDENTE' } } } },
      { targetEtapaJornadaId: 'e1', happensAt: '2026-09-22T10:00:00Z', workspaceMemberId: 'carol', properties: { diff: { situacao: { after: 'CONCLUIDA' } } } },
      { targetEtapaJornadaId: 'e2', happensAt: '2026-09-22T10:00:00Z', workspaceMemberId: 'bia', properties: { diff: { prazo: { after: '2026-10-01' } } } },
    ]);

    expect([...autores]).toEqual([['e1', 'carol']]);
  });
});
