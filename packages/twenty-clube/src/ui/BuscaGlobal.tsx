import { useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AvatarDoMembro } from 'src/modules/perfil/ui/AvatarDoMembro';
import { type AlunoBuscavel, type ClubeBuscavel } from 'src/ui/busca';
import { TRACO } from 'src/ui/format';

export type AlunoDoPainel = AlunoBuscavel & { fotoUrl?: string | null };
export type ClubeDoPainel = ClubeBuscavel & { fotoUrl?: string | null };

// O painel é um atalho, não a lista inteira: a grade da página já mostra tudo.
// Mais que isto vira rolagem dentro de um menu, que ninguém termina de ler.
const MAXIMO_POR_GRUPO = 6;

type Opcao =
  | { tipo: 'aluno'; item: AlunoDoPainel }
  | { tipo: 'clube'; item: ClubeDoPainel };

const destinoDe = (opcao: Opcao): string =>
  opcao.tipo === 'aluno' ? `/membros/${opcao.item.id}` : `/clubes/${opcao.item.id}`;

export const BuscaGlobal = ({
  valor,
  onMudou,
  alunos,
  clubes,
}: {
  valor: string;
  onMudou: (valor: string) => void;
  alunos: readonly AlunoDoPainel[];
  clubes: readonly ClubeDoPainel[];
}) => {
  const [aberta, setAberta] = useState(false);
  const [ativa, setAtiva] = useState(-1);
  const navegar = useNavigate();
  const idDoPainel = useId();
  const campo = useRef<HTMLInputElement>(null);

  const alunosNoPainel = alunos.slice(0, MAXIMO_POR_GRUPO);
  const clubesNoPainel = clubes.slice(0, MAXIMO_POR_GRUPO);
  const opcoes: Opcao[] = [
    ...alunosNoPainel.map((item) => ({ tipo: 'aluno' as const, item })),
    ...clubesNoPainel.map((item) => ({ tipo: 'clube' as const, item })),
  ];
  const sobrando =
    alunos.length - alunosNoPainel.length + (clubes.length - clubesNoPainel.length);

  const temTermo = valor.trim() !== '';
  const mostrarPainel = aberta && temTermo;
  const idDaOpcao = (indice: number) => `${idDoPainel}-opcao-${indice}`;

  const ir = (opcao: Opcao) => {
    setAberta(false);
    campo.current?.blur();
    navegar(destinoDe(opcao));
  };

  // Função que devolve JSX, não componente: um componente declarado aqui dentro
  // seria um tipo novo a cada render, e o React remontaria todas as opções a
  // cada tecla e a cada hover.
  const linha = (opcao: Opcao, indice: number) => (
    <li
      key={opcao.item.id}
      id={idDaOpcao(indice)}
      role="option"
      aria-selected={indice === ativa}
      className={indice === ativa ? 'adm-busca__opcao adm-busca__opcao--ativa' : 'adm-busca__opcao'}
      // mousedown, não click: o click só chega depois do blur, e o blur já
      // teria fechado o painel — o clique cairia no vazio.
      onMouseDown={(evento) => {
        evento.preventDefault();
        ir(opcao);
      }}
      onMouseEnter={() => setAtiva(indice)}
    >
      <AvatarDoMembro
        nome={opcao.item.name ?? ''}
        fotoUrl={opcao.item.fotoUrl ?? null}
        tamanho="card"
        vazio={opcao.tipo === 'aluno' ? 'silhueta' : 'iniciais'}
      />
      <span className="adm-busca__texto">
        <span className="adm-busca__nome">{opcao.item.name ?? TRACO}</span>
        <span className="adm-busca__sub">
          {opcao.tipo === 'aluno'
            ? (opcao.item.emails?.primaryEmail ?? opcao.item.emailFinanceiro ?? TRACO)
            : (opcao.item.mentor ?? TRACO)}
        </span>
      </span>
      <span className="adm-busca__tipo">{opcao.tipo === 'aluno' ? 'Aluno' : 'Clube'}</span>
    </li>
  );

  return (
    <div className={aberta ? 'adm-busca adm-busca--aberta' : 'adm-busca'}>
      <input
        ref={campo}
        className="adm-input adm-busca__campo"
        type="search"
        role="combobox"
        aria-expanded={mostrarPainel}
        aria-controls={idDoPainel}
        aria-autocomplete="list"
        aria-activedescendant={mostrarPainel && ativa >= 0 ? idDaOpcao(ativa) : undefined}
        aria-label="Buscar aluno ou clube"
        placeholder="Buscar aluno, e-mail, clube ou mentor…"
        value={valor}
        onFocus={() => setAberta(true)}
        onBlur={() => setAberta(false)}
        onChange={(evento) => {
          onMudou(evento.target.value);
          setAtiva(-1);
          setAberta(true);
        }}
        onKeyDown={(evento) => {
          // Num type="search" o Esc limpa o texto por padrão. Com o painel
          // aberto, o primeiro Esc só o fecha — senão a pessoa perde a busca e
          // a grade de resultados junto. Com ele já fechado, o segundo Esc
          // limpa, como o navegador faria.
          if (evento.key === 'Escape') {
            if (mostrarPainel) {
              evento.preventDefault();
              setAberta(false);
            }

            return;
          }

          if (opcoes.length === 0) {
            return;
          }

          if (evento.key === 'ArrowDown') {
            evento.preventDefault();
            setAberta(true);
            setAtiva((atual) => (atual + 1) % opcoes.length);
          }

          if (evento.key === 'ArrowUp') {
            evento.preventDefault();
            setAtiva((atual) => (atual <= 0 ? opcoes.length - 1 : atual - 1));
          }

          // Enter sem nada destacado vai no primeiro: quem digitou o nome
          // inteiro e apertou Enter quer abrir a ficha, não navegar de seta.
          if (evento.key === 'Enter' && mostrarPainel) {
            evento.preventDefault();
            ir(opcoes[ativa >= 0 ? ativa : 0] as Opcao);
          }
        }}
      />

      {mostrarPainel && (
        <div className="adm-busca__painel" id={idDoPainel} role="listbox" aria-label="Resultados da busca">
          {opcoes.length === 0 ? (
            <div className="adm-busca__vazio">
              Não encontramos aluno nem clube com “{valor.trim()}”.
            </div>
          ) : (
            <>
              {alunosNoPainel.length > 0 && (
                <>
                  <div className="adm-busca__grupo">
                    Alunos <span>{alunos.length}</span>
                  </div>
                  <ul className="adm-busca__lista">
                    {alunosNoPainel.map((item, indice) => linha({ tipo: 'aluno', item }, indice))}
                  </ul>
                </>
              )}

              {clubesNoPainel.length > 0 && (
                <>
                  <div className="adm-busca__grupo">
                    Clubes <span>{clubes.length}</span>
                  </div>
                  <ul className="adm-busca__lista">
                    {clubesNoPainel.map((item, indice) =>
                      linha({ tipo: 'clube', item }, alunosNoPainel.length + indice),
                    )}
                  </ul>
                </>
              )}

              {sobrando > 0 && (
                <div className="adm-busca__rodape">
                  Mais {sobrando} {sobrando === 1 ? 'resultado' : 'resultados'} na página, abaixo.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
