# Urenregistratie — bedrijfsomgeving (pilot)

Losstaande ontwikkelversie. De bestaande website en Worker in `/server` blijven ongewijzigd. Gebruik uitsluitend fictieve pilotgegevens tot live- en beveiligingsacceptatie. **Niet het bestaande STACK-moederbestand vervangen.**

## Concrete testomgeving (bestaande D1)

De lege database `testdatabase` is al aangemaakt. De verbindingsconfiguratie staat in `team/server/wrangler.toml`; hierin staan geen geheimen. De Worker dient uitsluitend de pilotfrontend als statische assets en gebruikt een afzonderlijke D1-binding. De oude Worker en website blijven intact.

Vanaf de repository-root, op branch `ontwikkeling/multi-bedrijf`:

```sh
cd team/server
npx wrangler login
node prepare-assets.mjs
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
npx wrangler secret put SETUP_KEY
npx wrangler secret put STORAGE_KEY
```

De verwachte Worker-naam is `urenregistratie-team-test`. De URL wordt door Wrangler bevestigd; bij een andere accountsubdomeinnaam moet APP_ORIGIN worden aangepast. Genereer de geheimen lokaal, bijvoorbeeld met een wachtwoordmanager (SETUP_KEY) en `openssl rand -base64 32` (STORAGE_KEY). Deel ze niet en publiceer ze niet. Gebruik de link naar de Worker zelf om de pilot te openen: de frontend staat op /team/. Test uitsluitend met fictieve gegevens.

Voor Workers Builds: selecteer de ontwikkelbranch, root directory /team/server, build command `node prepare-assets.mjs`, deploy command `npx wrangler deploy`. Initialiseer D1 eerst via de hierboven beschreven migratie, met een geautoriseerde Wrangler-login. Zet de twee secrets bij runtimevariabelen van de afzonderlijke Worker. Schakel preview builds uit.

## Functies

- Eén webapp, gescheiden bedrijfsomgevingen (bedrijfscode + e-mail + wachtwoord), zelfstandige of bedrijf. De installatiecode is alleen voor beheerders in de pilot; publieke zelfregistratie met e-mailbevestiging is geïmplementeerd, maar op de testdatabase uitgeschakeld. Eigenaar nodigt medewerkers uit met een eenmalige code (48 uur), medewerkers kiezen zelf een wachtwoord. Rollen eigenaar, administratie en medewerker. Deactiveren beëindigt sessies.
- Medewerker ziet eigen registraties en gedeelde projectlijst zonder tarieven; eigenaar/administratie zien teamregistraties, projecttotalen en declaraties. Eigenaar beheert bedrijfsnaam, logo, tarieven, activiteiten en opslag. Agenda hergebruikt huidige kalender en sleepselectie. Tijden optioneel, kilometers per medewerker, PDOK/OSRM routeberekening op aanvraag (indicatief, geen beschikbaarheidsgarantie).
- Per registratie een aparte databaserij; wijzigingen gebruiken eigen revisienummer. Declaraties per project, gedeeltelijke uren, vast bedrag of percentage en handmatig bedrag. SQL-triggers en één atomaire batch voorkomen dubbele allocatie. Concepten kunnen worden vervallen of verzonden gemarkeerd. Conceptdeclaraties zijn geen btw-facturen.
- Eigen STACK WebDAV-map per bedrijf, aparte gebruikersnaam en toegangstoken; versleuteld in D1 met AES-GCM en aparte Workers secret. Alleen expliciet ondersteunde STACK-hostnamen; andere WebDAV-aanbieders vragen een aparte integratie en SSRF-controle. Excel-export en op verzoek een back-up met unieke naam (geen overschrijven). D1 blijft de leidende opslag. Nog geen geplande automatische exports of herstelwizard.
- Sessietoken alleen in sessionStorage; server bewaart hash, vervalt na 12 uur. PBKDF2-SHA256 (100.000 iteraties; Workers-limiet), unieke salts, loginlimieten per IP/account, exacte CORS-origins. Tenant- en rolcontrole server-side. E-mailbevestiging voor nieuwe bedrijven is geïmplementeerd en wordt pas actief na inrichting van de maildienst en productieopslag. Wachtwoordherstel en MFA zijn nog niet geïmplementeerd. Voor productie: account recovery, sterkere authenticatie/MFA, Cloudflare rate limiting, D1 Time Travel/herstelproef, beoordeling privacy/verwerkersafspraken, limieten/paginering en security review.

## Voor een nieuwe Cloudflare testomgeving

1. Clone deze branch, ga naar `team/server`. Gebruik een apart Worker-project `urenregistratie-team-test`, **niet** `urenregistratie`.
2. Log in met Wrangler (`npx wrangler login`) en maak een aparte D1 database: `npx wrangler d1 create urenregistratie-team-test` (als gevraagd, configuratie niet automatisch wijzigen). Kopieer `wrangler.toml.example` naar `wrangler.toml` en vul de geretourneerde database-ID in. Voeg alleen de exacte origin van de testfrontend toe. Zet geen secrets in het bestand. De lokale config mag niet naar GitHub.
3. Initialiseer de lege testdatabase: `npx wrangler d1 execute urenregistratie-team-test --remote --file=schema.sql`.
4. Publiceer de aparte Worker: `npx wrangler deploy`. Stel geheimen rechtstreeks in met `npx wrangler secret put SETUP_KEY` en `npx wrangler secret put STORAGE_KEY`. Gebruik een willekeurige installatiecode van minimaal 32 tekens en een base64-representatie van exact 32 willekeurige bytes voor STORAGE_KEY. Bewaar deze sleutel veilig; verlies maakt opgeslagen STACK-tokens onleesbaar. Deel de installatiecode alleen met de platformbeheerder. Verwijder/wijzig deze na provisioning naar behoefte.
5. Host de branch op een aparte preview-website (de root bevat de gedeelde agenda-assets; nieuwe frontend staat onder `team/`). Configureer de daadwerkelijke preview-origin in APP_ORIGIN. Gebruik in het inlogscherm het nieuwe `workers.dev` adres. Maak twee fictieve bedrijven aan en test drie medewerkers. Voor lokaal browsergebruik is een tijdelijke HTTPS-origin nodig, of een expliciete wijziging voor lokale test-HTTP; endpoint-validatie accepteert uitsluitend HTTPS workers.dev. 
6. Test eigen STACK-map met een *apart* testtoken. Maak een Excel-export en controleer de unieke back-up. Het oude Excel-bestand wordt niet ingelezen of veranderd.

## Tests

Vanaf de repository-root met Node 22: `node --test team/tests/team.test.mjs`. Tests draaien de echte serverqueries en triggers op een SQLite-adapter met synthetische gegevens en nagebootste WebDAV. Dit verifieert niet live D1, Worker-limieten, de browserinterface of werkelijke STACK. Controleer de acceptatie in de echte testomgeving na deployment. 

## Migratie en productie

Import en reconciliatie van bestaande LA-jaarbestanden (inclusief oude declaratiestatus, oorspronkelijke brongegevens, mutatielog en kilometerdetails) zijn **nog niet geïmplementeerd**. Een migratie moet eerst op een kopie worden gerepeteerd en totalen/allocaties per project en jaar vergelijken. De teamversie heeft basisritvelden maar nog niet alle uitgebreide ritvelden uit de bestaande app. Huidige zzp-versie blijft afzonderlijk bruikbaar totdat dit is afgerond. Geen automatische overstap of kopie van echte gegevens. Andere opslagdiensten en automatische Excel-back-ups zijn vervolgwerk. De teamversie is nog niet geschikt voor productie.
## Routeberekening (pilot)

Postcodes worden via PDOK opgezocht. Voor licht testgebruik wordt de directe OSRM-car-route op routing.openstreetmap.de gebruikt, zonder redirects. Houd rekening met de gebruiksvoorwaarden, maximaal één verzoek per seconde en geen zwaar gebruik; voor structureel bedrijfsgebruik is een eigen of contractueel geschikte routevoorziening nodig. Optioneel kan de runtime-secret `ORS_API_KEY` worden ingesteld om OpenRouteService in plaats van OSRM te gebruiken. Er wordt een indicatieve enkele reis berekend; de UI verdubbelt die bij Retourrit. Bij netwerk- of providerfouten blijven eerder ingevulde kilometers intact en is handmatige invoer mogelijk. Externe diensten ontvangen alleen de benodigde postcodes (PDOK) respectievelijk coördinaten (routeplanner), geen STACK- of gebruikersgegevens.

De pilot gebruikt bij een mislukte PDOK-zoekopdracht als tweede postcodebron gratis-postcodedata.nl (alleen volledige exacte NL-postcodes; bij meer straten gemiddeld straatmiddelpunt). De afstanden blijven indicatief. De postcodebron ontvangt alleen de opgezochte postcode. De OSRM-demodienst is uitsluitend voor licht, niet-commercieel testgebruik; gebruik voor productie een geschikte commerciële of eigen routevoorziening. De browser- en API-tests gebruiken uitsluitend fictieve gegevens en nagebootste routeproviders.

## Dashboard

Na aanmelden opent het overzicht. Filter de kerncijfers en projectkaarten op medewerker en maand of heel jaar; de grafiek toont steeds het geselecteerde jaar. Open een projectkaart voor activiteitentotalen, recente registraties en snelle invoer. Open uren zijn geregistreerde minuten minus de toegewezen declaratieminuten (inclusief concepten); verzonden declaraties zijn geen betaalstatus. Financiële bedragen blijven beperkt tot managers en bij teammodus het bedrijfsbrede overzicht. De sectie ‘Meer’ bevat kilometers, medewerkers en instellingen; het uitgebreide overzicht bevat de maandtabel en export. Er is geen wijziging aan D1-schema of oorspronkelijke STACK-versie. De bedrijfsversie bevat nog geen klantenadministratie, uitgaven of betaalstatus; die bedragen worden daarom niet geschat.

## Optionele modules

De eigenaar schakelt klantenbeheer, projectbudgetten en budgetwaarschuwingen afzonderlijk in onder Instellingen. Budgetwaarschuwingen vereisen budgetten; ze signaleren vanaf 80%. Budgetten zijn bedrijfsbreed, levensduur van het project, exclusief btw; euroverbruik is een schatting op basis van alle geregistreerde uren maal het huidige project- of standaardtarief (geen historische tariefadministratie). Alleen managers zien klantcontacten en budgetten. Uitschakelen verwijdert geen gegevens. Iedereen kan zelfstandig stopwatch, herhalen en donkere modus aanzetten; voorkeuren staan in D1. Stopwatch bewaart de verstreken tijd op dit apparaat per account, pauzeert bij registratievoorstel, en wordt pas gewist na opslaan of expliciet wissen. Herhalen maakt een nieuwe, nog niet opgeslagen registratie voor vandaag met project, activiteit, beschrijving en duur; kilometers en tijden worden niet gekopieerd. Migratie 0002 is additief en wordt indien nodig automatisch geïnitialiseerd na geauthenticeerd opvragen van data. Facturen, onkosten, herkenning en betaalstatus zijn niet toegevoegd.

Bij een stopwatchregistratie met een kortere duur blijft een resterende volle minuut of meer beschikbaar voor een volgende registratie. Een stopwatch die langer dan 24 uur loopt kan in delen worden afgeboekt. De invoer blijft altijd ter bevestiging openstaan.

Donkere modus gebruikt een gedeeld kleurenpalet voor invulvelden, native keuzelijsten, menu's, kalenderblokken, hover- en focusstatussen. De browsertest meet berekende achtergrondhelderheid en tekstcontrast in de echte interface (minimaal 4,5:1 voor de gecontroleerde actieve elementen), inclusief kalenderfilters in lichte en donkere modus.

## GitHub Pages bedrijfsomgeving

De nieuwe frontend wordt op `https://mlemson.github.io/urenregistratie/bedrijfsomgeving/` gepubliceerd, naast de bestaande zelfstandige STACK-frontend op `/urenregistratie/`. Hier wordt het team-API-adres automatisch ingevuld; gebruikers zien alleen bedrijfscode, e-mailadres en wachtwoord. De Worker-variabele `APP_ORIGIN` bevat daarom expliciet de Workers-origin en `https://mlemson.github.io` (zonder pad); geen wildcard. Er worden geen geheimen aan GitHub toegevoegd. De onderliggende D1-database is voorlopig nog de bestaande *testdatabase*; dit is dus nog geen migratie van de oorspronkelijke STACK-administratie en geen volledig losstaande productiebackend.


## Zelfregistratie met e-mailbevestiging

De website heeft een aanmeldscherm op https://boekuur.nl/bedrijfsomgeving/?start=bedrijf. Bij aanmelden wordt alleen een tijdelijke aanvraag vastgelegd. Een mail met een eenmalige verificatielink (24 uur geldig) gaat naar het opgegeven adres. Pas bij het openen en bevestigen van die link maakt de Worker atomair een eigen bedrijf, een eigenaar en standaardactiviteiten aan. Vóór de bevestiging kan niemand met deze gegevens inloggen.

De gegevens staan in een D1-database met bedrijfsafscherming per company_id en rol. Een bedrijfsomgeving is een eigen logische administratie, niet een eigen fysiek D1-bestand. Het bestaande STACK-moederbestand en de oorspronkelijke Worker worden niet gewijzigd. De test-Worker is bewust gesloten voor publieke aanmeldingen.

### Productie-inrichting (niet op de huidige testdatabase)

1. Maak in Cloudflare een aparte, lege D1-productiedatabase met naam boekuur-production. Gebruik niet de testdatabase. Maak vervolgens een back-up-/herstelbeleid en controleer de D1-herstelprocedure.
2. Maak uit team/server/wrangler.production.example.toml een eigen configuratie team/server/wrangler.production.toml. Vul de nieuwe D1-ID en exacte toegestane HTTPS-domeinen in; houd PUBLIC_SIGNUP_ENABLED op false. Voeg de productieconfiguratie met echte database-ID niet automatisch toe aan GitHub.
3. Pas de drie D1-migraties toe in volgorde (0001_initial, 0002_optional_modules, 0003_public_signup), bijvoorbeeld vanuit team/server met: npx wrangler d1 migrations apply boekuur-production --remote --config wrangler.production.toml.
4. Verifieer het verzenddomein boekuur.nl bij Resend met de opgegeven DNS-records. Controleer bestaande mailinstellingen zodat ontvangst niet onbedoeld wijzigt. Maak een verzend-API-sleutel. Zet die uitsluitend in een versleutelde Worker secret met: npx wrangler secret put RESEND_API_KEY --config wrangler.production.toml. Plaats geen sleutels in GitHub of browsercode.
5. Stel MAIL_FROM in op een door de maildienst goedgekeurd adres en VERIFY_URL op het HTTPS-verificatieadres https://boekuur.nl/bedrijfsomgeving/verifieren.html. Geef de productie-Worker een unieke naam en laat de frontend naar die Worker verwijzen in GITHUB_API, en in de connect-src CSP van de verificatiepagina. Controleer vooraf de exacte API-domeinen.
6. Leg ook een afzonderlijke veilige STORAGE_KEY vast voor versleutelde bedrijfsback-upinstellingen. Test met fictieve accounts registratie, afwijzing vóór verificatie, verlopen en hergebruikte links, meerdere bedrijven en afzonderlijke projecten, verzendfouten, declaratiecorrecties en een D1-herstelproef. Activeer pas daarna PUBLIC_SIGNUP_ENABLED=true op de productie-Worker. Laat de pilot op false.
7. Voordat onbekende derden massaal aanmelden: Cloudflare Turnstile/botbescherming, wachtwoordherstel, MFA voor beheerders, retentie/privacyafspraken en monitoring/limieten zijn nog noodzakelijke productierandvoorwaarden.

### Technische waarborgen

- Aanmelden werkt uitsluitend wanneer de featureflag true is en de maildienst, afzender en verificatie-URL zijn ingesteld.
- Nieuwe bedrijven staan tot verificatie uitsluitend in de tijdelijke tabel pending_signups. Alleen SHA-256-hashes van tokens worden opgeslagen; het wachtwoord wordt PBKDF2-gehasht.
- Na 24 uur of na het voltooien van de verificatie is een link niet meer bruikbaar. Een nieuw verzoek met dezelfde bedrijfscode/e-mail maakt de vorige link ongeldig.
- D1-limieten per IP, gehashte e-mail en bedrijfscode beperken herhaald aanmelden. Deze limieten vervangen geen botbescherming.
- De installatiecode SETUP_KEY blijft exclusief voor interne beheerders; publieke registratie vraagt deze code nooit.
- De aanmeldpagina en verificatiepagina bevatten geen mail-API-sleutels. De verificatiepagina haalt het token uit de URL-fragmentidentifier en wist die direct uit de adresbalk.
