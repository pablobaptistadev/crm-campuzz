import { createContext, useContext } from 'react';

// Quem só visualiza vê as mesmas telas, sem nada que grave. O servidor recusa a
// escrita de qualquer jeito; esconder aqui é para ninguém clicar num botão que
// só responde com erro. Fora do provider vale editar: é o que as telas sempre
// fizeram, e os testes montam componente sem o App em volta.
const PodeEditarContext = createContext(true);

export const PodeEditarProvider = PodeEditarContext.Provider;

export const usePodeEditar = () => useContext(PodeEditarContext);

type ObjetoComPermissao = { canUpdateObjectRecords: boolean | null };

// Pelo que o papel permite nos objetos, e não pelo nome dele: qualquer papel
// que não edita registro nenhum cai aqui, o View e o que vier depois.
export const podeEditarAlgum = (
  objetos: readonly ObjetoComPermissao[] | null | undefined,
): boolean =>
  objetos === null || objetos === undefined || objetos.some((objeto) => objeto.canUpdateObjectRecords === true);

export const MENSAGEM_SO_VISUALIZACAO = 'Seu acesso é só de visualização.';
