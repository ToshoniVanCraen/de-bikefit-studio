'use client';

import { useActionState, useState } from 'react';

import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  ActionForm,
  CheckboxField,
  Field,
  SectionCard,
  StatusMessage,
  SubmitButton,
} from '@/components/admin/form';
import type { LocationOption } from '@/components/admin/booking-labels';
import { CopyTokenHelp } from '@/components/admin/copy-token-help';
import { MediaPicker, type MediaOption } from '@/components/admin/media-picker';
import {
  OfferingAddonsFields,
  type AddonCandidate,
} from '@/components/admin/offering-addons-fields';
import {
  OfferingVariantsFields,
  type OfferingFormVariant,
} from '@/components/admin/offering-variants-fields';
import { deleteOfferingAction, saveOfferingAction } from '@/lib/cms/actions/offerings';
import { IDLE_STATE } from '@/lib/cms/actions/state';
import {
  OFFER_CATEGORIES,
  OFFER_CATEGORY_LABELS,
  OFFER_CTA_LABEL,
  OFFER_PRICE_TEXT_MAX,
} from '@/lib/offers/catalogue';
import {
  AUDIENCE_LABELS,
  audiencesFor,
  type OfferingVariantMode,
} from '@/lib/offers/offering-audience';
import type { AddonChoice, OfferingBookingMode } from '@/lib/offers/offering';
import type { OfferingContent } from '@/lib/offers/offering-content';

export type OfferingFormValues = {
  id: string | null;
  content: OfferingContent;
  isListed: boolean;
  bookingMode: OfferingBookingMode;
  variantMode: OfferingVariantMode;
  variants: OfferingFormVariant[];
  /** Extra's (20 Oct 2026): see `OfferingSettings`. */
  isAddon: boolean;
  soldAlone: boolean;
  addonMinutes: number | null;
  addonIds: string[];
  addonOptions: AddonChoice[];
};

/**
 * Beheer → Aanbod: one form for everything about an offering — the text a
 * visitor reads, whether it is shown, how it is booked, and per variant the
 * booking facts (duration, buffer, location, guardian rule) and the price.
 * Saving writes the offering and its booking services in one go
 * (`src/lib/offers/repo.ts`); who offers a variant stays the providers' own
 * choice (Mijn agenda → Mijn aanbod). The server action is the boundary
 * (`offering.manage`); this form only explains.
 */
export function OfferingForm({
  offering,
  locations,
  media,
  defaultBuffer,
  addonCandidates,
}: {
  offering: OfferingFormValues;
  locations: LocationOption[];
  media: MediaOption[];
  defaultBuffer: number;
  /** The other offerings marked as an extra. */
  addonCandidates: AddonCandidate[];
}) {
  const [state, formAction] = useActionState(saveOfferingAction, IDLE_STATE);
  const [variantMode, setVariantMode] = useState<OfferingVariantMode>(offering.variantMode);
  const [bookingMode, setBookingMode] = useState<OfferingBookingMode>(offering.bookingMode);
  const { content } = offering;
  const id = (name: string) => `offering-${name}`;
  const splitLabels = audiencesFor('audience').map((audience) => AUDIENCE_LABELS[audience]);

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="offeringId" value={offering.id ?? ''} />

        <SectionCard
          title="Tekst"
          description="Wat de bezoeker leest op /aanbod en op de eigen pagina van dit aanbod."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Titel" htmlFor={id('title')}>
              <Input id={id('title')} name="title" defaultValue={content.title} required />
            </Field>
            <Field
              label="Slug"
              htmlFor={id('slug')}
              hint="Het laatste deel van het webadres (/aanbod/…). Leeg laten om hem uit de titel af te leiden."
            >
              <Input
                id={id('slug')}
                name="slug"
                defaultValue={content.slug}
                placeholder="bikefit-huidige-fiets"
              />
            </Field>
            <Field label="Categorie" htmlFor={id('category')}>
              <Select id={id('category')} name="category" defaultValue={content.category}>
                {OFFER_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {OFFER_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Volgorde"
              htmlFor={id('sortOrder')}
              hint="Binnen de categorie; lager staat eerst."
            >
              <Input
                id={id('sortOrder')}
                name="sortOrder"
                type="number"
                min={0}
                max={999}
                defaultValue={content.sortOrder}
              />
            </Field>
          </div>
          <div className="mt-3 flex flex-col gap-3">
            <CopyTokenHelp />
            <Field
              label="Korte omschrijving"
              htmlFor={id('summary')}
              hint="Eén of twee zinnen op de kaart in het overzicht. Leeg = de inleiding."
            >
              <Textarea id={id('summary')} name="summary" rows={2} defaultValue={content.summary} />
            </Field>
            <Field label="Inleiding" htmlFor={id('intro')}>
              <Textarea id={id('intro')} name="intro" rows={3} defaultValue={content.intro} />
            </Field>
            <Field label="Doel" htmlFor={id('goal')}>
              <Textarea id={id('goal')} name="goal" rows={2} defaultValue={content.goal} />
            </Field>
            <Field label="Inhoud" htmlFor={id('contents')} hint="Eén punt per regel.">
              <Textarea
                id={id('contents')}
                name="contents"
                rows={5}
                defaultValue={content.contents.join('\n')}
              />
            </Field>
            <Field label="Mogelijke extra’s" htmlFor={id('extras')} hint="Eén per regel.">
              <Textarea
                id={id('extras')}
                name="extras"
                rows={3}
                defaultValue={content.extras.join('\n')}
              />
            </Field>
            <Field label="Uitleg bij de extra’s" htmlFor={id('extrasNote')}>
              <Input id={id('extrasNote')} name="extrasNote" defaultValue={content.extrasNote} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Tekst van de boekknop"
                htmlFor={id('ctaLabel')}
                hint={`Leeg = “${OFFER_CTA_LABEL}”.`}
              >
                <Input id={id('ctaLabel')} name="ctaLabel" defaultValue={content.ctaLabel} />
              </Field>
              <Field
                label="Meta description"
                htmlFor={id('metaDescription')}
                hint="Voor zoekmachines; leeg = de korte omschrijving."
              >
                <Input
                  id={id('metaDescription')}
                  name="metaDescription"
                  defaultValue={content.metaDescription}
                  maxLength={320}
                />
              </Field>
            </div>
            <Field
              label="Afbeelding"
              hint={
                content.image.url && !content.image.mediaId
                  ? `Nu: ${content.image.url} (tijdelijk beeld). Kies een eigen foto om het te vervangen.`
                  : 'Een eigen foto uit Media; mag leeg blijven.'
              }
            >
              <input type="hidden" name="imageUrl" value={content.image.url ?? ''} />
              <MediaPicker
                value={content.image.mediaId}
                name="imageMediaId"
                media={media}
                emptyLabel="Geen afbeelding gekozen"
              />
            </Field>
            <Field label="Alt-tekst van de afbeelding" htmlFor={id('imageAlt')}>
              <Input id={id('imageAlt')} name="imageAlt" defaultValue={content.image.alt} />
            </Field>
          </div>
        </SectionCard>

        <SectionCard
          title="Tonen en boeken"
          description="Of dit aanbod op de website staat, en hoe een bezoeker het boekt."
        >
          <div className="flex flex-col gap-4">
            <CheckboxField
              name="isListed"
              label="Tonen op de website"
              defaultChecked={offering.isListed}
              hint="In de overzichten (Aanbod, home, Bikefit), op de eigen pagina en op de afspraakpagina. Uit = niet te zien en niet te boeken; de tekst blijft bewaard."
            />
            <fieldset className="flex flex-col gap-1.5">
              <legend className="admin-label mb-1 text-xs text-muted-foreground">Varianten</legend>
              <Radio
                name="variantMode"
                value="single"
                checked={variantMode === 'single'}
                onChange={() => setVariantMode('single')}
                label="Eén optie voor iedereen"
              />
              <Radio
                name="variantMode"
                value="audience"
                checked={variantMode === 'audience'}
                onChange={() => setVariantMode('audience')}
                label="Volwassene en Jeugd apart"
                hint={`Per variant (${splitLabels.join(', ')}) een eigen duur, ouderregel en prijs.`}
              />
            </fieldset>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="admin-label mb-1 text-xs text-muted-foreground">Boeken</legend>
              <Radio
                name="bookingMode"
                value="direct"
                checked={bookingMode === 'direct'}
                onChange={() => setBookingMode('direct')}
                label="Rechtstreeks online boeken"
                hint="De knop gaat naar /afspraak met enkel de varianten hieronder. Zonder aanbieder voor een variant staat het aanbod grijs: “tijdelijk niet online te boeken”."
              />
              <Radio
                name="bookingMode"
                value="enquiry"
                checked={bookingMode === 'enquiry'}
                onChange={() => setBookingMode('enquiry')}
                label="Enkel op aanvraag"
                hint="De pagina toont een aanvraagformulier; de aanvraag gaat naar de ontvanger uit Beheer → E-mail."
              />
            </fieldset>
            {bookingMode === 'enquiry' ? (
              <>
                <Field
                  label="Duur (tekst)"
                  htmlFor={id('duration')}
                  hint="Vrije tekst voor aanbod op aanvraag, bv. “ongeveer 90 minuten”. Leeg = “Duur in overleg”."
                >
                  <Input id={id('duration')} name="duration" defaultValue={content.duration} />
                </Field>
                <Field
                  label="Prijs (tekst)"
                  htmlFor={id('priceText')}
                  hint="Vrije tekst voor aanbod op aanvraag, bv. “Gratis binnen 6 maanden na je fit, daarna € 75”. Leeg = de prijs van de varianten."
                >
                  <Input
                    id={id('priceText')}
                    name="priceText"
                    defaultValue={content.priceText}
                    maxLength={OFFER_PRICE_TEXT_MAX}
                  />
                </Field>
              </>
            ) : (
              <>
                <input type="hidden" name="duration" value={content.duration} />
                <input type="hidden" name="priceText" value={content.priceText} />
              </>
            )}
          </div>
        </SectionCard>

        <OfferingAddonsFields
          values={{
            isAddon: offering.isAddon,
            soldAlone: offering.soldAlone,
            addonMinutes: offering.addonMinutes,
            addonIds: offering.addonIds,
            addonOptions: offering.addonOptions,
          }}
          candidates={addonCandidates}
          offeringSlug={content.slug}
        />

        <OfferingVariantsFields
          variantMode={variantMode}
          bookingMode={bookingMode}
          variants={offering.variants}
          locations={locations}
          defaultBuffer={defaultBuffer}
        />

        <StatusMessage state={state} />
        <div>
          <SubmitButton size="lg">{offering.id ? 'Opslaan' : 'Aanbod aanmaken'}</SubmitButton>
        </div>
      </form>

      {offering.id ? (
        <SectionCard
          title="Verwijderen"
          description="Verwijdert dit aanbod van de website en uit het beheer. De diensten erachter worden inactief; bestaande afspraken blijven staan."
        >
          <ActionForm
            action={deleteOfferingAction}
            hidden={{ offeringId: offering.id }}
            className="max-w-sm"
          >
            <Field
              label="Aanbod verwijderen"
              htmlFor={id('confirm')}
              hint="Typ VERWIJDER om te bevestigen."
            >
              <Input id={id('confirm')} name="confirm" placeholder="VERWIJDER" />
            </Field>
            <div>
              <SubmitButton variant="destructive" confirm="Aanbod definitief verwijderen?">
                Definitief verwijderen
              </SubmitButton>
            </div>
          </ActionForm>
        </SectionCard>
      ) : null}
    </div>
  );
}

function Radio({
  name,
  value,
  checked,
  onChange,
  label,
  hint,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 size-4 accent-primary"
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}
