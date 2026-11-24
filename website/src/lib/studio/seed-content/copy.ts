/**
 * Verbatim copy of the 13 Oct 2026 redesign, supplied by Toshoni via Winston
 * (work block 2026-10-13-aanbod-staging-brief.md), and the team profiles.
 * Review of 19 Oct 2026 (Toshoni): the hero subtitle lost "dichtbij".
 * The junior text follows Toshoni's site review of the same day: "jeugd"
 * instead of "junioren", and the four youth categories named.
 * Review of 27 Oct 2026 (Toshoni): the team is chosen on "ervaring en
 * mensenkennis" (no diplomas, so the /aanbod intro says "ervaren professionals"),
 * the 3D-printed insoles are off the site, and sentences are no longer joined by
 * a dash (a comma or a colon does it).
 * Only Rutger has a source-backed bio (content/about.html §1); Robin and Goran
 * carry their name and team membership only. Plain data.
 */

import { teamPortrait } from '@/lib/studio/team-portraits';

export const HERO_SUBTITLE =
  'Van een fiets die beter past tot begeleiding die met je meegroeit. We luisteren naar jouw verhaal en helpen je op weg, in de studio of bij jou thuis.';

export const AANBOD_INTRO =
  'Elke fietser is anders. Daarom werkt De Bikefit Studio uitsluitend met ervaren professionals. Samen zoeken we wat bij jou past: van je eerste kilometers tot een nieuw sportief doel. Persoonlijke fietsbegeleiding, dichtbij: in de studio, op locatie of, waar mogelijk, bij jou thuis.';

export const JUNIOR_TEXT =
  'Jonge fietsers groeien. Hun fiets groeit niet vanzelf mee. Daarom besteden we extra aandacht aan de jeugd, met betaalbare begeleiding en opvolging op maat. Of je nu miniem, aspirant, nieuweling of junior bent, er blijft ruimte om te groeien, bij te leren en vooral graag te fietsen.';

export const MOTION_ANALYSIS_TEXT =
  'We gebruiken de nieuwste 3D-bewegingsanalyse om je houding en trapbeweging vanuit verschillende hoeken te bekijken. Die inzichten combineren we met jouw ervaring en de blik van onze fitter. Technologie helpt ons meten; jij blijft het vertrekpunt.';

/**
 * "Waarom is een bikefit belangrijk?" on `/bikefit` (prototype/bikefit.html, without dashes since
 * 27 Oct 2026): the page hero's text since the redesign of 24 Nov 2026, then the prose below it
 * with the lead line.
 */
export const WHY_BIKEFIT_TEXT =
  'Een fiets die niet bij jouw lichaam past, kost je op drie manieren: pijn, verloren kracht, en kortere ritten. Een bikefit lijnt de fiets uit op jou, niet omgekeerd, zodat elke rit beter voelt en je langer gezond blijft op de fiets.';
export const HOW_OFTEN_TEXT =
  'Voor de meeste volwassenen is dat om de 18 tot 24 maanden zinvol, of telkens als er iets verandert: een nieuwe fiets, een blessure, een grote verandering in gewicht of soepelheid, of een nieuw doel. Voor kinderen vaker: zij groeien, de pasvorm groeit niet mee.';
export const JUST_THE_RIDE_TEXT =
  'Geen pijn. Geen lichaam dat eerder opgeeft dan de weg. Geen fiets die tegen je vecht. Gewoon de rit.';

/**
 * The studio's own means, named by Toshoni on 19 Oct 2026 (register E-03, E-04).
 * On 27 Oct 2026 he had the 3D-printed insoles taken off the website; the
 * saddles stay.
 */
export const STUDIO_EXTRAS_TEXT =
  'In de studio kun je een ruime keuze aan zadels uittesten. Zo krijgt ook je zitvlak zijn juiste plaats.';

/**
 * How the team is chosen (Toshoni, 27 Oct 2026: experience and people skills,
 * no diplomas); also the body of the team band on the home page.
 */
export const TEAM_SELECTION_SENTENCE =
  'We kiezen ons team op ervaring en mensenkennis, en op de manier waarop iemand luistert.';

export const TEAM_INTRO = `Goede begeleiding begint bij de juiste mensen. ${TEAM_SELECTION_SENTENCE} Je krijgt een aanpak die bij jou past, met heldere uitleg en aandacht voor jouw doelen.`;

/**
 * Second bio line on an interim profile, so the card reads as unfinished on
 * purpose rather than as a finished one-line bio. No profile uses it since
 * 20 Oct 2026 (Robin and Goran left the page); kept for a future interim card.
 */
export const TEAM_PROFILE_PENDING = 'Een uitgebreid profiel volgt binnenkort.';

/**
 * Team members. Since 20 Oct 2026 (Toshoni) only Rutger: Robin Van Lierde and
 * Goran Van de Walle no longer appear on /ons-team. His bio is source-backed
 * (content/about.html §1); his portrait is his own photo, imported with
 * `scripts/team-portrait.mts` (initials while the file is not there).
 * Open fields: docs/content-placeholders.md, T-rows.
 */
export const TEAM_MEMBERS = [
  {
    name: 'Rutger Roelandts',
    role: 'Oprichter',
    bio: [
      'Ik zit op een fiets zolang ik me kan herinneren. Negentien jaar competitie, en een heel leven daarbuiten gewoon fietsen: naar school, naar het werk, het heuvelland in op zondag.',
      'Daarom heb ik De Bikefit Studio opgericht. Iedereen verdient het om te genieten van alles wat een fiets te bieden heeft. Mijn werk is ervoor te zorgen dat jouw fiets je dat ook toelaat.',
    ],
    image: teamPortrait('rutger-roelandts'),
    internalNote:
      'Register T-01–T-04. Bio: Rutgers eigen tekst uit content/about.html §1 (eerder gepubliceerd op /over-ons), ingekort; akkoord van Rutger nodig. Rol “Oprichter” volgt uit die tekst. Kwalificaties: niets vermeld. Foto: eigen foto, aangeleverd door Toshoni op 20 okt 2026 (public/images/team, zie docs/editorial-images.md).',
  },
];
