import i18n from '@/i18n';

/** Black or white text, whichever reads better on this `#rrggbb` color. */
export function readableForeground(color: string) {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16));
  return (0.299 * r! + 0.587 * g! + 0.114 * b!) / 255 > 0.6 ? '#111111' : '#ffffff';
}

export interface Identity {
  name: string;
  primaryColor: string | null;
  favicon: string | null;
}

/** Puts the installation identity on the page: color, tab title and icon. */
export function applyIdentity(identity: Identity) {
  const root = document.documentElement.style;
  if (identity.primaryColor) {
    root.setProperty('--primary', identity.primaryColor);
    root.setProperty('--primary-foreground', readableForeground(identity.primaryColor));
  } else {
    root.removeProperty('--primary');
    root.removeProperty('--primary-foreground');
  }
  document.title = identity.name === 'SIM' ? `SIM — ${i18n.t('app.fullName')}` : identity.name;
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (icon) {
    if (!icon.dataset.original) icon.dataset.original = icon.href;
    icon.removeAttribute('type');
    icon.href = identity.favicon ?? icon.dataset.original;
  }
}
