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

- Eén webapp, gescheiden bedrijfsomgevingen (bedrijfscode + e-mail + wachtwoord), zelfstandige of bedrijf. Bedrijven worden door de platformbeheerder met een installatiecode aangemaakt. Eigenaar nodigt medewerkers uit met een eenmalige code (48 uur), medewerkers kiezen zelf een wachtwoord. Rollen eigenaar, administratie en medewerker. Deactiveren beëindigt sessies.
- Medewerker ziet eigen registraties en gedeelde projectlijst zonder tarieven; eigenaar/administratie zien teamregistraties, projecttotalen en declaraties. Eigenaar beheert bedrijfsnaam, logo, tarieven, activiteiten en opslag. Agenda hergebruikt huidige kalender en sleepselectie. Tijden optioneel, kilometers per medewerker, PDOK/OSRM routeberekening op aanvraag (indicatief, geen beschikbaarheidsgarantie).
- Per registratie een aparte databaserij; wijzigingen gebruiken eigen revisienummer. Declaraties per project, gedeeltelijke uren, vast bedrag of percentage en handmatig bedrag. SQL-triggers en één atomaire batch voorkomen dubbele allocatie. Concepten kunnen worden vervallen of verzonden gemarkeerd. Conceptdeclaraties zijn geen btw-facturen.
- Eigen STACK WebDAV-map per bedrijf, aparte gebruikersnaam en toegangstoken; versleuteld in D1 met AES-GCM en aparte Workers secret. Alleen expliciet ondersteunde STACK-hostnamen; andere WebDAV-aanbieders vragen een aparte integratie en SSRF-controle. Excel-export en op verzoek een back-up met unieke naam (geen overschrijven). D1 blijft de leidende opslag. Nog geen geplande automatische exports of herstelwizard.
- Sessietoken alleen in sessionStorage; server bewaart hash, vervalt na 12 uur. PBKDF2-SHA256 (100.000 iteraties; Workers-limiet), unieke salts, loginlimieten per IP/account, exacte CORS-origins. Tenant- en rolcontrole server-side. Geen wachtwoordherstel, MFA of e-mailverzending in deze pilot. Voor productie: account recovery, sterkere authenticatie/MFA, Cloudflare rate limiting, D1 Time Travel/herstelproef, beoordeling privacy/verwerkersafspraken, limieten/paginering en security review.

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
