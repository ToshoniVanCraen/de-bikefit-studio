import { StudioLogo } from '@/components/studio/logo';

/**
 * Shell of the staging gate's two pages (login, logout). The root layout
 * renders no chrome, so this brings its own skip link and `<main>`.
 *
 * Same look as the admin sign-in (`AdminAuthFrame`): `studio-root admin-root`
 * maps the shadcn variables onto the `--ds-*` tokens, a burgundy band with the
 * brand lockup, one narrow card. Single column on every width; the logo is an
 * SVG under `/brand/`, which the gate serves without a session.
 */
export function GateFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="studio-root admin-root flex flex-1 flex-col">
      <a className="studio-skip" href="#inhoud">
        Ga naar inhoud
      </a>
      <main
        id="inhoud"
        tabIndex={-1}
        className="flex flex-1 items-start justify-center px-4 py-8 outline-none sm:items-center sm:py-16"
      >
        <div className="w-full max-w-md border border-border bg-card">
          <div className="bg-ds-surface-inverse px-6 py-5">
            <StudioLogo siteName="De Bikefit Studio" tone="dark" priority />
          </div>
          <div className="p-6 sm:p-8">
            <h1 className="text-3xl leading-none">{title}</h1>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
