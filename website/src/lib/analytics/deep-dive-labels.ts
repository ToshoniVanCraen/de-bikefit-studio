/**
 * Dutch labels for the dimension values GA4 returns in English or as
 * placeholders. Pure; shared by the dashboard panel and the deep dive.
 */

const CHANNELS: Record<string, string> = {
  Direct: 'Direct',
  'Organic Search': 'Organisch zoeken',
  'Paid Search': 'Betaald zoeken',
  'Organic Social': 'Sociale media',
  'Paid Social': 'Betaalde sociale media',
  Referral: 'Verwijzing',
  Email: 'E-mail',
  'Organic Video': 'Video',
  'Paid Video': 'Betaalde video',
  'Organic Shopping': 'Shopping',
  'Paid Shopping': 'Betaald shopping',
  Display: 'Display-advertenties',
  'Cross-network': 'Google-campagnes',
  Affiliates: 'Partners',
  Audio: 'Audio',
  SMS: 'Sms',
  'Mobile Push Notifications': 'Pushmeldingen',
  'Paid Other': 'Overig betaald',
  Unassigned: 'Niet toegewezen',
};

const DEVICES: Record<string, string> = {
  desktop: 'Computer',
  mobile: 'Smartphone',
  tablet: 'Tablet',
  'smart tv': 'Smart-tv',
};

function isUnset(value: string): boolean {
  return !value || value === '(not set)' || value === '(other)';
}

/** `sessionDefaultChannelGroup` → Dutch. */
export function channelLabel(value: string): string {
  if (isUnset(value)) return 'Onbekend';
  return CHANNELS[value] ?? value;
}

/** `deviceCategory` → Dutch. */
export function deviceLabel(value: string): string {
  if (isUnset(value)) return 'Onbekend';
  return DEVICES[value.toLowerCase()] ?? value;
}

/** `sessionSource` → readable: `(direct)` is "Direct", a placeholder is "Onbekend". */
export function sourceLabel(value: string): string {
  if (value === '(direct)') return 'Direct';
  if (isUnset(value)) return 'Onbekend';
  return value;
}

/** `city` → readable; GA4 hides small places behind `(not set)`. */
export function placeLabel(value: string): string {
  return isUnset(value) ? 'Onbekend' : value;
}
