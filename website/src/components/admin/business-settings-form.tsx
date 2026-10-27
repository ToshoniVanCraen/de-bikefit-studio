'use client';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/admin/form';
import { SettingForm } from '@/components/admin/setting-form';
import type { SiteSettings } from '@/lib/cms/blocks';

/**
 * Beheer → Instellingen → Bedrijfsgegevens (27 Oct 2026): the master of the
 * legal identity behind the studio. The privacy statement, the terms and the
 * e-mails refer to it with the copy tokens `{{bedrijf}}`, `{{zetel}}`, `{{kbo}}`
 * and `{{btw}}`, and the structured data of the site reads it, so a change here
 * changes every text at once and nobody types the company number twice.
 */
export function BusinessSettingsForm({
  business,
  locale,
  canEdit,
}: {
  business: SiteSettings['business'];
  locale: string;
  canEdit: boolean;
}) {
  return (
    <SettingForm
      settingKey="business"
      locale={locale}
      canEdit={canEdit}
      title="Bedrijfsgegevens"
      description="De wettelijke identiteit achter de studio. De privacyverklaring, de algemene voorwaarden en de structured data lezen ze hier. In teksten typ je ze niet uit: gebruik de variabelen {{bedrijf}}, {{zetel}}, {{kbo}} en {{btw}}."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Juridische naam"
          htmlFor="business-legalName"
          hint="Met rechtsvorm, bv. Qarakter BV. Variabele {{bedrijf}}."
        >
          <Input id="business-legalName" name="legalName" defaultValue={business.legalName} />
        </Field>
        <Field
          label="Ondernemingsnummer (KBO)"
          htmlFor="business-enterpriseNumber"
          hint="Zoals het in de teksten staat, bv. BE 1036.912.281. Variabele {{kbo}}."
        >
          <Input
            id="business-enterpriseNumber"
            name="enterpriseNumber"
            defaultValue={business.enterpriseNumber}
          />
        </Field>
        <Field
          label="Btw-nummer"
          htmlFor="business-vatNumber"
          hint="In België is dat het ondernemingsnummer. Variabele {{btw}}; ook de structured data gebruikt het."
        >
          <Input id="business-vatNumber" name="vatNumber" defaultValue={business.vatNumber} />
        </Field>
        <Field
          label="Land van de zetel"
          htmlFor="business-seatCountry"
          hint="Landcode van 2 letters, bv. BE."
        >
          <Input
            id="business-seatCountry"
            name="seatCountry"
            maxLength={2}
            defaultValue={business.seatCountry}
          />
        </Field>
        <Field label="Postcode van de zetel" htmlFor="business-seatPostalCode">
          <Input
            id="business-seatPostalCode"
            name="seatPostalCode"
            defaultValue={business.seatPostalCode}
          />
        </Field>
        <Field label="Gemeente van de zetel" htmlFor="business-seatCity">
          <Input id="business-seatCity" name="seatCity" defaultValue={business.seatCity} />
        </Field>
      </div>
      <Field
        label="Adresregels van de maatschappelijke zetel"
        htmlFor="business-seatAddressLines"
        hint="Eén regel per lijn, zonder postcode en gemeente. Samen vormen ze de variabele {{zetel}}, bv. “Weversstraat 7, 1730 Asse”. Dit is niet het adres van de studio: dat staat onder Contact."
        className="mt-3"
      >
        <Textarea
          id="business-seatAddressLines"
          name="seatAddressLines"
          rows={3}
          defaultValue={business.seatAddressLines.join('\n')}
        />
      </Field>
    </SettingForm>
  );
}
