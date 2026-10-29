'use client';

import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field, SectionCard } from '@/components/admin/form';
import {
  centsToEuroInput,
  locationOptionLabel,
  type LocationOption,
} from '@/components/admin/booking-labels';
import {
  AUDIENCE_LABELS,
  audiencesFor,
  type OfferingAudience,
  type OfferingVariantMode,
} from '@/lib/offers/offering-audience';
import type { OfferingBookingMode } from '@/lib/offers/offering';

/** One variant as the form shows it: the stored price and its service's facts. */
export type OfferingFormVariant = {
  audience: OfferingAudience;
  serviceId: string | null;
  priceCents: number | null;
  durationMinutes: number | null;
  bufferAfterMinutes: number | null;
  locationId: string | null;
  providerNames: string[];
};

/**
 * The "Varianten" / "Boeking" card of the offering form, split from
 * `offering-form.tsx`: per variant — Volwassene and Jeugd – eenmalig for an
 * offering split by audience, else the one option — the booking facts
 * (duration, buffer, location) and the price. The fields are named
 * `<field>:<audience>`, which `saveOfferingAction` reads back through
 * `audiencesFor()`.
 */
export function OfferingVariantsFields({
  variantMode,
  bookingMode,
  variants,
  locations,
  defaultBuffer,
}: {
  variantMode: OfferingVariantMode;
  bookingMode: OfferingBookingMode;
  variants: OfferingFormVariant[];
  locations: LocationOption[];
  defaultBuffer: number;
}) {
  const id = (name: string) => `offering-${name}`;
  const variant = (audience: OfferingAudience) =>
    variants.find((entry) => entry.audience === audience) ?? null;

  return (
    <SectionCard
      title={variantMode === 'audience' ? 'Varianten' : 'Boeking'}
      description={
        bookingMode === 'direct'
          ? 'Per variant: hoe lang de afspraak duurt in de agenda, de buffer erna, de locatie en de prijs. Aanbieders kiezen zelf wat ze aanbieden (Mijn agenda).'
          : 'Op aanvraag: enkel de prijs telt. Een ingevulde duur wordt bewaard voor als je later rechtstreeks online boeken aanzet.'
      }
    >
      <div className="flex flex-col gap-3">
        {audiencesFor(variantMode).map((audience) => {
          const label = AUDIENCE_LABELS[audience] || 'Het aanbod';
          const current = variant(audience);
          return (
            <fieldset
              key={audience}
              className="grid gap-3 border border-border bg-background p-3 sm:grid-cols-2"
            >
              <legend className="admin-label px-1 text-xs text-muted-foreground">{label}</legend>
              <input
                type="hidden"
                name={`serviceId:${audience}`}
                value={current?.serviceId ?? ''}
              />
              <Field
                label="Duur in de agenda (minuten)"
                htmlFor={id(`duration-${audience}`)}
                hint={bookingMode === 'direct' ? 'Verplicht om online te boeken.' : undefined}
              >
                <Input
                  id={id(`duration-${audience}`)}
                  name={`duration:${audience}`}
                  type="number"
                  min={5}
                  max={720}
                  step={5}
                  defaultValue={current?.durationMinutes ?? (bookingMode === 'direct' ? 60 : '')}
                  required={bookingMode === 'direct'}
                />
              </Field>
              <Field
                label="Buffer na afloop (minuten)"
                htmlFor={id(`buffer-${audience}`)}
                hint={`Leeg = standaard uit de instellingen (${defaultBuffer} min).`}
              >
                <Input
                  id={id(`buffer-${audience}`)}
                  name={`buffer:${audience}`}
                  type="number"
                  min={0}
                  max={240}
                  step={5}
                  defaultValue={current?.bufferAfterMinutes ?? ''}
                />
              </Field>
              <Field
                label="Locatie"
                htmlFor={id(`location-${audience}`)}
                hint="Leeg = de standaardlocatie van de aanbieder."
              >
                <Select
                  id={id(`location-${audience}`)}
                  name={`location:${audience}`}
                  defaultValue={current?.locationId ?? ''}
                >
                  <option value="">Standaardlocatie van de aanbieder</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {locationOptionLabel(location)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Prijs (euro)"
                htmlFor={id(`price-${audience}`)}
                hint="Bv. 150 of 149,50. Leeg = “Prijs op aanvraag”."
              >
                <Input
                  id={id(`price-${audience}`)}
                  name={`price:${audience}`}
                  inputMode="decimal"
                  defaultValue={centsToEuroInput(current?.priceCents ?? null)}
                />
              </Field>
              {bookingMode === 'direct' && current?.serviceId ? (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  {current.providerNames.length > 0
                    ? `Aangeboden door ${current.providerNames.join(', ')}.`
                    : 'Nog geen aanbieder: deze variant is tijdelijk niet online te boeken. Aanbieders vinken dit zelf aan onder Mijn agenda → Mijn aanbod.'}
                </p>
              ) : bookingMode === 'direct' ? (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Na het opslaan kunnen aanbieders deze variant aanvinken onder Mijn agenda → Mijn
                  aanbod.
                </p>
              ) : null}
            </fieldset>
          );
        })}
      </div>
    </SectionCard>
  );
}
