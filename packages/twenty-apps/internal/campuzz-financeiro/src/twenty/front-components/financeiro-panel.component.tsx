import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  enqueueSnackbar,
  useRecordId,
  useSelectedRecordIds,
} from 'twenty-sdk/front-component';

import { ROUTES } from 'src/twenty/constants/universal-identifiers';
import {
  formatDate,
  formatMoney,
} from 'src/twenty/front-components/adicionar-contrato.formatters';
import {
  COLOR,
  disabledStyle,
  STYLES,
} from 'src/twenty/front-components/adicionar-contrato.styles';
import { callAppRoute } from 'src/twenty/front-components/call-app-route.util';
import { type TargetType } from 'src/twenty/front-components/adicionar-contrato.types';

type SyncResponse =
  | {
      success: true;
      reconciled: number;
      skipped: number;
      contractCount: number;
      openAmount: number;
      paidAmount: number;
      openCount: number;
      paidCount: number;
      nextDueAt: string | null;
      syncedAt: string;
    }
  | { success: false; code: string; error: string };

type Summary = Extract<SyncResponse, { success: true }>;

const PANEL_STYLES = {
  wrapper: {
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    fontSize: '13px',
    color: COLOR.text,
    padding: '12px',
    boxSizing: 'border-box' as const,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    marginBottom: '12px',
  },
  metrics: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '10px',
  },
  metricCard: {
    background: COLOR.card,
    border: `1px solid ${COLOR.border}`,
    borderRadius: '8px',
    padding: '10px 12px',
  },
  metricLabel: {
    fontSize: '11px',
    color: COLOR.textTertiary,
    marginBottom: '4px',
  },
  metricValue: { fontSize: '16px', fontWeight: 600 },
  metricHint: { fontSize: '11px', color: COLOR.textSecondary, marginTop: '2px' },
  syncedAt: { fontSize: '11px', color: COLOR.textTertiary },
} as const;

/**
 * Barra de carregamento sem animacao de terceiros.
 *
 * O iframe do front component nao carrega folha de estilo externa, entao a
 * animacao vai inline via `<style>`. E um `@keyframes` so, que e menos do que
 * puxar uma biblioteca de skeleton para tres retangulos.
 */
const SkeletonBar = ({ width, height }: { width: string; height: string }) => (
  <div
    aria-hidden="true"
    style={{
      width,
      height,
      borderRadius: '4px',
      background: `linear-gradient(90deg, ${COLOR.border} 25%, ${COLOR.surface} 37%, ${COLOR.border} 63%)`,
      backgroundSize: '400% 100%',
      animation: 'campuzz-skeleton 1.4s ease infinite',
    }}
  />
);

const Skeleton = () => (
  <div style={PANEL_STYLES.wrapper} role="status" aria-busy="true">
    <style>
      {'@keyframes campuzz-skeleton { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }'}
    </style>
    <div style={PANEL_STYLES.header}>
      <SkeletonBar width="180px" height="14px" />
      <SkeletonBar width="110px" height="30px" />
    </div>
    <div style={PANEL_STYLES.metrics}>
      {[0, 1, 2, 3].map((index) => (
        <div key={index} style={PANEL_STYLES.metricCard}>
          <SkeletonBar width="70%" height="10px" />
          <div style={{ height: '8px' }} />
          <SkeletonBar width="55%" height="18px" />
        </div>
      ))}
    </div>
    <span
      style={{ ...PANEL_STYLES.syncedAt, display: 'block', marginTop: '10px' }}
    >
      Buscando o financeiro no gateway...
    </span>
  </div>
);

const Metric = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) => (
  <div style={PANEL_STYLES.metricCard}>
    <div style={PANEL_STYLES.metricLabel}>{label}</div>
    <div style={PANEL_STYLES.metricValue}>{value}</div>
    {hint !== undefined && <div style={PANEL_STYLES.metricHint}>{hint}</div>}
  </div>
);

/**
 * O topo da aba Financeiro.
 *
 * Sincroniza ao abrir, sozinho. O motivo: a Routerfy nao assina nem garante a
 * entrega dos webhooks, entao o espelho no banco pode estar velho — e uma tela
 * de financeiro velha nao avisa que esta velha, so mente. Reler no momento em
 * que alguem olha e o que faz o numero valer.
 *
 * O botao existe para o caso em que alguem acabou de mexer no gateway e quer
 * conferir sem sair e voltar da aba.
 */
export const FinanceiroPanel = ({
  targetType,
}: {
  targetType: TargetType;
}) => {
  const recordId = useRecordId();
  const selectedRecordIds = useSelectedRecordIds();

  // Num widget de ficha, o registro aberto chega por `useRecordId`. A selecao e
  // a leitura que o SDK recomenda, mas ela nem sempre esta preenchida dentro de
  // uma aba, entao valem as duas — na ordem em que sao confiaveis aqui.
  const targetId = useMemo(
    () =>
      recordId ?? (selectedRecordIds.length === 1 ? selectedRecordIds[0] : ''),
    [recordId, selectedRecordIds],
  );

  const [summary, setSummary] = useState<Summary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const sincronizar = useCallback(
    async ({ isManual }: { isManual: boolean }) => {
      if (targetId.length === 0) {
        setHasLoadedOnce(true);

        return;
      }

      setIsSyncing(true);
      setErrorMessage(null);

      try {
        const result = await callAppRoute<SyncResponse>(
          ROUTES.syncHolderContracts,
          { targetType, targetId },
        );

        if (!result.success) {
          setErrorMessage(result.error);

          return;
        }

        setSummary(result);

        if (isManual) {
          await enqueueSnackbar({
            message:
              result.contractCount === 0
                ? 'Nao ha contrato vinculado a este registro.'
                : `Financeiro atualizado a partir de ${result.reconciled} contrato(s).`,
            variant: 'success',
          });
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Nao conseguimos atualizar o financeiro agora.',
        );
      } finally {
        setIsSyncing(false);
        setHasLoadedOnce(true);
      }
    },
    [targetType, targetId],
  );

  useEffect(() => {
    void sincronizar({ isManual: false });
  }, [sincronizar]);

  if (!hasLoadedOnce) {
    return <Skeleton />;
  }

  return (
    <div style={PANEL_STYLES.wrapper}>
      <div style={PANEL_STYLES.header}>
        <span style={PANEL_STYLES.syncedAt}>
          {summary === null
            ? 'Ainda nao atualizamos este financeiro.'
            : `Atualizado agora a partir do gateway · ${summary.contractCount} contrato(s)`}
        </span>
        <button
          type="button"
          style={disabledStyle(STYLES.ghostButton, isSyncing)}
          disabled={isSyncing}
          onClick={() => void sincronizar({ isManual: true })}
        >
          {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
        </button>
      </div>

      {errorMessage !== null && (
        <div
          role="status"
          style={{
            ...STYLES.banner,
            background: '#fdeceb',
            color: COLOR.danger,
            marginBottom: '12px',
          }}
        >
          {errorMessage}
          {summary !== null &&
            ' Os valores abaixo sao os da ultima atualizacao que deu certo.'}
        </div>
      )}

      {summary !== null && (
        <div style={PANEL_STYLES.metrics}>
          <Metric
            label="A pagar"
            value={formatMoney(summary.openAmount)}
            hint={`${summary.openCount} fatura(s)`}
          />
          <Metric
            label="Pago"
            value={formatMoney(summary.paidAmount)}
            hint={`${summary.paidCount} fatura(s)`}
          />
          <Metric
            label="Proximo vencimento"
            value={formatDate(summary.nextDueAt)}
          />
          <Metric
            label="Contratos"
            value={String(summary.contractCount)}
            hint={
              summary.skipped > 0
                ? `${summary.skipped} nao respondeu(ram)`
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
};
