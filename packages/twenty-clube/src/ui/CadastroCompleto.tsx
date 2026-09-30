import { camposDoCadastro } from 'src/api/selecao';
import { type ObjetoMeta } from 'src/api/metadata';
import { CardEditavel } from './CardEditavel';

export type CampoDoGrupo = string | { nome: string; rotulo: string };

export type GrupoDeCampos = { titulo: string; campos: CampoDoGrupo[] };

const nomeDe = (campo: CampoDoGrupo) => (typeof campo === 'string' ? campo : campo.nome);

// Os grupos dão ordem ao que já conhecemos; o resto cai em "Outros campos".
// Sem esse resto, "tudo editável" dependeria de alguém lembrar de acrescentar
// cada campo novo em algum grupo — e foi assim que metade do cadastro do clube
// ficou fora da tela.
export const CadastroCompleto = ({
  objeto,
  registroId,
  registro,
  grupos,
  excluir = [],
  onSalvo,
}: {
  objeto: ObjetoMeta;
  registroId: string;
  registro: Record<string, unknown>;
  grupos: GrupoDeCampos[];
  // Campos que outra parte da tela já edita com regra própria. Sem isso eles
  // reapareceriam no card genérico, onde a regra não vale — dava para apagar
  // o e-mail obrigatório por fora da validação do perfil.
  excluir?: string[];
  onSalvo: (mudancas: Record<string, unknown>) => void;
}) => {
  const foraDaqui = new Set(excluir);
  const todos = camposDoCadastro(objeto).filter((campo) => !foraDaqui.has(campo.name));
  const agrupados = new Set(grupos.flatMap((grupo) => grupo.campos.map(nomeDe)));
  const sobraram = todos.filter((campo) => !agrupados.has(campo.name));

  const comConteudo = grupos
    .map((grupo) => ({
      ...grupo,
      campos: grupo.campos.filter(
        (campo) => objeto.campoPorNome.has(nomeDe(campo)) && !foraDaqui.has(nomeDe(campo)),
      ),
    }))
    .filter((grupo) => grupo.campos.length > 0);

  return (
    <>
      {comConteudo.map((grupo) => (
        <CardEditavel
          key={grupo.titulo}
          titulo={grupo.titulo}
          objeto={objeto}
          registroId={registroId}
          registro={registro}
          onSalvo={onSalvo}
          campos={grupo.campos.map((campo) =>
            typeof campo === 'string' ? { nome: campo } : campo,
          )}
        />
      ))}

      {sobraram.length > 0 && (
        <CardEditavel
          titulo="Outros campos"
          objeto={objeto}
          registroId={registroId}
          registro={registro}
          onSalvo={onSalvo}
          campos={sobraram.map((campo) => ({ nome: campo.name }))}
        />
      )}
    </>
  );
};
