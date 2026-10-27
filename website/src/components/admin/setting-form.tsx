'use client';

import { useActionState } from 'react';

import { SectionCard, StatusMessage, SubmitButton } from '@/components/admin/form';
import { updateSettingAction } from '@/lib/cms/actions/settings';
import { IDLE_STATE } from '@/lib/cms/actions/state';
import type { SiteSettingKey } from '@/lib/cms/blocks';

/**
 * One form per `cms_site_settings` key (Beheer → Instellingen): the key and the
 * locale travel as hidden fields, `updateSettingAction` validates and saves, and
 * the status line shows its answer. Shared by `settings-forms.tsx` (the
 * original groups) and `settings-business-forms.tsx` (the groups copy refers to).
 */
export function SettingForm({
  settingKey,
  locale,
  title,
  description,
  canEdit,
  children,
}: {
  settingKey: SiteSettingKey;
  locale: string;
  title: string;
  description: string;
  canEdit: boolean;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState(updateSettingAction, IDLE_STATE);

  return (
    <SectionCard title={title} description={description}>
      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="key" value={settingKey} />
        <input type="hidden" name="locale" value={locale} />
        {children}
        <StatusMessage state={state} />
        {canEdit ? (
          <div className="mt-1 flex justify-end">
            <SubmitButton>Opslaan</SubmitButton>
          </div>
        ) : null}
      </form>
    </SectionCard>
  );
}
