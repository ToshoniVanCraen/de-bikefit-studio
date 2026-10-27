import { COPY_TOKEN_HELP } from '@/lib/studio/copy-token-catalogue';

/**
 * "Variabelen in teksten": the copy tokens an editor may type in a text (27 Oct
 * 2026), one line each, collapsed by default so it stays out of the way under
 * the fields of the block editor, the offering form and the booking settings.
 * A native `<details>`, so it works without JavaScript and needs no state.
 *
 * The list is `COPY_TOKEN_HELP` (`src/lib/studio/copy-token-catalogue.ts`),
 * which a unit test keeps in step with the engine. The admin never resolves a
 * token: a field shows what was typed, the public site fills it in.
 */
export function CopyTokenHelp({ className = '' }: { className?: string }) {
  return (
    <details className={`text-xs text-muted-foreground ${className}`.trim()}>
      <summary className="cursor-pointer select-none">Variabelen in teksten</summary>
      <p className="mt-1">
        Typ een variabele in een tekst en de website vult ze in met de gegevens uit het beheer: een
        prijs, duur, naam of looptijd staat zo maar op één plaats. Hier blijft de variabele staan
        zoals je ze typt. Een slug is het laatste deel van het webadres.
      </p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {COPY_TOKEN_HELP.map((entry) => (
          <li key={entry.token}>
            <code className="bg-muted px-1">{entry.token}</code> — {entry.description}
          </li>
        ))}
      </ul>
    </details>
  );
}
