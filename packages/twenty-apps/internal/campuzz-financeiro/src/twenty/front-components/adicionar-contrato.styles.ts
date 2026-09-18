/**
 * Estilos do popup.
 *
 * Front components rodam num iframe isolado: nao alcancam o Linaria nem os
 * componentes do twenty-front, entao estilo aqui e inline mesmo. Os valores
 * seguem a paleta que os apps publicos usam, para o popup nao destoar do resto
 * do CRM.
 */
export const COLOR = {
  bg: '#f1f1f1',
  card: '#ffffff',
  surface: '#fcfcfc',
  border: '#ebebeb',
  borderStrong: '#d6d6d6',
  text: '#333333',
  textSecondary: '#666666',
  textTertiary: '#999999',
  accent: '#1961ed',
  danger: '#e05252',
  success: '#0b8a5c',
  warning: '#b7791f',
} as const;

export const STYLES = {
  outer: {
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    fontSize: '13px',
    backgroundColor: COLOR.bg,
    padding: '12px',
    height: '100%',
    boxSizing: 'border-box' as const,
    color: COLOR.text,
  },
  card: {
    backgroundColor: COLOR.card,
    borderRadius: '8px',
    border: `1px solid ${COLOR.border}`,
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    boxSizing: 'border-box' as const,
    overflow: 'hidden' as const,
  },
  header: {
    padding: '12px 14px',
    borderBottom: `1px solid ${COLOR.border}`,
    flexShrink: 0,
  },
  title: { fontWeight: 600, fontSize: '14px', margin: 0 },
  subtitle: {
    margin: '4px 0 0',
    color: COLOR.textSecondary,
    fontSize: '12px',
    lineHeight: 1.45,
  },
  body: {
    padding: '14px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '14px',
    overflowY: 'auto' as const,
    flex: 1,
  },
  field: { display: 'flex', flexDirection: 'column' as const, gap: '5px' },
  label: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.03em',
    textTransform: 'uppercase' as const,
    color: COLOR.textSecondary,
  },
  hint: { fontSize: '11px', color: COLOR.textTertiary, lineHeight: 1.45 },
  input: {
    border: `1px solid ${COLOR.borderStrong}`,
    borderRadius: '6px',
    padding: '7px 9px',
    fontSize: '13px',
    fontFamily: 'inherit',
    color: COLOR.text,
    background: COLOR.surface,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  select: {
    border: `1px solid ${COLOR.borderStrong}`,
    borderRadius: '6px',
    padding: '7px 9px',
    fontSize: '13px',
    fontFamily: 'inherit',
    color: COLOR.text,
    background: COLOR.surface,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
    cursor: 'pointer',
  },
  inlineButton: {
    background: 'transparent',
    border: 'none',
    color: COLOR.accent,
    cursor: 'pointer',
    fontSize: '12px',
    fontFamily: 'inherit',
    padding: 0,
    textAlign: 'left' as const,
  },
  footer: {
    padding: '12px 14px',
    borderTop: `1px solid ${COLOR.border}`,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    flexShrink: 0,
  },
  primaryButton: {
    background: COLOR.accent,
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 14px',
    fontSize: '13px',
    fontFamily: 'inherit',
    fontWeight: 500,
    cursor: 'pointer',
  },
  ghostButton: {
    background: 'transparent',
    color: COLOR.textSecondary,
    border: `1px solid ${COLOR.borderStrong}`,
    borderRadius: '6px',
    padding: '8px 14px',
    fontSize: '13px',
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  banner: {
    borderRadius: '6px',
    padding: '9px 11px',
    fontSize: '12px',
    lineHeight: 1.45,
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px 14px',
  },
  summaryLabel: { fontSize: '11px', color: COLOR.textTertiary },
  summaryValue: { fontSize: '13px', fontWeight: 500 },
  divider: { height: '1px', background: COLOR.border, border: 'none', margin: 0 },
} as const;

export const disabledStyle = (
  style: React.CSSProperties,
  isDisabled: boolean,
): React.CSSProperties =>
  isDisabled ? { ...style, opacity: 0.5, cursor: 'not-allowed' } : style;
