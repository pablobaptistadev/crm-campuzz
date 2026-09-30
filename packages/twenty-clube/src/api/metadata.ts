import { meta } from './client';

export type TipoCampo =
  | 'TEXT'
  | 'DATE'
  | 'DATE_TIME'
  | 'SELECT'
  | 'BOOLEAN'
  | 'NUMBER'
  | 'NUMERIC'
  | 'CURRENCY'
  | 'EMAILS'
  | 'PHONES'
  | 'LINKS'
  | 'ADDRESS'
  | 'RELATION'
  | 'POSITION'
  | 'ACTOR'
  | 'UUID';

export type CampoMeta = {
  name: string;
  label: string;
  type: TipoCampo;
  isSystem: boolean;
  isNullable: boolean;
  options: { value: string; label: string; color?: string }[] | null;
};

export type ObjetoMeta = {
  nameSingular: string;
  namePlural: string;
  labelSingular: string;
  campoPorNome: Map<string, CampoMeta>;
};

const OBJETOS_COM_CAMPOS = `
  query ObjetosComCampos {
    objects(paging: { first: 200 }) {
      edges {
        node {
          nameSingular
          namePlural
          labelSingular
          fields(paging: { first: 200 }) {
            edges { node { name label type isSystem isNullable options } }
          }
        }
      }
    }
  }
`;

type Resposta = {
  objects: {
    edges: {
      node: {
        nameSingular: string;
        namePlural: string;
        labelSingular: string;
        fields: { edges: { node: CampoMeta }[] };
      };
    }[];
  };
};

let emCache: Promise<Map<string, ObjetoMeta>> | null = null;

// Todo campo destas telas é customizado, criado por createOneField. Em vez de
// escrever um input por campo, o editor lê o tipo e as opções daqui — um campo
// novo criado depois já nasce editável.
export const carregarMetadata = (): Promise<Map<string, ObjetoMeta>> => {
  emCache ??= meta<Resposta>(OBJETOS_COM_CAMPOS).then((dados) => {
    const porObjeto = new Map<string, ObjetoMeta>();

    for (const aresta of dados.objects.edges) {
      const objeto = aresta.node;

      porObjeto.set(objeto.nameSingular, {
        nameSingular: objeto.nameSingular,
        namePlural: objeto.namePlural,
        labelSingular: objeto.labelSingular,
        campoPorNome: new Map(
          objeto.fields.edges.map((campo) => [campo.node.name, campo.node]),
        ),
      });
    }

    return porObjeto;
  });

  return emCache;
};

export const esquecerMetadata = () => {
  emCache = null;
};
