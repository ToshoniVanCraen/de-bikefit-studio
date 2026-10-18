import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FLASH_TONES } from '@/components/admin/tones';
import {
  GATE_COPY,
  GATE_FIELD_IDENTIFIER,
  GATE_FIELD_NEXT,
  GATE_FIELD_PASSWORD,
} from '@/lib/staging-gate/form-state';
import { GATE_LOGIN_POST_PATH } from '@/lib/staging-gate/policy';

const ERROR_ID = 'staging-gate-fout';

/**
 * The staging gate's sign-in form (`docs/staging-gate.md` §3). An ordinary
 * form POST goes to the dedicated login Route Handler, never to a public-page
 * Server Action. The handler redirects back with a fixed, non-secret failure
 * code or to the validated return path on success.
 */
export function GateLoginForm({
  next,
  errorMessage,
}: {
  next: string;
  errorMessage: string | null;
}) {
  const failed = errorMessage !== null;

  return (
    <form action={GATE_LOGIN_POST_PATH} method="post" className="flex flex-col gap-4">
      <input type="hidden" name={GATE_FIELD_NEXT} value={next} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="staging-gate-identifier">{GATE_COPY.identifierLabel}</Label>
        <Input
          id="staging-gate-identifier"
          name={GATE_FIELD_IDENTIFIER}
          type="text"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          aria-invalid={failed || undefined}
          aria-describedby={failed ? ERROR_ID : undefined}
          className="h-11 text-base"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="staging-gate-password">{GATE_COPY.passwordLabel}</Label>
        <Input
          id="staging-gate-password"
          name={GATE_FIELD_PASSWORD}
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={failed || undefined}
          aria-describedby={failed ? ERROR_ID : undefined}
          className="h-11 text-base"
        />
      </div>

      {failed ? (
        <p id={ERROR_ID} role="alert" className={`px-3 py-2 text-sm ${FLASH_TONES.error}`}>
          {errorMessage}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="mt-1 h-11 w-full text-base">
        {GATE_COPY.submit}
      </Button>
    </form>
  );
}
