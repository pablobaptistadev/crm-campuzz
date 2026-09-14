import { gql, meta } from 'src/api/client';

export type Anexo = {
  id: string;
  name: string;
  fullPath: string | null;
  type: string | null;
};

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

const TIPO_POR_EXTENSAO: Record<string, string> = {
  pdf: 'TextDocument',
  doc: 'TextDocument',
  docx: 'TextDocument',
  txt: 'TextDocument',
  csv: 'Spreadsheet',
  xls: 'Spreadsheet',
  xlsx: 'Spreadsheet',
  png: 'Image',
  jpg: 'Image',
  jpeg: 'Image',
  gif: 'Image',
  webp: 'Image',
};

// O caminho inteiro do anexo: reservar o arquivo, subir os bytes direto para o
// R2 e só então prender o registro ao alvo. Parar no meio deixa um arquivo sem
// dono, que é invisível mas ocupa espaço.
export const subirAnexo = async ({
  arquivo,
  campoAlvo,
  alvoId,
}: {
  arquivo: File;
  campoAlvo: string;
  alvoId: string;
}): Promise<Anexo> => {
  const criado = await meta<{
    createFileUpload: { fileId: string; uploadUrl: string; contentType: string };
  }>(CRIAR_UPLOAD, {
    filename: arquivo.name,
    size: arquivo.size,
    fileFolder: 'FilesField',
  });

  const envio = await fetch(criado.createFileUpload.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': criado.createFileUpload.contentType },
    body: arquivo,
    credentials: 'omit',
  });

  if (!envio.ok) {
    throw new Error(`Não conseguimos subir o arquivo (${envio.status}).`);
  }

  const concluido = await meta<{ completeFileUpload: { id: string; url: string } }>(
    CONCLUIR_UPLOAD,
    { fileId: criado.createFileUpload.fileId },
  );

  const extensao = arquivo.name.split('.').pop()?.toLowerCase() ?? '';

  const anexo = await gql<{ createAttachment: Anexo }>(CRIAR_ANEXO, {
    data: {
      name: arquivo.name,
      type: TIPO_POR_EXTENSAO[extensao] ?? 'Other',
      fullPath: concluido.completeFileUpload.url,
      file: [{ fileId: concluido.completeFileUpload.id, label: arquivo.name }],
      position: 'last',
      [campoAlvo]: alvoId,
    },
  });

  return anexo.createAttachment;
};
