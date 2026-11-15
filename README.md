# LA · Uren en kilometers

Webapp voor Lemson Architecten. Geschikt voor actuele Windows- en macOS-browsers en voor GitHub Pages. De bestanden van klanten worden **niet** met de website gepubliceerd.

## Agenda

De standaardweergave is een compacte **werkweek** (maandag t/m vrijdag), met een keuze voor dag, volledige week of maand. Projecten krijgen een herkenbare kleur, dagtotalen en het weektotaal blijven zichtbaar. Klik op een registratie om deze in één venster te wijzigen.

**Met de muis registreren:** klik op een leeg halfuur voor een voorgesteld tijdvak van één uur, of houd de muisknop ingedrukt en **sleep** in dezelfde dagkolom om een tijdvak van bijvoorbeeld 09:00–11:00 te selecteren. Een gekleurde selectie toont de exacte duur voordat het invoervenster opent. Pas na **Bewaren** worden de uren toegevoegd. Op aanraakschermen werkt gewoon aantikken; slepen is bedoeld voor muis/pen.

**Oude uren zonder tijd:** deze verschijnen als **gestreepte indicatieve blokken vanaf 08:00**, binnen dezelfde dag achter elkaar. Zo blijft de kalender visueel bruikbaar. De app vult nadrukkelijk geen daadwerkelijke begintijden of eindtijden in Excel in. Je kunt de historische registratie aanklikken om de bestaande uren of later alsnog werkelijke tijden aan te passen. Is er op één dag meer dan zestien uur zonder tijd, dan blijven de resterende registraties toegankelijk onder 'Niet ingetekend'.

Nieuwe uren kun je ook zonder tijd invoeren: beide tijdvelden leeg laten en alleen het aantal uren registreren. Als je beide tijdvelden invult, volgt het aantal uren automatisch uit het tijdsverschil. Overlappende registratieblokken staan naast elkaar. Het invoervenster waarschuwt bij nieuwe, daadwerkelijk overlappende tijdvakken. Bestaande projecturen, gedeeltelijke declaraties, ritgegevens en het mutatielog blijven behouden.

De Excel-werkmap bewaart de optionele kolommen `Begintijd` en `Eindtijd`. Oudere jaarbestanden blijven zonder conversie leesbaar en de nieuwe velden gaan via de bestaande STACK-verbinding naar het privé-moederbestand. Er komen geen klantgegevens op GitHub.

## Direct gebruiken

**Cloudflare en STACK zijn verschillende diensten.** STACK bewaart het Excel-moederbestand. Cloudflare Workers is een apart beveiligd tussenstation, omdat GitHub Pages niet rechtstreeks met een geheim STACK-wachtwoord kan synchroniseren. Zonder Cloudflare kan de app lokaal worden gebruikt met import/export; synchronisatie tussen computers is dan nog niet actief.

1. Open `index.html` in een browser, of publiceer de bestanden uit de webmap op GitHub Pages.
2. Ga naar **Instellingen → Bestand → Importeren** en selecteer het privébestand `LA-Uren-Km-2026.xlsx`.
3. Voer nieuwe uren in onder **Registreren**. Via **Overzicht** is een maandoverzicht per project als CSV of PDF af te drukken.
4. Download geregeld een nieuwe Excel-export totdat de STACK-koppeling werkt.

Het projectnummer toont meteen de projectomschrijving. Er zijn tien instelbare activiteiten. Bestaande registraties en projecten worden in één venster aangepast; alleen nieuwe registraties doorlopen de vragen stapsgewijs. De bedrijfsnaam en het logo zijn instelbaar onder **Instellingen → Bedrijf** en worden in de Excel-werkmap opgeslagen (logo automatisch verkleind voor Excel). Datumregels tonen weekdag en jaar. De huidige maand toont zes regels, desgewenst alle regels. In **Projecten** staan totalen per maand en jaar. In **Declaraties** kunnen uren ook gedeeltelijk worden gedeclareerd.

## STACK-koppeling

De website (GitHub Pages) is openbaar; gegevens, WebDAV-adres en wachtwoorden staan alleen in het privé-Excel-moederbestand en in beveiligde Cloudflare Worker-instellingen. De browser krijgt nooit het STACK-token. De app vraagt bij het verbinden om een **aparte toegangscode** en bewaart die niet permanent in de browser.

### Eenmalig op STACK

1. Open de persoonlijke STACK-webinterface, maak de map **`LA-Uren`** aan in de hoofdmap (de Worker kan deze map ook bij de eerste opslag maken).
2. Upload het privébestand `LA-Uren-Km-2026.xlsx` naar die map. De echte projecten en uren horen dus **niet** op GitHub. Maak in dezelfde map later een apart `LA-Uren-Km-2027.xlsx` via de webapp.
3. Controleer onder de persoonlijke STACK-instellingen het **WebDAV-adres**. De officiële TransIP-indeling is `https://<account>.stack.storage/remote.php/webdav/`. Het browseradres `/webdav/files/<gebruiker>` is hiervoor niet geschikt. Een token is vereist wanneer voor STACK tweestapsverificatie actief is.

### Eenmalig op Cloudflare

1. Log in bij [Cloudflare Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages) en zorg dat je het Workers-project kunt publiceren.
2. Publiceer `server/worker.js` als Cloudflare Worker met de instellingen uit `server/wrangler.toml` (`APP_ORIGIN = https://mlemson.github.io`). Dat kan vanaf een lokale clone van de repository met:

   ```bash
   cd server
   npx wrangler login
   npx wrangler deploy
   ```

3. Ga in Cloudflare naar de **Worker → Settings → Variables and Secrets** en voeg de volgende vier waarden toe als **Secret**, niet als zichtbare tekstvariabele:

   | Naam | Waarde |
   | --- | --- |
   | `STACK_FOLDER_URL` | Het echte WebDAV-mapadres, eindigend op `/remote.php/webdav/LA-Uren` |
   | `STACK_USER` | De STACK-gebruikersnaam |
   | `STACK_TOKEN` | Het STACK-WebDAV-token (of wachtwoord zonder 2FA) |
   | `APP_PASSWORD` | Een nieuw, uniek, lang wachtwoord voor toegang via de webapp |

   Optioneel: `ORS_API_KEY` als Secret voor rijroutes. Zet **nooit** een STACK-token in de repository, GitHub Pages, de URL of een screenshot.
4. Activeer de Worker-route/het `workers.dev`-adres. De Worker bevat `GET /api/status` (alleen na inloggen), `GET/PUT /api/year/2026`, `GET/PUT /api/year/2027`, enzovoort. De Worker maakt de doelmap desgewenst bij de eerste opslag aan.
5. Open de [website](https://mlemson.github.io/urenregistratie/), ga naar **Instellingen**, vul bij **Adres van de beveiligde koppeling** alleen het **`https://...workers.dev`**-adres in, en vul bij **Toegangscode** `APP_PASSWORD` in. Kies **Verbinden met STACK**.

### Veilig bewaren

- Bij elke wijziging slaat de app direct een lokale kopie op en probeert deze in de cloud te bewaren. Een waarschuwing is zichtbaar zolang STACK niet is bijgewerkt.
- De toegangscode blijft alleen in de tijdelijke opslag van het huidige browsertabblad (sessionStorage). Na een paginaverversing wordt de STACK-verbinding automatisch hersteld; na sluiten van het tabblad kan opnieuw aanmelden nodig zijn. De code komt niet in lokale permanente opslag, Excel of GitHub.
- Wijzigingen die je maakte terwijl STACK niet verbonden was, worden na opnieuw verbinden automatisch naar hetzelfde Excel-moederbestand gestuurd **als de online bestandsversie sinds de laatste succesvolle synchronisatie niet veranderd is**. Is die versie wél veranderd, dan stopt automatisch opslaan om gegevensverlies te voorkomen en blijft de lokale kopie staan.
- De versiecontrole met ETag voorkomt een normale verouderde overschrijving op een andere computer. Gebruik de app niet gelijktijdig op meerdere apparaten; de server is geen volwaardig samenwerkingsplatform met rijvergrendeling.
- Zijn er lokale wijzigingen voor een bestaand online jaarbestand, dan vraagt de app om eerst een Excel-back-up te downloaden en daarna pas de online versie in te laden. Bij een conflict download je eerst de lokale kopie.
- Download minimaal maandelijks en bij afsluiting van het jaar een aparte back-up. STACK en lokale browseropslag zijn niet hetzelfde als een onafhankelijk back-uparchief.
- Laat naast de aparte app-toegangscode bij voorkeur Cloudflare-rate-limiting of Cloudflare Access instellen.

### Testen

```bash
cd server
npm test
```

Deze tests gebruiken alleen fictieve WebDAV-gegevens en bereiken niet de echte STACK-opslag. Een live verbinding kan pas worden bevestigd als de Cloudflare Worker is gepubliceerd en voorzien van de vier geheime instellingen.

## Registratie en fiscus

- **2026:** het standaard rekenbedrag voor zakelijke kilometers met privévervoer is € 0,25 per kilometer. Dit is een inkomstenbelastingberekening, niet automatisch een aan klanten factureerbaar tarief. Voor 2027 is het tarief bewust niet ingevuld.
- Bij de registratie en in het bewerkvenster wordt de autoroute van vertrekpostcode naar bestemmingspostcode automatisch berekend; standaard is dit een retourrit (2 × enkele reis). Het is mogelijk een enkele reis te kiezen of het aantal kilometers handmatig te corrigeren. De postcodezoeker gebruikt PDOK en de router gebruikt bij ontbrekende ORS-sleutel een openbare OSRM-demodienst. Die demodienst heeft beperkingen en geen beschikbaarheidsgarantie; voor structureel zakelijk gebruik verdient een eigen router of OpenRouteService met toegangssleutel de voorkeur. Autoafstand wordt op basis van postcodelocaties en de autoroute berekend wanneer een routeplanner bereikbaar is. De uitkomst is indicatief; controleer of deze overeenkomt met de werkelijk gereden afstand. Voor volledige fiscale rittenregistratie (zoals bewijs van maximaal 500 privé-kilometers bij een zakelijke auto) zijn begin-/eindkilometerstand, werkelijke adressen, beide ritten van een retour en uitzonderlijke routes belangrijk. Gebruik daarvoor de uitbreidbare ritgegevens en laat de registratie op jouw autosituatie aansluiten.
- Ook indirecte ondernemersuren worden meegenomen in het jaaroverzicht.
- De declaratiepagina maakt **voorstellen/registraties**, geen juridisch volledige btw-facturen. Bewaar de werkelijk verzonden facturen daarnaast, inclusief de verplichte afnemer- en btw-gegevens.
- De app houdt een mutatielog bij en ondersteunt een downloadbare Excel-back-up. Voor de fiscale bewaarplicht is betrouwbaar bewaren en terug kunnen vinden noodzakelijk. Bewaar de definitieve jaarexporten en originele facturen doorgaans 7 jaar; bij specifieke gegevens over onroerende zaken kan 10 jaar gelden.

## Overname 2026

De overgenomen gegevens staan alleen in het afzonderlijk aangeleverde privébestand. De publieke GitHub-repository bevat geen projecten, uurregels, oude declaraties of andere klantgegevens.

De oude factuurbedragen en referenties staan in `HistorischeDeclaraties`. De oorspronkelijke werkmap koppelde deze bedragen niet eenduidig aan individuele geregistreerde uren. Om dubbel declareren te voorkomen zijn de historische registraties op **onbekend** gezet. Beoordeel ze per project onder **Declaraties** en geef aan of niets, alles of een deel al is gedeclareerd. Nieuwe registraties zijn direct openstaand.

## Technische bestanden

- `index.html`, `style.css`, `app.js`: browserprogramma.
- `seed.js`: lege startconfiguratie. Geen persoonsgegevens.
- `server/worker.js`: beveiligde WebDAV-adapter en routeberekening.
- `server/worker.test.mjs`: tests voor beveiliging, opslagversies en postcoderoutes.
- Excel-moederbestanden: afzonderlijk downloaden en **privé** bewaren.

SheetJS 0.20.3 wordt vanaf de officiële SheetJS-CDN geladen. Om volledig onafhankelijk van internet-CDN's te werken kan de scriptbibliotheek later lokaal worden opgeslagen en via een relatief pad worden geladen.

## Betrouwbaarheid

Bij ontbreken van STACK blijven gegevens lokaal in de browser. Dit is **geen vervanging voor een back-up**. De site is niet bedoeld voor gelijktijdig bewerken op meerdere apparaten zonder gecontroleerde STACK-synchronisatie. Bewaar tokens uitsluitend in de Cloudflare Worker-secrets, niet in HTML, JavaScript of GitHub.

## GitHub Pages

Publiceer via **Settings → Pages → Build and deployment → Deploy from a branch**, kies `main` en `/(root)` en sla op. Het adres wordt dan `https://mlemson.github.io/urenregistratie/`. De site is publiek, maar het werkbestand staat niet in de repository. De Cloudflare Worker moet apart worden gepubliceerd en met privéinstellingen worden verbonden voordat STACK-synchronisatie kan werken.