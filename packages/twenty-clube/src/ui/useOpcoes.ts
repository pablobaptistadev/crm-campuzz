import { useEffect, useState } from 'react';

import { carregarMetadata } from 'src/api/metadata';

export type Opcao = { value: string; label: string; color?: string };

// As opções de um SELECT moram no metadata; uma lista escrita à mão na tela
// deixa de fora a opção criada depois (foi assim que o Rateio não apareceria no
// assistente). A lista conhecida só segura a tela enquanto o metadata chega.
export const useOpcoes = (
  objeto: string,
  campo: string,
  reserva: readonly Opcao[],
): readonly Opcao[] => {
  const [opcoes, setOpcoes] = useState<readonly Opcao[]>(reserva);

  useEffect(() => {
    let ativo = true;

    carregarMetadata()
      .then((metadata) => {
        const doMetadata = metadata.get(objeto)?.campoPorNome.get(campo)?.options;

        if (ativo && doMetadata !== null && doMetadata !== undefined && doMetadata.length > 0) {
          setOpcoes(doMetadata);
        }
      })
      .catch(() => {
        // Sem metadata, a lista conhecida continua valendo.
      });

    return () => {
      ativo = false;
    };
  }, [objeto, campo]);

  return opcoes;
};
