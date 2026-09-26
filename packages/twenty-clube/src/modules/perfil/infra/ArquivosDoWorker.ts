import { gql, meta } from 'src/api/client';

import {
  type ArmazenamentoDeArquivo,
  type RegistroDeAnexo,
} from '../aplicacao/portas';

const CRIAR_UPLOAD = `
  mutation CriarUpload($filename: String!, $size: Float!, $fileFolder: FileFolder!) {
    createFileUpload(filename: $filename, size: $size, fileFolder: $fileFolder) {
      fileId
      uploadUrl
      contentType
    }
  }
`;

const CONCLUIR_UPLOAD = `
  mutation ConcluirUpload($fileId: String!) {
    completeFileUpload(fileId: $fileId) { id url }
  }
`;

const CRIAR_ANEXO = `
  mutation CriarAnexo($data: AttachmentCreateInput!) {
    createAttachment(data: $data) { id name fullPath type }
  }
`;

const TIPO_DE_ANEXO: Record<string, string> = {
  pdf: 'TextDocument',
  doc: 'TextDocument',
  docx: 'TextDocument',
  txt: 'TextDocument',
  md: 'TextDocument',
  csv: 'Spreadsheet',
  xls: 'Spreadsheet',
  xlsx: 'Spreadsheet',
  png: 'Image',
  jpg: 'Image',
  jpeg: 'Image',
  gif: 'Image',
  webp: 'Image',
  svg: 'Image',
};

export const criarArmazenamentoDoWorker = (): ArmazenamentoDeArquivo => ({
  async guardar(arquivo) {
    const criado = await meta<{
      createFileUpload: { fileId: string; uploadUrl: string; contentType: string };
    }>(CRIAR_UPLOAD, {
      filename: arquivo.name,
      size: arquivo.size,
      fileFolder: 'FilesField',
    });

    // O PUT vai para o nosso próprio Worker, que confere a origem antes de
    // gravar no R2 — por isso vai com credenciais, e não como requisição
    // anônima para um bucket.
    const envio = await fetch(criado.createFileUpload.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': criado.createFileUpload.contentType },
      body: arquivo,
      credentials: 'include',
    });

    if (!envio.ok) {
      throw new Error(`Não conseguimos subir o arquivo (${envio.status}).`);
    }

    const concluido = await meta<{ completeFileUpload: { id: string; url: string } }>(
      CONCLUIR_UPLOAD,
      { fileId: criado.createFileUpload.fileId },
    );

    return { fileId: concluido.completeFileUpload.id, url: concluido.completeFileUpload.url };
  },
});

export const criarRegistroDeAnexo = (): RegistroDeAnexo => ({
  async registrar({ arquivo, guardado, campoAlvo, alvoId }) {
    const extensao = arquivo.name.split('.').pop()?.toLowerCase() ?? '';

    const resposta = await gql<{
      createAttachment: { id: string; name: string; fullPath: string | null; type: string | null };
    }>(CRIAR_ANEXO, {
      data: {
        name: arquivo.name,
        type: TIPO_DE_ANEXO[extensao] ?? 'Other',
        fullPath: guardado.url,
        file: [{ fileId: guardado.fileId, label: arquivo.name }],
        position: 'last',
        [campoAlvo]: alvoId,
      },
    });

    return resposta.createAttachment;
  },
});
