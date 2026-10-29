import type { SeedPage } from './shared';

/**
 * The privacy statement and the terms (`/privacy`, `/algemene-voorwaarden`): work block
 * 2026-09-24-legal-pages.md (verbatim + KBO substitutions), as Toshoni changed them since. Plain
 * data, no I/O. They lived in `scripts/cms-seed.mts` until 27 Oct 2026.
 *
 * Since 27 Oct 2026 the texts type none of the studio's facts: the company name, the registered
 * office, the enterprise number, the e-mail address and the phone number are copy tokens
 * (`{{bedrijf}}`, `{{zetel}}`, `{{kbo}}`, `{{e-mail}}`, `{{telefoon}}`, `{{telefoon-href}}`)
 * that the public site resolves from Instellingen at render time. The 48 hours of art. 6 are the
 * one number that stays: the policy itself, written where it is stated.
 */

/** Privacy §8 "Minderjarigen" (Toshoni, 29 Oct 2026): what a jeugdfit needs, no guardian rule. */
export const PRIVACY_MINORS_HTML =
  '<p>Voor een jeugdfit verwerken wij ook gegevens van jongeren onder 16: enkel wat nodig is om de afspraak te plannen en de fit uit te voeren.</p>';

/**
 * Privacyverklaring — work block 2026-09-24-legal-pages.md, page 1 (verbatim + KBO substitutions).
 * 20 Oct 2026 (Toshoni): commercial e-mail to customers is allowed, always with an unsubscribe
 * link (section 2 "Nieuws en aanbiedingen per e-mail", the retention and rights lines), the
 * experience question after an appointment is named, the phone number in the +32 format.
 * 29 Oct 2026 (Toshoni): no parent or guardian is asked for a jeugdfit any more (§2, §8).
 */
export const PRIVACY_HTML = `<p><em>Laatst bijgewerkt: 29 oktober 2026</em></p>

<h2>1. Wie zijn wij?</h2>
<p>De Bikefit Studio is een handelsnaam van <strong>{{bedrijf}}</strong>, met maatschappelijke zetel te {{zetel}}, ingeschreven in de Kruispuntbank van Ondernemingen onder het nummer <strong>{{kbo}}</strong> (RPR Brussel, Nederlandstalige afdeling). Wij zijn de verwerkingsverantwoordelijke voor de persoonsgegevens die je via deze website en bij een bikefit aan ons toevertrouwt.</p>
<p>Vragen over deze verklaring of over je gegevens? Mail naar <a href="mailto:{{e-mail}}">{{e-mail}}</a> of bel <a href="{{telefoon-href}}">{{telefoon}}</a>.</p>

<h2>2. Welke gegevens verwerken wij, en waarom?</h2>
<h3>Als je een afspraak maakt</h3>
<p>Via het afsprakenformulier of telefonisch verzamelen wij je naam, e-mailadres, telefoonnummer, de gekozen dienst, datum en tijdstip, en optioneel je leeftijd, gegevens over je fiets en een korte omschrijving van je klachten of doelen. Bij een fit aan huis vragen wij het adres waar de fit doorgaat.</p>
<p>Wij gebruiken deze gegevens om de afspraak vast te leggen, te bevestigen en voor te bereiden, om je te bereiken bij wijzigingen en om de dienst uit te voeren. Rechtsgrond: de uitvoering van de overeenkomst die je met ons sluit (art. 6.1.b AVG) en, voor de gegevens over je klachten of gezondheid, je uitdrukkelijke toestemming (art. 9.2.a AVG). Die omschrijving is vrijblijvend: laat het veld leeg als je liever niets deelt, dan bespreken we het ter plaatse.</p>
<h3>Agenda van de bikefitter</h3>
<p>Een afspraak wordt ingeschreven in de agenda van de bikefitter die de fit uitvoert. Daarvoor gebruiken wij Google Agenda (Google Ireland Ltd). In die agenda staan enkel de dienst, het tijdstip, je naam en de contactgegevens die nodig zijn om de afspraak uit te voeren.</p>
<h3>Bevestiging en herinneringen per e-mail</h3>
<p>Wij sturen je een bevestiging van je afspraak, een agenda-uitnodiging en, waar van toepassing, een herinnering, een annulatiebevestiging en na je afspraak een korte vraag naar je ervaring. Deze e-mails horen bij je afspraak. Wij versturen ze via Resend (Resend, Inc.).</p>
<h3>Nieuws en aanbiedingen per e-mail</h3>
<p>Ben je klant bij ons geweest, dan kunnen wij je af en toe een e-mail sturen over ons aanbod, nieuws uit de studio of een actie. Rechtsgrond: ons gerechtvaardigd belang om bestaande klanten te informeren over gelijkaardige diensten (art. 6.1.f AVG en art. XII.13 van het Wetboek van economisch recht). Ben je nog geen klant, dan vragen wij eerst je toestemming (art. 6.1.a AVG). Je kunt je op elk moment uitschrijven via de link onderaan elke e-mail of met een mailtje naar <a href="mailto:{{e-mail}}">{{e-mail}}</a>; daarna sturen wij je geen commerciële e-mails meer. Bevestigingen en herinneringen van je afspraken blijven wel komen, want die horen bij je afspraak.</p>
<h3>Facturatie en boekhouding</h3>
<p>Als wij een factuur opmaken, verwerken wij de gegevens die daarvoor wettelijk verplicht zijn. Rechtsgrond: een wettelijke verplichting (art. 6.1.c AVG).</p>
<h3>Technische gegevens en beveiliging</h3>
<p>Onze servers registreren kortstondig technische gegevens zoals je IP-adres en het tijdstip van een aanvraag, om misbruik van het afsprakenformulier te voorkomen en de website veilig te houden. Rechtsgrond: ons gerechtvaardigd belang bij een veilige, werkende website (art. 6.1.f AVG).</p>
<h3>Statistieken</h3>
<p>Enkel als je daarvoor toestemming geeft via de cookiebanner, gebruiken wij Google Analytics 4 om te zien hoe de website gebruikt wordt (bezochte pagina’s, herkomst van bezoekers, gebruikt toestel). IP-adressen worden daarbij geanonimiseerd. Rechtsgrond: je toestemming (art. 6.1.a AVG), die je op elk moment kunt intrekken via de link “Cookies” onderaan de website.</p>
<h3>Kaart op de afspraakpagina</h3>
<p>Op de afspraakpagina kun je een kaart van Google Maps tonen die laat zien waar de studio ligt. De kaart laadt pas nadat je op “Kaart tonen” klikt. Dan ontvangt Google (Google Ireland Ltd) je IP-adres en kan Google cookies plaatsen. Klik je niet, dan wordt er niets van Google geladen. Rechtsgrond: je toestemming (art. 6.1.a AVG), die je geeft door op de knop te klikken.</p>

<h2>3. Hoe lang bewaren wij je gegevens?</h2>
<ul>
<li>Afspraak- en contactgegevens: tot drie jaar na je laatste afspraak, zodat wij je bij een volgende fit verder kunnen helpen. Daarna verwijderen of anonimiseren wij ze.</li>
<li>Omschrijving van klachten of doelen: tot drie jaar na je laatste afspraak, of eerder als je erom vraagt.</li>
<li>Facturen en boekhoudkundige stukken: de wettelijke bewaartermijn (tot tien jaar).</li>
<li>Je uitschrijving voor commerciële e-mails: zolang nodig om ze te respecteren.</li>
<li>Technische logbestanden: maximaal dertig dagen.</li>
<li>Statistieken (Google Analytics): maximaal veertien maanden.</li>
</ul>

<h2>4. Met wie delen wij je gegevens?</h2>
<p>Wij verkopen je gegevens nooit. Wij delen ze enkel met leveranciers die ons helpen om de website en de afspraken te laten werken, en die enkel in onze opdracht handelen:</p>
<ul>
<li><strong>Vercel Inc.</strong>: hosting van de website (Verenigde Staten; deelnemer aan het EU-VS Data Privacy Framework).</li>
<li><strong>Neon Inc.</strong>: databank waarin afspraken bewaard worden (servers in Frankfurt, Europese Unie).</li>
<li><strong>Google Ireland Ltd.</strong>: Google Agenda van de bikefitter en, na toestemming, Google Analytics en de kaart van Google Maps.</li>
<li><strong>Resend, Inc.</strong>: verzenden van onze e-mails, zoals bevestigingen, herinneringen, de vraag naar je ervaring en nieuws of aanbiedingen (Verenigde Staten; standaardcontractbepalingen van de Europese Commissie).</li>
</ul>
<p>Wanneer gegevens buiten de Europese Economische Ruimte terechtkomen, gebeurt dat op basis van een adequaatheidsbesluit van de Europese Commissie of van standaardcontractbepalingen. Wij geven je gegevens verder enkel door als een wet ons daartoe verplicht.</p>

<h2>5. Cookies</h2>
<p>Deze website gebruikt zo weinig mogelijk cookies:</p>
<ul>
<li><strong>cms_consent</strong>: onthoudt je keuze in de cookiebanner (twaalf maanden). Noodzakelijk.</li>
<li><strong>cms_session</strong>: enkel voor medewerkers die inloggen op het beheergedeelte (veertien dagen). Noodzakelijk.</li>
<li><strong>_ga, _ga_*</strong>: Google Analytics, enkel na jouw toestemming (maximaal veertien maanden). Statistisch.</li>
</ul>
<p>Zonder toestemming plaatsen wij geen statistische cookies en laden wij geen script van Google Analytics. Je keuze kun je altijd aanpassen via de link “Cookies” onderaan elke pagina.</p>

<h2>6. Jouw rechten</h2>
<p>Je hebt het recht om je gegevens in te kijken, te laten verbeteren of te laten wissen, om de verwerking te laten beperken, om bezwaar te maken tegen een verwerking op basis van ons gerechtvaardigd belang, en om je gegevens in een gangbaar bestandsformaat te ontvangen. Toestemming die je gaf, kun je op elk moment intrekken; dat verandert niets aan de rechtmatigheid van wat ervoor gebeurde. Tegen commerciële e-mails kun je altijd bezwaar maken: uitschrijven via de link in de e-mail volstaat.</p>
<p>Mail je vraag naar <a href="mailto:{{e-mail}}">{{e-mail}}</a>. Wij antwoorden binnen een maand. Om zeker te zijn dat wij met de juiste persoon spreken, kunnen wij je vragen om je identiteit te bevestigen.</p>
<p>Ben je niet tevreden met hoe wij met je gegevens omgaan? Dan kun je een klacht indienen bij de Gegevensbeschermingsautoriteit, Drukpersstraat 35, 1000 Brussel, <a href="https://www.gegevensbeschermingsautoriteit.be" rel="noopener">www.gegevensbeschermingsautoriteit.be</a>, <a href="mailto:contact@apd-gba.be">contact@apd-gba.be</a>.</p>

<h2>7. Beveiliging</h2>
<p>Wij beveiligen je gegevens met versleutelde verbindingen (HTTPS), versleutelde opslag van toegangssleutels, beperkte toegang voor medewerkers en logging van wijzigingen in het beheergedeelte. Geen enkel systeem is volledig waterdicht; als er toch iets misgaat met je gegevens, brengen wij jou en, waar nodig, de Gegevensbeschermingsautoriteit op de hoogte zoals de wet dat voorschrijft.</p>

<h2>8. Minderjarigen</h2>
${PRIVACY_MINORS_HTML}

<h2>9. Wijzigingen</h2>
<p>Wij passen deze verklaring aan wanneer onze werking of de wetgeving verandert. De datum bovenaan zegt wanneer dat voor het laatst gebeurde. Belangrijke wijzigingen kondigen wij aan op deze pagina.</p>`;

/** Art. 14 says the version of the booking day applies, so a change to the terms bumps this line. */
export const TERMS_VERSION_HTML = '<p><em>Versie van 29 oktober 2026</em></p>';

/**
 * Art. 3, first paragraph. The heading and the second paragraph (inspanningsverbintenis) stay
 * as they were. Toshoni, 27 Oct 2026: "make more generic, no need to define the exact diensten".
 */
export const TERMS_ART_3_SERVICES_HTML =
  '<p>Wij bieden bikefits aan, met de bijhorende analyses, tests en coaching. Wat wij precies aanbieden en wat elke dienst inhoudt, staat op onze website. Voor jouw afspraak geldt de omschrijving zoals die op de website stond op het moment dat je je afspraak maakte. Onze diensten zijn <strong>geen medische behandeling en vervangen geen doktersbezoek</strong>. Bij pijn, letsels of medische vragen raadpleeg je een arts of kinesitherapeut. Een test waarbij je een inspanning levert, voer je uit op eigen verantwoordelijkheid; je bevestigt vooraf dat je gezond genoeg bent om een inspanning te leveren en meldt ons relevante medische aandoeningen.</p>';

/**
 * Algemene voorwaarden — work block 2026-09-24-legal-pages.md, page 2 (verbatim + KBO
 * substitutions); art. 3 generic since 27 Oct 2026 (Toshoni, `corrections-2026-10-27.ts`);
 * art. 8 without the bullet on minors and a parent or guardian since 29 Oct 2026 (Toshoni).
 */
export const TERMS_HTML = `${TERMS_VERSION_HTML}

<h2>Artikel 1: Wie wij zijn</h2>
<p>Deze algemene voorwaarden gelden voor alle diensten van <strong>{{bedrijf}}</strong>, handelend onder de naam De Bikefit Studio, met maatschappelijke zetel te {{zetel}}, KBO/btw-nummer {{kbo}}, RPR Brussel, Nederlandstalige afdeling, bereikbaar via <a href="mailto:{{e-mail}}">{{e-mail}}</a> en <a href="{{telefoon-href}}">{{telefoon}}</a>. Hierna “wij”. De klant die een dienst boekt, hierna “jij”.</p>

<h2>Artikel 2: Toepassing</h2>
<p>Door een afspraak te maken via onze website, per e-mail of telefonisch, aanvaard je deze voorwaarden. Afwijkingen gelden enkel als wij ze schriftelijk bevestigen. Als een bepaling ongeldig zou zijn, blijven de andere bepalingen gelden.</p>

<h2>Artikel 3: Onze diensten</h2>
${TERMS_ART_3_SERVICES_HTML}
<p>Wij verbinden ons tot een zorgvuldige uitvoering naar best vermogen (inspanningsverbintenis). Een specifiek resultaat, zoals het verdwijnen van klachten of een bepaalde prestatie, kunnen wij niet garanderen.</p>

<h2>Artikel 4: Afspraken en bevestiging</h2>
<p>Een afspraak komt tot stand zodra wij ze bevestigen, per e-mail of mondeling. Bij een online boeking ontvang je een bevestiging per e-mail met datum, tijdstip, locatie en een link om te annuleren. Controleer die gegevens en verwittig ons bij een vergissing. Wij mogen een boeking weigeren of een voorgesteld tijdstip aanpassen, bijvoorbeeld bij overboeking of overmacht; in dat geval stellen wij een nieuw moment voor of betaal je niets.</p>

<h2>Artikel 5: Prijzen en betaling</h2>
<p>Onze prijzen worden meegedeeld voor de afspraak en zijn, tenzij anders vermeld, uitgedrukt in euro en inclusief btw. De prijs geldt voor de dienst zoals afgesproken; extra werk of onderdelen worden vooraf besproken en apart aangerekend. Betaling gebeurt na de dienst, ter plaatse of via factuur binnen veertien dagen na factuurdatum. Bij laattijdige betaling zijn van rechtswege en na ingebrekestelling de wettelijke interesten en een forfaitaire schadevergoeding verschuldigd binnen de grenzen van boek XIX van het Wetboek van economisch recht.</p>

<h2>Artikel 6: Annuleren en verplaatsen</h2>
<ul>
<li>Je kunt een afspraak kosteloos annuleren of verplaatsen tot <strong>48 uur</strong> voor het afgesproken tijdstip, via de link in je bevestigingsmail of telefonisch.</li>
<li>Annuleer je later, of kom je niet opdagen, dan mogen wij een vergoeding van 50% van de prijs van de geboekte dienst aanrekenen, omdat de gereserveerde tijd niet meer aan iemand anders gegeven kan worden.</li>
<li>Kom je te laat, dan proberen wij de fit binnen de resterende tijd uit te voeren; de volledige prijs blijft verschuldigd.</li>
<li>Moeten wij zelf annuleren (ziekte, overmacht), dan verwittigen wij je zo snel mogelijk en stellen wij een nieuwe datum voor. Je betaalt nooit voor een dienst die niet is uitgevoerd.</li>
</ul>

<h2>Artikel 7: Herroepingsrecht</h2>
<p>Bij een boeking op afstand (via de website) heb je als consument in principe veertien dagen om de overeenkomst te herroepen. Voor diensten met betrekking tot vrijetijdsbesteding waarvoor een bepaalde datum of periode van uitvoering is afgesproken, geldt dat recht niet (art. VI.53, 12° van het Wetboek van economisch recht). Voor een afspraak op een vast tijdstip gelden daarom de annuleringsregels van artikel 6.</p>

<h2>Artikel 8: Wat wij van jou verwachten</h2>
<ul>
<li>Je geeft ons juiste en volledige gegevens en meldt vooraf klachten, letsels of beperkingen die voor de fit of de test van belang zijn.</li>
<li>Je brengt je fiets in goede en veilige staat mee, samen met je fietskledij, schoenen en pedalen. Aanpassingen aan je fiets gebeuren in overleg; je blijft eigenaar en verantwoordelijk voor je fiets en materiaal.</li>
</ul>

<h2>Artikel 9: Aansprakelijkheid</h2>
<p>Wij zijn enkel aansprakelijk voor schade die het rechtstreekse gevolg is van een fout van onze kant, en, behalve bij opzet of zware fout, beperkt tot het bedrag dat je voor de betrokken dienst betaalde. Wij zijn niet aansprakelijk voor indirecte schade, voor schade die voortvloeit uit onjuiste of onvolledige informatie die je ons gaf, uit gebreken aan je fiets of materiaal, of uit het niet opvolgen van ons advies. Niets in dit artikel beperkt onze aansprakelijkheid voor lichamelijke schade of voor wat wettelijk niet uitgesloten kan worden.</p>

<h2>Artikel 10: Intellectuele eigendom</h2>
<p>Meetgegevens, fitrapporten, foto’s en video’s die wij tijdens een fit maken, mag je vrij gebruiken voor persoonlijke doeleinden. Onze methodes, teksten en beeldmateriaal op de website blijven onze eigendom en mogen niet zonder toestemming worden overgenomen.</p>

<h2>Artikel 11: Privacy</h2>
<p>Hoe wij met je persoonsgegevens omgaan, lees je in onze <a href="/privacy">privacyverklaring</a>. Door te boeken bevestig je dat je ze gelezen hebt.</p>

<h2>Artikel 12: Klachten</h2>
<p>Niet tevreden? Laat het ons zo snel mogelijk weten via <a href="mailto:{{e-mail}}">{{e-mail}}</a>, bij voorkeur binnen acht dagen na de dienst, dan zoeken wij samen een oplossing. Kom je er met ons niet uit, dan kun je als consument terecht bij de Consumentenombudsdienst, North Gate II, Koning Albert II-laan 8 bus 1, 1000 Brussel, <a href="https://consumentenombudsdienst.be" rel="noopener">consumentenombudsdienst.be</a>.</p>

<h2>Artikel 13: Toepasselijk recht en bevoegde rechtbank</h2>
<p>Op onze overeenkomsten is het Belgische recht van toepassing. Geschillen worden voorgelegd aan de rechtbanken van het gerechtelijk arrondissement waar onze maatschappelijke zetel gevestigd is, onverminderd de dwingende regels die voor consumenten een andere bevoegde rechtbank aanwijzen.</p>

<h2>Artikel 14: Wijzigingen</h2>
<p>Wij kunnen deze voorwaarden aanpassen. De versie die geldt, is die welke op de website stond op het moment dat je je afspraak maakte.</p>`;

export const PRIVACY_PAGE: SeedPage = {
  slug: 'privacy',
  title: 'Privacyverklaring',
  translationGroup: 'privacy',
  source: 'work block 2026-09-24-legal-pages.md page 1',
  metaTitle: 'Privacyverklaring',
  metaDescription:
    'Hoe De Bikefit Studio ({{bedrijf}}) je gegevens verwerkt als je een afspraak maakt, welke cookies we gebruiken en welke rechten je hebt.',
  structuredDataType: 'WebPage',
  blocks: [
    {
      type: 'hero',
      data: {
        variant: 'pageHead',
        eyebrow: 'Juridisch',
        title: 'Privacyverklaring',
        titleEmphasis: '',
        subtitle:
          'Welke gegevens we verwerken als je een afspraak maakt of deze website bezoekt, waarom, hoe lang we ze bewaren en welke rechten je hebt.',
        primaryCta: null,
        secondaryCta: null,
      },
    },
    {
      type: 'richText',
      data: { variant: 'default', eyebrow: '', title: '', html: PRIVACY_HTML },
    },
  ],
};

export const TERMS_PAGE: SeedPage = {
  slug: 'algemene-voorwaarden',
  title: 'Algemene voorwaarden',
  translationGroup: 'terms',
  source: 'work block 2026-09-24-legal-pages.md page 2',
  metaTitle: 'Algemene voorwaarden',
  metaDescription:
    'Algemene voorwaarden van De Bikefit Studio ({{bedrijf}}): afspraken, betaling, kosteloos annuleren, aansprakelijkheid en klachten.',
  structuredDataType: 'WebPage',
  blocks: [
    {
      type: 'hero',
      data: {
        variant: 'pageHead',
        eyebrow: 'Juridisch',
        title: 'Algemene voorwaarden',
        titleEmphasis: '',
        subtitle:
          'Wat je van ons mag verwachten, en wat wij van jou verwachten, wanneer je een bikefit of inspanningstest boekt.',
        primaryCta: null,
        secondaryCta: null,
      },
    },
    {
      type: 'richText',
      data: { variant: 'default', eyebrow: '', title: '', html: TERMS_HTML },
    },
  ],
};
