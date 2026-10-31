# Register tijdelijke inhoud — De Bikefit Studio

Canonieke checklist van **alle** tijdelijke of onbevestigde inhoud op de publieke site, bijgehouden
sinds de herwerking van 13 oktober 2026 (Aanbod, Voor wie, Bikefit, Ons team). Toshoni vroeg om
nu met tijdelijke inhoud te werken en alles bij te houden tot het definitief is. Elke rij heeft een
vaste ID; IDs worden nooit hergebruikt of hernummerd.

**Regels.**

- Vul nooit een feitelijk gat met een verzonnen detail: geen prijzen, duur, diploma's, jaartallen,
  prestaties of merken zonder bron.
- Wijzig je de inhoud, pas dan in hetzelfde werk de rij aan. Zet de status op *afgerond* met datum
  zodra de definitieve inhoud gepubliceerd is. Verwijder geen rijen.
- **Sinds 27 okt 2026 typt geen tekst nog een bedrag, een duur, een opvolgperiode, het
  telefoonnummer, het e-mailadres, het adres, de bedrijfsgegevens of de geldigheid van de
  cadeaubon**: de tekst bevat een token (`{{prijs:…}}`, `{{extra:…}}`, `{{duur:…}}`,
  `{{opvolging:…}}`, `{{tweede-bezoek-gratis}}`, `{{cadeaubon-geldigheid}}`, `{{telefoon}}`,
  `{{e-mail}}`, `{{adres}}`, `{{bedrijf}}`, `{{zetel}}`, `{{kbo}}`, `{{btw}}`) dat de site op het
  moment van tonen uit de bron haalt (`cms-architecture.md` §5). De rijen hieronder noemen de
  bedragen zoals de bezoeker ze leest; een bedrag wijzig je op de plaats van de bron, nooit in de
  tekst. `src/lib/studio/content-facts.test.ts` bewaakt dat.
- "CMS" betekent: `/admin` → **Pagina's** → de pagina (titel zoals in de lijst) → het blok →
  **Inhoud bewerken** → het veld → **Blok opslaan** → **Publiceren**. Het blok *Team* toont
  bovenaan een korte hint die naar dit register verwijst.
- **Sinds 17 okt 2026** is het aanbod geen pagina meer: alles over een dienst uit het aanbod
  (tekst, beeld, tonen, Volwassene/Jeugd, duur en prijs per variant, online boeken of op aanvraag)
  staat op één scherm, **Beheer → Aanbod** (`/admin/aanbod`) → de dienst → **Opslaan** (meteen
  live, geen publicatie). De paden `/aanbod/<slug>` hieronder zijn de publieke adressen.
- De seedtekst staat in `src/lib/offers/defaults.ts` (aanbod) en `src/lib/studio/seed-content/`
  (pagina's, team). Pas die mee aan zodat een nieuwe omgeving dezelfde inhoud krijgt.
  `src/lib/studio/seed-content/placeholders.test.ts` faalt als een dienst, teamlid of beeld uit de
  seed hier geen rij heeft.

**Status:** **open** = nog tijdelijk · **te bevestigen** = voorstel staat online, wacht op
akkoord · **bevestigd** = aangeleverd door Toshoni, mag blijven · **afgerond** = definitief (met
datum).

## Overzicht

| Reeks | Onderwerp | Rijen | Open | Te bevestigen | Bevestigd | Afgerond |
| --- | --- | --- | --- | --- | --- | --- |
| P | Prijzen | 9 | 0 | 1 | 0 | 8 |
| D | Duur | 9 | 2 | 0 | 0 | 7 |
| E | Inhoud, extra's, pakketten | 10 | 1 | 8 | 0 | 1 |
| T | Team | 5 | 1 | 2 | 1 | 1 |
| B | AI-beelden en lege beeldvakken | 6 | 5 | 0 | 0 | 1 |
| K | Online boeken per dienst | 6 | 2 | 1 | 0 | 3 |
| G | Bestaande hiaten in aangeraakte inhoud | 7 | 0 | 1 | 3 | 3 |
| C | Cadeaubon (bestelformulier) | 4 | 3 | 1 | 0 | 0 |
| | **Totaal** | **56** | **14** | **14** | **4** | **24** |

## 1. Prijzen (P)

Plaats: **Beheer → Aanbod** → de dienst → per variant het veld **Prijs (euro)**; leeg = "Prijs op
aanvraag" (`cms-architecture.md` §14). Er is geen enkel bedrag ingevuld of verzonnen. Tot 16 okt
2026 stonden deze velden in het blok *Dienst (aanbod)* van de dienstpagina; die pagina's bestaan
niet meer.

- Sinds 27 okt 2026: een aanbod **op aanvraag** kan een vrije **Prijs (tekst)** tonen (veld onder
  **Duur (tekst)**, bv. "Gratis binnen 6 maanden na je fit, daarna € 75", P-08); leeg = de bedragen
  per variant. "Volwassene en Jeugd apart" heeft twee varianten, elk met een eigen prijs:
  **Volwassene** en **Jeugd – eenmalig** (P-01, P-02).
- Nu staat in **Prijslabel** de bewerkbare tekst "Prijs op aanvraag"; **Prijs in eurocent** is
  leeg. Voor een aanbod gekoppeld aan boekingsdiensten zijn deze twee redactionele velden
  **niet** de publieke prijsbron: kaart en detail tonen "Prijs op aanvraag" tot de dienstprijzen
  en de variantweergave zijn goedgekeurd.
- Voor een **niet-gekoppeld** aanbod: vul na bevestiging **Prijs in eurocent** in (de tekst
  "Prijs op aanvraag" verbergt een ingevuld bedrag nooit) of vervang **Prijslabel** door bv.
  "vanaf € 120". Een ander prijslabel dan "Prijs op aanvraag" wint van het bedrag.
- Voor een **gekoppeld** aanbod: de admin beheert de bedragen en `show_price` op de afzonderlijke
  diensten in `/admin` → **Diensten**; de publieke variantweergave volgt pas na Toshoni's besluit.
- Nooit € 0 invullen. Een niet-gekoppeld aanbod met een bedrag in eurocent krijgt ook een prijs
  in de gestructureerde data (JSON-LD); een gekoppeld aanbod publiceert daar geen zelfstandige
  redactionele prijs.
- De prijs verschijnt op de dienstpagina (bovenaan en bij **Kostprijs**) en op de kaarten van
  het overzicht `/aanbod`. Die kaarten lezen de dienstpagina zelf; er is geen tweede plek om aan te
  passen. De overzichten op de home en op `/bikefit` tonen nooit een prijs (beslissing Toshoni,
  13 okt 2026), ook niet als **Prijzen tonen** daar aan staat. Een ingevuld blok *Prijzen*
  verschijnt evenmin buiten `/aanbod` en de dienstpagina's; op andere pagina's blijft het weg.

| ID | Pagina (titel in CMS) | Nu | Nodig | Status |
| --- | --- | --- | --- | --- |
| P-01 | `/aanbod/bikefit-nieuwe-fiets` (*Bikefit – aankoop nieuwe fiets*) | Volwassene € 275,00 · Jeugd € 150,00 (Toshoni, 20, 27 en 29 okt 2026; `src/lib/offers/defaults.ts`, bestaande databank: de bedragen van 20 okt via `cms:patch-aanbod-prijzen`, de teksten van 27 okt via een eigen patch); onder 16 is er enkel de eenmalige fit zonder opvolging (€ 150) | — | afgerond 2026-10-20 |
| P-02 | `/aanbod/bikefit-huidige-fiets` (*Bikefit – huidige fiets*) | Volwassene € 275,00 · Jeugd € 150,00 (Toshoni, 20, 27 en 29 okt 2026; `src/lib/offers/defaults.ts`, bestaande databank zoals bij P-01); de widget toont hetzelfde bedrag maar behoudt het keuzelabel **Jeugd – eenmalig** uit `cms_services` (K-06) | — | afgerond 2026-10-20 |
| P-03 | `/aanbod/voetanalyse` (*Voetanalyse*) | € 85,00 (Toshoni, 20 okt 2026; `src/lib/offers/defaults.ts`, bestaande databank via `cms:patch-aanbod-prijzen`) | — | afgerond 2026-10-20 |
| P-04 | `/aanbod/zadelanalyse` (*Zadelanalyse*) | € 60,00 (Toshoni, 20 okt 2026; `src/lib/offers/defaults.ts`, bestaande databank via `cms:patch-aanbod-prijzen`) | — | afgerond 2026-10-20 |
| P-05 | `/aanbod/afstellen-schoenplaatjes` (*Afstellen schoenplaatjes*) | € 15,00 (Toshoni, 20 okt 2026; `src/lib/offers/defaults.ts`, bestaande databank via `cms:patch-aanbod-prijzen`) | — | afgerond 2026-10-20 |
| P-06 | `/aanbod/lactaattest` (*Inspanningstest* sinds 27 okt 2026; het adres bleef) | € 120,00 (Toshoni, 20 okt 2026; `src/lib/offers/defaults.ts`, bestaande databank via `cms:patch-aanbod-prijzen`) | — | afgerond 2026-10-20 |
| P-07 | `/aanbod/coaching` (*Coaching*) | € 65,00 (Toshoni, 20 okt 2026; `src/lib/offers/defaults.ts`, bestaande databank via `cms:patch-aanbod-prijzen`) | eenheid: per sessie, per maand of per traject? (Toshoni gaf enkel het bedrag) | te bevestigen |
| P-08 | `/aanbod/bikefit-tweede-bezoek` (*Bikefit – tweede bezoek*) | € 75,00 (Toshoni, 20 okt 2026; `src/lib/offers/defaults.ts`, bestaande databank via `cms:patch-aanbod-prijzen`); gratis tot zes maanden na de fit. Sinds 27 okt 2026 leest de prijsregel “Gratis binnen 6 maanden na je fit, daarna € 75”: het veld **Prijs (tekst)** van het aanbod (`price_text`, migratie 0017); de variant blijft € 75,00 | — | afgerond 2026-10-20 |
| P-09 | `/aanbod/bikefit-tweede-fiets` (*Bikefit – tweede fiets*) | € 75,00 (Toshoni, 20 okt 2026; `src/lib/offers/defaults.ts`, bestaande databank via `cms:patch-aanbod-prijzen`); zelfde type fiets € 75 (30 min extra), ander type € 150 (1 u extra), in de inhoud | — | afgerond 2026-10-20 |

Een redactionele aanbodprijs verandert **niets** aan de online boeking (zie K-06): die toont
enkel de prijs van de gekozen dienst zelf (Volwassene of Jeugd), uit `/admin` → **Diensten**.
Voor P-02 wordt geen zelfstandige of gedeelde prijs gepubliceerd; na goedkeuring moet de
aanbodpagina beide varianten uit de gekoppelde diensten afleiden.

## 2. Duur (D)

Plaats: **Beheer → Aanbod** → de dienst. Op aanvraag: het veld **Duur (tekst)** (vrije tekst, bv.
"ongeveer 90 minuten"; leeg = "Duur in overleg"). Rechtstreeks online te boeken: per variant het
veld **Duur in de agenda (minuten)**, dat zowel de agenda als de getoonde duur bepaalt.

| ID | Pagina (titel in CMS) | Nu | Nodig | Status |
| --- | --- | --- | --- | --- |
| D-01 | `/aanbod/bikefit-nieuwe-fiets` (*Bikefit – aankoop nieuwe fiets*) | 2 uur | — | afgerond 2026-10-20 |
| D-02 | `/aanbod/bikefit-huidige-fiets` (*Bikefit – huidige fiets*) | Volwassene: 2 uur · Jeugd – eenmalig: 2 uur (uit gekoppelde `cms_services`; Toshoni, 20 okt 2026: "duurtijd 2u" voor de fit, voor Jeugd overgenomen) | bevestigen dat ook de jeugdfit 2 uur duurt | afgerond 2026-10-20 |
| D-03 | `/aanbod/voetanalyse` (*Voetanalyse*) | 30 minuten | — | afgerond 2026-10-20 |
| D-04 | `/aanbod/zadelanalyse` (*Zadelanalyse*) | 1 uur | — | afgerond 2026-10-20 |
| D-05 | `/aanbod/afstellen-schoenplaatjes` (*Afstellen schoenplaatjes*) | 15 minuten | — | afgerond 2026-10-20 |
| D-06 | `/aanbod/lactaattest` (*Inspanningstest*) | Duur in overleg | bevestigde duur (Toshoni gaf op 20 okt 2026 enkel de prijs) | open |
| D-07 | `/aanbod/coaching` (*Coaching*) | Traject en opvolging in overleg | bevestigde opzet en opvolgritme (geen vast ritme beloven zonder bevestiging) | open |
| D-08 | `/aanbod/bikefit-tweede-bezoek` (*Bikefit – tweede bezoek*) | 1 uur | — | afgerond 2026-10-20 |
| D-09 | `/aanbod/bikefit-tweede-fiets` (*Bikefit – tweede fiets*) | Extra tijd bovenop je bikefit, aansluitend op je afspraak | — | afgerond 2026-10-20 |

Bij D-09 staan de minuten van de twee keuzes (zelfde type 30, ander type 60) enkel bij de keuzes
zelf; de vrije tekst herhaalt ze niet (27 okt 2026). Bij D-01 volgt de duur de Volwassenenfit: het
veld **Duur (tekst)** bevat sinds 27 okt 2026 `{{duur:volwassenenfit}}` en toont dus "2 uur" zolang
die dienst 120 minuten duurt.

De planningsduur van een **boekbare** dienst staat in `/admin` → **Diensten** → veld
**Duur (minuten)** (Volwassenenfit en Jeugdfit – eenmalig: 120, sinds 20 okt 2026).
Bij een gekoppeld aanbod toont de publieke detailpagina elke boekbare variant met de actuele
dienstduur; het redactionele veld **Duur** van het aanbod wordt dan genegeerd. Voor een
niet-gekoppeld aanbod blijft dat veld de publieke tekst. Een duur op de aanbodpagina wijzigt
de planningsduur van een dienst niet.

## 3. Inhoud, mogelijke extra's en pakketten (E)

Plaats: **Beheer → Aanbod** → de dienst → velden **Doel**, **Inhoud** (één punt per regel),
**Mogelijke extra's** (één per regel) en **Uitleg bij de extra's**. De tekst is het
voorstel uit de werkopdracht van 13 oktober ("Suggested service content"). De uitleg bij de extra's
is overal: "Wat er precies bij komt en wat het kost, spreken we altijd vooraf samen met je af."

| ID | Pagina | Nu (voorstel) | Nodig | Status |
| --- | --- | --- | --- | --- |
| E-01 | `/aanbod/bikefit-nieuwe-fiets` | inhoud: de afstelling van je nieuwe fiets na de aankoop is inbegrepen in de € 275, als deel van de opvolging tot zes maanden na je fit (Toshoni, 27 okt 2026); extra's: een tweede bezoek na meer dan zes maanden; een tweede fiets erbij | bevestigen wat er echt bij kan | te bevestigen |
| E-02 | `/aanbod/bikefit-huidige-fiets` | inhoud noemt 3D-bewegingsanalyse (G-06); extra's: vervolgafspraak; gerichte voet- of zadelanalyse; nieuwe onderdelen apart | idem; is een vervolgafspraak inbegrepen of apart? | te bevestigen |
| E-03 | `/aanbod/voetanalyse` | extra's: schoenplaatjes afstellen; volledige bikefit. De 3D-geprinte schoenzolen op maat (Toshoni, 19 okt 2026) heeft Toshoni op 27 okt 2026 van de website laten halen: ze staan niet meer op `/bikefit` ("Meten om beter te kijken") en komen niet in de aanbodtekst | — | afgerond 2026-10-27 |
| E-04 | `/aanbod/zadelanalyse` | extra's: ruimer bikefittraject; ander zadel of onderdelen indien nodig. Toshoni (19 okt 2026): ruime keuze aan testzadels; staat nu op `/bikefit`, nog niet in de aanbodtekst. Drukmeting bewust niet vermeld | de aanbodtekst van Zadelanalyse de testzadels laten noemen; is er een drukmeetsysteem? | te bevestigen |
| E-05 | `/aanbod/afstellen-schoenplaatjes` | extra's: voetanalyse; volledige bikefit; nieuwe schoenplaatjes indien nodig | idem; plaatjes nooit "inbegrepen" zonder bevestiging | te bevestigen |
| E-06 | `/aanbod/lactaattest` | inhoud: stapsgewijze inspanning met lactaatmetingen; extra's: coaching; vervolgmeting in overleg | idem; protocol en materiaal (fiets of eigen fiets op trainer?) | te bevestigen |
| E-07 | `/aanbod/coaching` | extra's: inspanningstest; bikefit; aanvullende opvolging in overleg | idem; vorm van de opvolging (online, in de studio, ritme) | te bevestigen |
| E-08 | alle negen dienstpagina's | geen pakketten of combinatieprijzen, wel: zadel-, voetanalyse en schoenplaatjes zitten in elke bikefit; tweede fiets € 75 / € 150 bovenop de fit (20 okt 2026) | bevestigen of er nog andere combinaties zijn | open |
| E-09 | `/aanbod/bikefit-tweede-bezoek` | inhoud: opvolging gratis tot zes maanden na de fit, daarna € 75; extra: een volledige nieuwe bikefit | bevestigen dat een tweede bezoek altijd één uur is | te bevestigen |
| E-10 | `/aanbod/bikefit-tweede-fiets` | inhoud: zelfde type € 75 (30 min), ander type € 150 (1 u); extra: een derde fiets in overleg | bevestigen hoe een tweede fiets geboekt wordt (bij de fit, niet apart) | te bevestigen |

## 4. Team (T)

Plaats: CMS → *Ons team* (`/ons-team`) → blok *Team* → **Teamleden** → de persoon → velden **Rol**,
**Bio (alinea's, enkel gecontroleerde tekst)** en **Afbeelding**. Er is geen apart veld voor
kwalificaties: die komen, met bron, in **Bio** of kort in **Rol**. Het veld **Interne notitie (niet
publiek)** herhaalt per persoon de open rijen. Zonder **Afbeelding** toont de site de initialen.

Sinds 20 okt 2026 staat enkel Rutger op de pagina (beslissing Toshoni): de tussenkaarten van Robin
Van Lierde en Goran Van de Walle zijn weg, en met hen de rijen T-05 tot en met T-12. Een echte
portretfoto komt via `npm run images:portrait` in `public/images/team/` (procedure en herkomst:
`docs/editorial-images.md`), nooit als AI-beeld; de seed en `cms:rollout-aanbod` schrijven de
verwijzing in het blok.

| ID | Persoon — veld | Nu | Nodig | Status |
| --- | --- | --- | --- | --- |
| T-01 | Rutger Roelandts — Bio | twee alinea's, ingekorte eigen tekst uit `content/about.html` §1 (eerder op `/over-ons`), o.a. "Negentien jaar competitie" | akkoord van Rutger op de korte versie | te bevestigen |
| T-02 | Rutger Roelandts — Rol | "Oprichter" (volgt uit zijn eigen tekst) | bevestigen | te bevestigen |
| T-03 | Rutger Roelandts — Kwalificaties | niets vermeld | diploma's of opleidingen, enkel met bron | open |
| T-04 | Rutger Roelandts — Afbeelding | eigen foto, `public/images/team/rutger-roelandts-v1.webp` (4:5, aangeleverd door Toshoni op 20 okt 2026 via de mediabibliotheek, `npm run images:portrait`) | — | afgerond 2026-10-20 |
| T-13 | Algemene claim: `/aanbod` → blok *Hero* → **Ondertitel** ("uitsluitend met ervaren professionals"); `/ons-team` → *Hero* → **Ondertitel** en home → blok *Oproep* → **Tekst** ("ervaring en mensenkennis", Toshoni, 27 okt 2026; voorheen "de nodige diploma's" en op `/aanbod` "gediplomeerde") | aangeleverd door Toshoni | blijft algemeen; geen individuele diploma's noemen zonder bron | bevestigd |

## 5. Beelden: AI-gegenereerd, tijdelijk of leeg (B)

Drie gegenereerde sfeerbeelden van fictieve, algemene personen (herkomst en prompts:
[`editorial-images.md`](./editorial-images.md), manifest `src/lib/studio/editorial-images.json`).
Ze zijn **nooit** een portret van Rutger, Robin of Goran. Daarnaast laat de rollout twee
beeldvakken op `/bikefit` bewust leeg (B-04, B-05): daar toont de site het decoratieve vlak met
verloop en ring, zonder foto. De compacte paginakoppen (*Hero*, variant paginakop) tonen nooit
een beeld en staan hier daarom niet.

Vervangen kan op twee manieren:

1. **Per plaats in het CMS:** echte foto uploaden via `/admin` → **Media**, dan op elke plaats
   hieronder het veld **Afbeelding** (blok *Hero*, *Beeld + tekst* of *Dienst (aanbod)*) op die
   foto zetten, met Nederlandse alt-tekst, en publiceren.
2. **Alles in één keer:** `npm run images:import -- --slot <slot> --src <bestand> --version 2` en
   daarna de staging-rollout (`staging-runbook.md` §9). Dat vervangt het beeld op alle plaatsen.

| ID | Slot → bestand | Gebruikt op (pagina → blok → veld **Afbeelding**) | Nodig | Status |
| --- | --- | --- | --- | --- |
| B-01 | `flemish-cyclists` → `public/images/editorial/flemish-cyclists-v1.webp` | home → *Hero* ("Meer plezier."); `/bikefit` → *Beeld + tekst* "Waarom is een bikefit belangrijk?"; `/aanbod/lactaattest` → *Dienst (aanbod)* | echte foto van fietsers, beeldrechten en toestemming geregeld | open |
| B-02 | `bikefit-studio` → `public/images/editorial/bikefit-studio-v1.webp` | home → *Beeld + tekst* "Jij blijft het vertrekpunt"; `/bikefit` → *Beeld + tekst* "Meten om beter te kijken"; *Dienst (aanbod)* op `/aanbod/bikefit-nieuwe-fiets`, `/aanbod/bikefit-huidige-fiets`, `/aanbod/voetanalyse`, `/aanbod/zadelanalyse`, `/aanbod/afstellen-schoenplaatjes` | echte foto van een bikefit in de studio | open |
| B-03 | `junior-coaching` → `public/images/editorial/junior-coaching-v1.webp` | home → *Beeld + tekst* "Voor elke fietser"; `/aanbod/coaching` → *Dienst (aanbod)* (tot 20 okt 2026 ook `/voor-wie`, nu B-06) | echte foto, schriftelijke toestemming van ouders bij minderjarigen | open |
| B-04 | geen (leeg) | `/bikefit` → *Beeld + tekst* "Kan een bikefit ook bij mij thuis?" (donker, beeld links) | echte foto van een fit op locatie, of bewust leeg laten; hangt af van K-04 en G-07 | open |
| B-05 | geen (leeg) | `/bikefit` → *Beeld + tekst* "Kinderen groeien. De pasvorm groeit niet mee." (beeld rechts) | echte foto van een jonge fietser, schriftelijke toestemming van ouders; of B-03 hergebruiken | open |
| B-06 | `rutger-jeugd` → `public/images/editorial/rutger-jeugd-v1.webp` (echte foto, Toshoni, 20 okt 2026) | `/voor-wie` → *Beeld + tekst* "Jonge fietsers groeien" | — | afgerond 2026-10-20 |

## 6. Online boeken per dienst (K)

Plaats: **Beheer → Aanbod** → de dienst → *Rechtstreeks online boeken* (met per variant de duur in
de agenda, buffer, locatie, ouderregel en prijs) of *Enkel op aanvraag*; de boekingsdienst erachter
wordt bij het opslaan aangemaakt of bijgewerkt (geen apart scherm Diensten meer). Aanbieders
vinken zelf aan wat ze aanbieden (**Mijn agenda → Mijn aanbod**). Zonder aanbieder staat een online
te boeken aanbod grijs als "Tijdelijk niet online te boeken"; een aanbod op aanvraag toont een
aanvraagformulier op zijn pagina (naar de ontvanger uit **Beheer → E-mail**, C-02). Zie
[`booking-architecture.md`](./booking-architecture.md) §14. Een aanbod dat niet getoond wordt, is
ook niet boekbaar. Gezinspakket, Fit aan huis en Inspanningstest zijn op 17 okt 2026 op beslissing
van Toshoni **uitgezet** (gedeactiveerd door `cms:migrate-aanbod`, bestaande boekingen behouden hun
dienst; K-03, K-04).

| ID | Onderwerp | Nu | Nodig | Status |
| --- | --- | --- | --- | --- |
| K-01 | *Bikefit – huidige fiets* | gekoppeld aan de diensten `volwassenenfit` en `jeugdfit` (*Jeugdfit – eenmalig*), beide 2 uur. Sinds 16 okt 2026 toont `/afspraak` dit aanbod **één keer**, met daaronder "Voor wie?": **Volwassene** en **Jeugd – eenmalig** (het keuzelabel volgt het aanbod); de gekozen dienst bepaalt duur, beschikbaarheid en wat geboekt wordt; het formulier is voor elke fit hetzelfde, ook voor Jeugd (29 okt 2026) | bevestigen dat dit dezelfde dienst is | te bevestigen |
| K-02 | De andere acht diensten | op aanvraag: aanvraagformulier op de dienstpagina, niet online boekbaar; sinds 20 okt 2026 met prijs en (waar gegeven) duur | per dienst: aanbieder(s) die het zelf bevestigen (K-05); dan dienst aanmaken in **Beheer → Aanbod** op *Rechtstreeks online boeken* zetten | open |
| K-03 | Het aanbod *Inspanningstest* (adres `/aanbod/lactaattest`; tot 27 okt 2026 *Lactaattest*) vs. de bestaande dienst Inspanningstest | de dienst Inspanningstest is uitgezet (17 okt 2026); het aanbod blijft op aanvraag | als de inspanningstest online boekbaar moet worden: in **Beheer → Aanbod** op *Rechtstreeks online boeken* zetten met een echte duur | afgerond 2026-10-17 |
| K-04 | Bestaande diensten Gezinspakket, Fit aan huis (en Inspanningstest, K-03) | uitgezet op 17 okt 2026 (beslissing Toshoni: enkel wat in het aanbod stond blijft); niet meer op `/afspraak`; bestaande boekingen behouden hun dienst | niets; wie een van deze weer wil aanbieden, maakt een nieuw aanbod in **Beheer → Aanbod** | afgerond 2026-10-17 |
| K-05 | Aanbieders per dienst | ongewijzigd: enkel de bestaande aanbieder op de vijf oude diensten. Sinds 16 okt 2026 maakt een aanbieder geen diensten meer aan en past ze niet aan; hij of zij schrijft zich enkel in voor actieve diensten (**Mijn agenda** → **Mijn aanbod**, per aanbod en variant) | wie biedt welke nieuwe dienst aan, enkel door de persoon zelf bevestigd; een nieuwe dienst maakt een beheerder aan | open |
| K-06 | Prijzen in de boekingswidget | Volwassenenfit € 275 en Jeugdfit – eenmalig € 150, beide getoond (**Prijs tonen** aan), sinds 20 okt 2026 (`src/lib/booking/defaults.ts`; bestaande databank via `cms:patch-aanbod-prijzen`); onder *Bikefit – huidige fiets* toont de widget per keuze dat bedrag | — | afgerond 2026-10-20 |

## 7. Bestaande hiaten in aangeraakte inhoud (G)

| ID | Waar (exacte plaats) | Nu | Nodig | Status |
| --- | --- | --- | --- | --- |
| G-01 | Publiek e-mailadres: `/admin` → **Instellingen** → Contact → **E-mail** (footer, contactvraag bij niet-boekbare diensten); `/afspraak` → *Vrije tekst* "Voor je komt" → "Andere vraag?"; `/privacy` en `/algemene-voorwaarden` (tekst) | `info@debikefitstudio.be`, bevestigd door Toshoni (review 13 okt 2026); in de instellingen gezet door `cms:patch-page-cleanup` (staging) en door de seed/bootstrap; blok *Contact* op home laat zijn eigen veld **E-mail** leeg. Sinds 27 okt 2026 typt geen pagina het adres meer: de teksten zeggen `{{e-mail}}` (en `{{telefoon}}` voor het nummer) en volgen de instelling | — | bevestigd |
| G-02 | Adres van de studio: **Instellingen** → Contact → **Adresregels**, **Postcode** en **Gemeente** (footer, JSON-LD, voetteksten van de e-mails en de sectie *Locatie*); `/afspraak` → blok *Locatie* → **Opmerking onder het adres**; blok *Contact* → **Adresregels** op home (sinds 13 okt niet meer op `/afspraak`; `/contact` verwijst door naar `/afspraak`); `/admin` → **Locaties** → "De Bikefit Studio, Ninove" → **Adresregels** | Halsesteenweg 406 a, 9403 Neigem: straat en gemeente aangeleverd door Toshoni (27 okt 2026), de postcode uit zijn aanvraag is gecorrigeerd naar die van Neigem (9403), met de opmerking "Parking beschikbaar voor de deur." en een kaart die na toestemming in de cookiebanner of na een eigen klik laadt. In de code: `lib/studio/seed-content/location-section.ts` (waarden en blok) en `lib/booking/defaults.ts` (boekingslocatie). Een bestaande databank (staging, productie) krijgt de instellingen, de locatie en de sectie *Locatie* op `/afspraak` met `cms:patch-aanbod-correcties`. Het blok *Contact* op home toont het adres sinds 27 okt 2026 als token (`{{adres}}`, Adresregels), en de privacyverklaring noemt Google Maps (de kaart laadt na cookietoestemming of een klik op "Kaart tonen") | Toshoni de postcode 9403 laten bevestigen; na de patch nakijken: footer, adres op home en kaartpin op `/afspraak` | bevestigd |
| G-03 | `/afspraak` | "Vier manieren om te boeken" is op vraag van Toshoni verwijderd (review 13 okt 2026, `cms:patch-page-cleanup`); de pagina begint nu bij "Kies je moment" | — (de keuze in de widget zelf volgt K-02 – K-04) | afgerond 2026-10-13 |
| G-04 | `/veelgestelde-vragen` | het antwoord op "Hoe lang duurt een bikefit?" noemt geen uren meer, maar de pagina's van *Bikefit – huidige fiets* en *Bikefit – aankoop nieuwe fiets* (Toshoni, 27 okt 2026), zodat het de dienstpagina's niet meer kan tegenspreken | — | afgerond 2026-10-27 |
| G-05 | Korte verbindingszinnen: inleidingen van de groepen Bikefit/Begeleiding in blok *Aanbod (overzicht)* (home, `/aanbod`, `/bikefit`); sectietitels op home ("Wat we voor je doen"), `/voor-wie` ("Waar je ook staat", op vraag van Toshoni verwijderd op 13 okt 2026) en `/bikefit` ("Meten om beter te kijken", "Onze bikefitdiensten") | neutraal geschreven door de implementatie, zonder nieuwe claims | nagekeken en aanvaard door Winston (review 13 okt 2026), geen wijziging nodig | afgerond 2026-10-13 |
| G-06 | "nieuwste 3D-bewegingsanalyse": `/bikefit` en home → *Beeld + tekst* → **Alinea's**; `/aanbod/bikefit-huidige-fiets` → **Inhoud** | tekst aangeleverd door Toshoni; geen merk of toestel genoemd | merk of toestel enkel noemen met bron | bevestigd |
| G-07 | "bij jou thuis / op locatie": home → *Hero* → **Ondertitel**; `/aanbod` → *Hero* → **Ondertitel**; `/bikefit` → *Beeld + tekst* "Kan een bikefit ook bij mij thuis?" | tekst aangeleverd (hero, aanbod) of uit het prototype (`/bikefit`); belooft fits aan huis | na K-04 nakijken: wordt Fit aan huis uitgezet, dan deze zinnen aanpassen | te bevestigen |

## 8. Cadeaubon (C)

Sinds 13 oktober 2026 (vraag van Toshoni): `/aanbod` → groep **Overige** → kaart *Cadeaubon* →
`/cadeaubon` (tot 17 okt 2026 `/aanbod/cadeaubon`, nu een doorverwijzing), met een bestelformulier (bedrag naar keuze, persoonlijke boodschap,
contactgegevens). **Bestel nu** mailt de aanvraag naar de studio; factuur en betaallink maakt de
studio zelf op. Er is geen betaling, factuur, boncode of automatische mail naar de klant. Zolang
C-01 of C-02 open is, krijgt elke bezoeker "Je bestelling is niet verstuurd" met het
telefoonnummer, en blijft alles wat de bezoeker invulde staan. Uitleg en instellingen:
`docs/booking-runbook.md` § Cadeaubon.

| ID | Waar (exacte plaats) | Nu | Nodig | Status |
| --- | --- | --- | --- | --- |
| C-01 | E-mailverzending (Resend): **Beheer → E-mail** (`/admin/email`: API-sleutel en afzender), of de omgevingsvariabelen `RESEND_API_KEY` en `EMAIL_FROM` in Vercel (Arend; hebben voorrang) | niet ingesteld op staging en productie (preflight Arend, 13 okt 2026): elke bestelling meldt "niet verstuurd" | Resend-account, een afzenderdomein dat in Resend geverifieerd is (DNS), dan sleutel en afzender in `/admin/email` (of de variabelen) en een testbericht; de afzender is nooit het adres van de bezoeker | open |
| C-02 | Ontvanger van de bestellingen: **Beheer → E-mail** (`/admin/email`) → *Ontvanger bestellingen en aanvragen*, of omgevingsvariabele `GIFT_VOUCHER_RECIPIENT` (heeft voorrang). Bewust los van het publieke adres (G-01): geen automatische terugval op `info@debikefitstudio.be` | leeg: elke bestelling meldt "niet verstuurd". Het gevraagde publieke adres `info@debikefitstudio.be` blijft in footer en contacttekst; het domein gaf op 13 okt 2026 geen DNS (NXDOMAIN), dus mail daarheen zou niet aankomen | een werkende mailbox kiezen (Toshoni) en die in de instelling of de variabele zetten | open |
| C-03 | `/cadeaubon` (*Cadeaubon*) → blok *Cadeaubon (bestelformulier)* → **Inleiding**, **Korte omschrijving**, **Titel boven het formulier** | neutraal geschreven door de implementatie: bedrag en boodschap naar keuze, factuur en betaallink na de bestelling | nakijken door Toshoni | te bevestigen |
| C-04 | Voorwaarden van de bon: geldigheid, vorm (digitaal of op papier), levering, minimum- en maximumbedrag | nergens vermeld; het formulier aanvaardt technisch € 1 tot € 5.000 (daarboven: "bel ons best even") | beslissing van de studio; daarna in de **Inleiding** en zo nodig in de algemene voorwaarden | open |
