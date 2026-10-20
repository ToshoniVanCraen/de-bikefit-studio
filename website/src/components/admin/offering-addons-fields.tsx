'use client';

import { Input } from '@/components/ui/input';
import { CheckboxField, Field, SectionCard } from '@/components/admin/form';
import { centsToEuroInput } from '@/components/admin/booking-labels';
import { OFFERING_MAX_ADDON_CHOICES, type AddonChoice } from '@/lib/offers/offering';

/** An offering that is marked as an extra, as the "Extra's bij dit aanbod" list shows it. */
export type AddonCandidate = {
  id: string;
  title: string;
  /** `null` for an extra with choices (each choice has its own time). */
  minutes: number | null;
  /** "€ 85,00", "Zelfde type fiets € 75,00 · Ander type fiets € 150,00", or "Prijs op aanvraag". */
  priceLabel: string;
};

/**
 * Beheer → Aanbod, the "Extra's" card (20 Oct 2026): whether this offering
 * is an extra (and how much time it adds), its choices if it has several
 * (each with its own time and price), whether it is also sold on its own,
 * and which extras a visitor may tick when booking this offering. The fields
 * are read by `saveOfferingAction` and validated by the offering schema
 * (`src/lib/offers/offering.ts`); this card only explains.
 */
export function OfferingAddonsFields({
  values,
  candidates,
}: {
  values: {
    isAddon: boolean;
    soldAlone: boolean;
    addonMinutes: number | null;
    addonIds: string[];
    addonOptions: AddonChoice[];
  };
  candidates: AddonCandidate[];
}) {
  const rows = Array.from(
    { length: OFFERING_MAX_ADDON_CHOICES },
    (_, index) => values.addonOptions[index] ?? null,
  );
  return (
    <SectionCard
      title="Extra’s"
      description="Een extra is een aanbod dat een bezoeker aanvinkt bij het boeken van een ander aanbod: de tijd en de prijs komen erbij. Een aanbod kan zelf een extra zijn, extra’s toelaten, of allebei."
    >
      <div className="flex flex-col gap-4">
        <CheckboxField
          name="isAddon"
          label="Als extra te boeken bij een ander aanbod"
          defaultChecked={values.isAddon}
          hint="Vul dan ook de extra tijd in en een prijs per variant (hierboven), of geef keuzes op. Bij welk aanbod deze extra kan, kies je bij dát aanbod."
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Extra tijd (minuten)"
            htmlFor="offering-addonMinutes"
            hint="Hoeveel langer de afspraak wordt met deze extra erbij. Niet gebruikt zodra er keuzes zijn."
          >
            <Input
              id="offering-addonMinutes"
              name="addonMinutes"
              type="number"
              min={5}
              max={720}
              step={5}
              defaultValue={values.addonMinutes ?? ''}
            />
          </Field>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="admin-label mb-1 text-xs text-muted-foreground">
            Keuzes binnen deze extra
          </legend>
          <p className="text-xs text-muted-foreground">
            Laat leeg als deze extra één prijs en één tijd heeft. Met keuzes (bv. “Zelfde type
            fiets” en “Ander type fiets”) kiest de bezoeker er precies één; elke keuze heeft dan
            haar eigen tijd en prijs, en de extra tijd en de prijs per variant hierboven tellen
            niet.
          </p>
          {rows.map((choice, index) => (
            <div key={index} className="grid gap-3 sm:grid-cols-3">
              <Field label={`Keuze ${index + 1}`} htmlFor={`offering-addonOptionLabel-${index}`}>
                <Input
                  id={`offering-addonOptionLabel-${index}`}
                  name={`addonOptionLabel:${index}`}
                  defaultValue={choice?.label ?? ''}
                  placeholder={index === 0 ? 'Zelfde type fiets' : ''}
                  maxLength={60}
                />
              </Field>
              <Field label="Tijd (minuten)" htmlFor={`offering-addonOptionMinutes-${index}`}>
                <Input
                  id={`offering-addonOptionMinutes-${index}`}
                  name={`addonOptionMinutes:${index}`}
                  type="number"
                  min={5}
                  max={720}
                  step={5}
                  defaultValue={choice?.minutes ?? ''}
                />
              </Field>
              <Field label="Prijs (euro)" htmlFor={`offering-addonOptionPrice-${index}`}>
                <Input
                  id={`offering-addonOptionPrice-${index}`}
                  name={`addonOptionPrice:${index}`}
                  inputMode="decimal"
                  defaultValue={centsToEuroInput(choice?.priceCents ?? null)}
                />
              </Field>
            </div>
          ))}
        </fieldset>
        <CheckboxField
          name="soldAlone"
          label="Ook apart te boeken of aan te vragen"
          defaultChecked={values.soldAlone}
          hint="Uit = enkel als extra: het aanbod blijft in het overzicht staan, maar de knop op zijn pagina verwijst naar het aanbod waar het bij hoort."
        />
        <fieldset className="flex flex-col gap-1.5">
          <legend className="admin-label mb-1 text-xs text-muted-foreground">
            Extra’s bij dit aanbod
          </legend>
          {candidates.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nog geen ander aanbod is als extra te boeken. Vink dat eerst aan bij dat aanbod.
            </p>
          ) : (
            candidates.map((candidate) => (
              <label key={candidate.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="addonIds"
                  value={candidate.id}
                  defaultChecked={values.addonIds.includes(candidate.id)}
                  className="mt-0.5 size-4 rounded border-input accent-primary"
                />
                <span>
                  <span className="font-medium">{candidate.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {candidate.minutes != null ? `+ ${candidate.minutes} min · ` : ''}
                    {candidate.priceLabel}
                  </span>
                </span>
              </label>
            ))
          )}
          <p className="text-xs text-muted-foreground">
            Alleen bij rechtstreeks online boeken kan een bezoeker extra’s aanvinken; ze staan in de
            volgorde van het overzicht.
          </p>
        </fieldset>
      </div>
    </SectionCard>
  );
}
