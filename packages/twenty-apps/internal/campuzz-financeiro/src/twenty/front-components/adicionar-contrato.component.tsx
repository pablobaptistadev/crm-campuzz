import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  enqueueSnackbar,
  unmountFrontComponent,
  useSelectedRecordIds,
} from 'twenty-sdk/front-component';

import { ROUTES } from 'src/twenty/constants/universal-identifiers';
import {
  callAppRoute,
  onValueChange,
} from 'src/twenty/front-components/call-app-route.util';
import {
  formatDate,
  formatMoney,
  formatRecurrence,
} from 'src/twenty/front-components/adicionar-contrato.formatters';
import {
  COLOR,
  disabledStyle,
  STYLES,
} from 'src/twenty/front-components/adicionar-contrato.styles';
import {
  type AttachResponse,
  type BusinessUnitOption,
  type ListBusinessUnitsResponse,
  type PreviewResponse,
  type SaveBusinessUnitResponse,
  type TargetType,
} from 'src/twenty/front-components/adicionar-contrato.types';

const NOVA_BU = '__nova__';

type Step = 'form' | 'preview';

type PreviewData = Extract<PreviewResponse, { success: true }>;

const Banner = ({ tone, children }: { tone: 'error' | 'warning' | 'info'; children: React.ReactNode }) => {
  const palette = {
    error: { background: '#fdeceb', color: COLOR.danger },
    warning: { background: '#fdf6e3', color: COLOR.warning },
    info: { background: '#eef3fd', color: COLOR.accent },
  }[tone];

  return (
    <div role="status" style={{ ...STYLES.banner, ...palette }}>
      {children}
    </div>
  );
};

const Summary = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div style={STYLES.summaryLabel}>{label}</div>
    <div style={STYLES.summaryValue}>{value}</div>
  </div>
);

/**
 * O popup "Adicionar contrato".
 *
 * Dois passos, como no Campuzz: o passo 1 pergunta a BU e o numero do contrato;
 * o passo 2 mostra quem e o cliente e quanto e, e so entao grava.
 *
 * O e-mail nao aparece como campo, e isso e proposital. Ele vem do registro que
 * abriu a janela, e o servidor confere esse e-mail contra o cliente do contrato
 * no gateway. Digitar de novo aqui so abriria espaco para erro de digitacao — e
 * o erro seria caro, porque um e-mail diferente vincula o contrato de OUTRA
 * pessoa em vez de acusar o engano.
 */
const useTarget = (targetType: TargetType) => {
  const selectedRecordIds = useSelectedRecordIds();

  return useMemo(
    () => ({
      targetType,
      // Um contrato pertence a um registro so. Com selecao multipla nao ha o que
      // escolher, entao nao escolhemos: o servidor recusa o id vazio.
      targetId: selectedRecordIds.length === 1 ? selectedRecordIds[0] : '',
    }),
    [targetType, selectedRecordIds],
  );
};

export const AdicionarContratoForm = ({ targetType }: { targetType: TargetType }) => {
  const target = useTarget(targetType);

  const [step, setStep] = useState<Step>('form');
  const [businessUnits, setBusinessUnits] = useState<BusinessUnitOption[]>([]);
  const [selectedBusinessUnitId, setSelectedBusinessUnitId] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isLoadingUnits, setIsLoadingUnits] = useState(true);

  const [isEditingKeys, setIsEditingKeys] = useState(false);
  const [businessUnitName, setBusinessUnitName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');

  const isCreatingBusinessUnit = selectedBusinessUnitId === NOVA_BU;
  const selectedBusinessUnit = businessUnits.find(
    (unit) => unit.id === selectedBusinessUnitId,
  );

  const loadBusinessUnits = useCallback(async () => {
    setIsLoadingUnits(true);

    try {
      const result = await callAppRoute<ListBusinessUnitsResponse>(
        ROUTES.listBusinessUnits,
        target,
      );

      if (!result.success) {
        setErrorMessage(result.error);

        return;
      }

      setBusinessUnits(result.businessUnits);
      // Sem nenhuma BU cadastrada, o popup ja abre no formulario de cadastro em
      // vez de mostrar um seletor vazio que nao leva a lugar nenhum.
      setSelectedBusinessUnitId(
        result.resolvedBusinessUnitId ??
          (result.businessUnits.length === 0 ? NOVA_BU : ''),
      );
      setIsEditingKeys(result.businessUnits.length === 0);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Nao conseguimos carregar as BUs.',
      );
    } finally {
      setIsLoadingUnits(false);
    }
  }, [target]);

  useEffect(() => {
    void loadBusinessUnits();
  }, [loadBusinessUnits]);

  const salvarBusinessUnit = async () => {
    setErrorMessage(null);
    setIsBusy(true);

    try {
      const result = await callAppRoute<SaveBusinessUnitResponse>(
        ROUTES.saveBusinessUnit,
        {
          businessUnitId: isCreatingBusinessUnit
            ? undefined
            : selectedBusinessUnitId,
          name: isCreatingBusinessUnit
            ? businessUnitName
            : (selectedBusinessUnit?.name ?? businessUnitName),
          apiKey,
          secretKey,
          isDefault: businessUnits.length === 0,
          workspaceId: process.env.TWENTY_WORKSPACE_ID ?? '',
        },
      );

      if (!result.success) {
        setErrorMessage(result.error);

        return;
      }

      await enqueueSnackbar({
        message: 'Chaves salvas. Validamos elas no gateway.',
        variant: 'success',
      });

      setApiKey('');
      setSecretKey('');
      setBusinessUnitName('');
      setIsEditingKeys(false);
      await loadBusinessUnits();
      setSelectedBusinessUnitId(result.businessUnit.id);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Nao conseguimos salvar as chaves.',
      );
    } finally {
      setIsBusy(false);
    }
  };

  const validarContrato = async () => {
    setErrorMessage(null);
    setIsBusy(true);

    try {
      const result = await callAppRoute<PreviewResponse>(
        ROUTES.previewContract,
        { ...target, businessUnitId: selectedBusinessUnitId, identifier },
      );

      if (!result.success) {
        setErrorMessage(result.error);

        return;
      }

      setPreview(result);
      setStep('preview');
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Nao conseguimos validar o contrato.',
      );
    } finally {
      setIsBusy(false);
    }
  };

  const vincularContrato = async () => {
    setErrorMessage(null);
    setIsBusy(true);

    try {
      const result = await callAppRoute<AttachResponse>(ROUTES.attachContract, {
        ...target,
        businessUnitId: selectedBusinessUnitId,
        identifier,
      });

      if (!result.success) {
        setErrorMessage(result.error);

        return;
      }

      await enqueueSnackbar({
        message: `Contrato vinculado. Trouxemos ${result.invoiceCount} fatura(s).`,
        variant: 'success',
      });

      await unmountFrontComponent();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Nao conseguimos vincular o contrato.',
      );
    } finally {
      setIsBusy(false);
    }
  };

  const podeValidar =
    identifier.trim().length >= 3 &&
    selectedBusinessUnitId.length > 0 &&
    !isCreatingBusinessUnit &&
    !isBusy;

  const podeSalvarChaves =
    apiKey.trim().length > 0 &&
    secretKey.trim().length > 0 &&
    (!isCreatingBusinessUnit || businessUnitName.trim().length > 0) &&
    !isBusy;

  return (
    <div style={STYLES.outer}>
      <div style={STYLES.card}>
        <div style={STYLES.header}>
          <h1 style={STYLES.title}>Adicionar contrato</h1>
          <p style={STYLES.subtitle}>
            Vinculamos um contrato que ja existe no gateway a este registro.
            Eventos futuros do mesmo contrato atualizam o financeiro sozinhos.
          </p>
        </div>

        <div style={STYLES.body}>
          {errorMessage !== null && <Banner tone="error">{errorMessage}</Banner>}

          {step === 'form' && (
            <>
              <div style={STYLES.field}>
                <label style={STYLES.label}>BU</label>
                <select
                  style={STYLES.select}
                  value={selectedBusinessUnitId}
                  disabled={isLoadingUnits}
                  onChange={onValueChange(setSelectedBusinessUnitId)}
                >
                  <option value="">
                    {isLoadingUnits ? 'Carregando...' : 'Escolha a BU'}
                  </option>
                  {businessUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                      {unit.isDefault ? ' (padrao)' : ''}
                      {unit.connectionStatus === 'INVALID'
                        ? ' — chaves invalidas'
                        : ''}
                    </option>
                  ))}
                  <option value={NOVA_BU}>+ Cadastrar nova BU</option>
                </select>
                <span style={STYLES.hint}>
                  Cada BU e um par de chaves e um canal de eventos proprio.
                  Deixamos escolhida a que vale para este registro, mas voce pode
                  trocar.
                </span>
              </div>

              {selectedBusinessUnit !== undefined && !isEditingKeys && (
                <div style={STYLES.field}>
                  <span style={STYLES.hint}>
                    Chave em uso: {selectedBusinessUnit.apiKeyPreview}
                  </span>
                  <button
                    type="button"
                    style={STYLES.inlineButton}
                    onClick={() => setIsEditingKeys(true)}
                  >
                    Editar chaves desta BU
                  </button>
                </div>
              )}

              {(isEditingKeys || isCreatingBusinessUnit) && (
                <>
                  <hr style={STYLES.divider} />
                  {isCreatingBusinessUnit && (
                    <div style={STYLES.field}>
                      <label style={STYLES.label}>Nome da BU</label>
                      <input
                        style={STYLES.input}
                        value={businessUnitName}
                        placeholder="Ex.: Clube Alpha"
                        onChange={onValueChange(setBusinessUnitName)}
                      />
                    </div>
                  )}
                  <div style={STYLES.field}>
                    <label style={STYLES.label}>API key</label>
                    <input
                      style={STYLES.input}
                      value={apiKey}
                      onChange={onValueChange(setApiKey)}
                    />
                  </div>
                  <div style={STYLES.field}>
                    <label style={STYLES.label}>Secret key</label>
                    <input
                      style={STYLES.input}
                      type="password"
                      value={secretKey}
                      onChange={onValueChange(setSecretKey)}
                    />
                    <span style={STYLES.hint}>
                      Validamos as chaves no gateway antes de guardar. Elas ficam
                      fora do registro — na tela so aparece o inicio da api key.
                    </span>
                  </div>
                  <div>
                    <button
                      type="button"
                      style={disabledStyle(
                        STYLES.primaryButton,
                        !podeSalvarChaves,
                      )}
                      disabled={!podeSalvarChaves}
                      onClick={() => void salvarBusinessUnit()}
                    >
                      {isBusy ? 'Salvando...' : 'Salvar chaves'}
                    </button>
                  </div>
                  <hr style={STYLES.divider} />
                </>
              )}

              <div style={STYLES.field}>
                <label style={STYLES.label}>
                  Contrato ou transacao (numero do painel)
                </label>
                <input
                  style={STYLES.input}
                  value={identifier}
                  placeholder="Ex.: 2026051000000100"
                  onChange={onValueChange(setIdentifier)}
                />
                <span style={STYLES.hint}>
                  Aceita o numero do painel ou o id interno. Serve para
                  recorrencia e para venda a vista.
                </span>
              </div>
            </>
          )}

          {step === 'preview' && preview !== null && (
            <>
              {preview.alreadyLinkedContractId !== null && (
                <Banner tone="warning">
                  Este contrato ja esta vinculado a outro registro. Abra o
                  contrato existente em vez de criar um segundo.
                </Banner>
              )}

              <div style={STYLES.field}>
                <label style={STYLES.label}>Cliente no gateway</label>
                <div style={STYLES.summaryValue}>
                  {preview.customer.name ?? '—'}
                </div>
                <span style={STYLES.hint}>
                  {preview.customer.email ?? '—'}
                  {preview.customer.document !== null
                    ? ` · ${preview.customer.document}`
                    : ''}
                </span>
              </div>

              <hr style={STYLES.divider} />

              <div style={STYLES.summaryGrid}>
                <Summary
                  label="Tipo"
                  value={
                    preview.contract.kind === 'SUBSCRIPTION'
                      ? 'Recorrencia'
                      : 'A vista'
                  }
                />
                <Summary label="Situacao" value={preview.contract.status} />
                <Summary
                  label="Valor da parcela"
                  value={formatMoney(preview.contract.amount)}
                />
                <Summary
                  label="Valor total"
                  value={formatMoney(preview.contract.totalValue)}
                />
                <Summary
                  label="Periodicidade"
                  value={formatRecurrence(
                    preview.contract.frequency,
                    preview.contract.frequencyInterval,
                  )}
                />
                <Summary
                  label="Forma de pagamento"
                  value={preview.contract.paymentMethod ?? '—'}
                />
                <Summary
                  label="Inicio"
                  value={formatDate(preview.contract.startsAt)}
                />
                <Summary
                  label="Proxima cobranca"
                  value={formatDate(preview.contract.nextChargeAt)}
                />
                <Summary
                  label="Faturas"
                  value={`${preview.contract.paidInvoiceCount} paga(s) de ${preview.contract.invoiceCount}`}
                />
                <Summary label="BU" value={preview.businessUnitName} />
              </div>
            </>
          )}
        </div>

        <div style={STYLES.footer}>
          {step === 'preview' && (
            <button
              type="button"
              style={STYLES.ghostButton}
              onClick={() => {
                setStep('form');
                setErrorMessage(null);
              }}
            >
              Voltar
            </button>
          )}

          {step === 'form' ? (
            <button
              type="button"
              style={disabledStyle(STYLES.primaryButton, !podeValidar)}
              disabled={!podeValidar}
              onClick={() => void validarContrato()}
            >
              {isBusy ? 'Validando...' : 'Validar contrato'}
            </button>
          ) : (
            <button
              type="button"
              style={disabledStyle(
                STYLES.primaryButton,
                isBusy || preview?.alreadyLinkedContractId !== null,
              )}
              disabled={isBusy || preview?.alreadyLinkedContractId !== null}
              onClick={() => void vincularContrato()}
            >
              {isBusy ? 'Vinculando...' : 'Vincular contrato'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

