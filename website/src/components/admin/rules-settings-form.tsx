'use client';

import { Input } from '@/components/ui/input';
import { Field } from '@/components/admin/form';
import { SettingForm } from '@/components/admin/setting-form';
import type { SiteSettings } from '@/lib/cms/blocks';
import { monthsInWords, RULE_MONTHS_MAX, RULE_MONTHS_MIN } from '@/lib/studio/months-in-words';

/**
 * Beheer → Instellingen → Regels (27 Oct 2026): the lengths that the copy states
 * in words. A text writes them as a variable ({{opvolging:volwassene}}, …) and
 * the website prints the number of months here as "zes maanden", "een jaar" or
 * "twee jaar" (any other number as "9 maanden"), so the follow-up, the free
 * second visit and the voucher validity read the same on every page, in the
 * booking widget and in the e-mails. These are the studio's decisions as text;
 * nothing is calculated from them.
 */
export function RulesSettingsForm({
  rules,
  locale,
  canEdit,
}: {
  rules: SiteSettings['rules'];
  locale: string;
  canEdit: boolean;
}) {
  return (
    <SettingForm
      settingKey="rules"
      locale={locale}
      canEdit={canEdit}
      title="Regels"
      description="Hoe lang probleemopvolging inbegrepen is, tot wanneer een tweede bezoek gratis is en hoe lang een cadeaubon geldig blijft. Aantal maanden; 6 leest als “zes maanden”, 12 als “een jaar” en 24 als “twee jaar”. Teksten gebruiken er de variabele bij, dus pas het hier aan en alles volgt."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <MonthsField
          name="followUpMonthsAdult"
          label="Probleemopvolging volwassene (maanden)"
          token="{{opvolging:volwassene}}"
          months={rules.followUpMonthsAdult}
        />
        <MonthsField
          name="followUpMonthsYouthPackage"
          label="Opvolging jeugd – volledig pakket (maanden)"
          token="{{opvolging:jeugd-pakket}}"
          months={rules.followUpMonthsYouthPackage}
        />
        <MonthsField
          name="secondVisitFreeMonths"
          label="Tweede bezoek gratis binnen (maanden)"
          token="{{tweede-bezoek-gratis}}"
          months={rules.secondVisitFreeMonths}
        />
        <MonthsField
          name="voucherValidityMonths"
          label="Geldigheid cadeaubon (maanden)"
          token="{{cadeaubon-geldigheid}}"
          months={rules.voucherValidityMonths}
        />
      </div>
    </SettingForm>
  );
}

function MonthsField({
  name,
  label,
  token,
  months,
}: {
  name: keyof SiteSettings['rules'];
  label: string;
  token: string;
  months: number;
}) {
  const id = `rules-${name}`;
  return (
    <Field
      label={label}
      htmlFor={id}
      hint={`Variabele ${token}. Nu: “${monthsInWords(months)}”. Tussen ${RULE_MONTHS_MIN} en ${RULE_MONTHS_MAX}.`}
    >
      <Input
        id={id}
        name={name}
        type="number"
        min={RULE_MONTHS_MIN}
        max={RULE_MONTHS_MAX}
        step={1}
        defaultValue={months}
      />
    </Field>
  );
}
