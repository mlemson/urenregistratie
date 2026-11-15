# LA · Uren en kilometers

Webapp voor Lemson Architecten. Geschikt voor actuele Windows- en macOS-browsers en voor GitHub Pages. De bestanden van klanten worden **niet** met de website gepubliceerd.

## Direct gebruiken

1. Open `index.html` in een browser, of publiceer de bestanden uit de webmap op GitHub Pages.
2. Ga naar **Instellingen → Bestand → Importeren** en selecteer het privébestand `LA-Uren-Km-2026.xlsx`.
3. Voer nieuwe uren in onder **Registreren**. Via **Overzicht** is een maandoverzicht per project als CSV of PDF af te drukken.
4. Download geregeld een nieuwe Excel-export totdat de STACK-koppeling werkt.

Het projectnummer toont meteen de projectomschrijving. Er zijn tien instelbare activiteiten. Bestaande registraties kunnen worden gewijzigd. De huidige maand toont zes regels, desgewenst alle regels. In **Projecten** staan totalen per maand en jaar. In **Declaraties** kunnen uren ook gedeeltelijk worden gedeclareerd.

## STACK-koppeling

De website draait als statische pagina. Om een privé-Excelbestand veilig vanuit elke browser op STACK te lezen en te schrijven is een kleine Cloudflare Worker nodig. De Worker gebruikt WebDAV. Het STACK-wachtwoord of WebDAV-token komt nooit in GitHub-broncode.

1. Maak in de STACK-webinterface een map, bijvoorbeeld `LA-Uren`, en plaats daar het Excel-bestand `LA-Uren-Km-2026.xlsx` in. Maak bij voorkeur een aparte STACK-gebruiker met alleen toegang tot die map en een WebDAV-toegangstoken (bij 2FA vereist).
2. Publiceer de bestanden `index.html`, `app.js`, `style.css` en `seed.js` op een GitHub Pages-repository. Publiceer **geen** `.xlsx`, `.numbers`, archiefbestand, gegevens-export of tokens.
3. Publiceer `server/worker.js` als Cloudflare Worker. Gebruik de `server/wrangler.toml` als uitgangspunt.
4. Stel in de Worker-omgeving deze variabelen in (publiceer de waarden niet op GitHub):
   - `APP_ORIGIN`: staat al ingesteld op `https://mlemson.github.io` in `wrangler.toml` (zonder `/urenregistratie`).
   - `STACK_FOLDER_URL`: volledige WebDAV-URL van de map, gebruik doorgaans `https://<jouw-stack>.stack.storage/remote.php/webdav/LA-Uren` of het WebDAV-pad dat STACK zelf onder Instellingen toont. De link naar `/webdav/files/<gebruiker>` kan bij een andere WebDAV-toegang horen; controleer die in STACK.
   - `STACK_USER`: STACK-gebruikersnaam, als **Secret**.
   - `STACK_TOKEN`: STACK-WebDAV-token, als **Secret**.
   - `APP_PASSWORD`: een lang, uniek wachtwoord voor de app, als **Secret** (niet hetzelfde als het STACK-token). Het wachtwoord blijft alleen in het geheugen van de open browserpagina en moet na vernieuwen opnieuw worden ingevoerd.
   - `ORS_API_KEY` *(optioneel)*: OpenRouteService API-sleutel voor autoroutes, als **Secret**.
5. Open **Instellingen** in de website, voer het publieke HTTPS-adres van je Worker en de `APP_PASSWORD` in, en kies **Verbinden met STACK**.

De app leest het Excelbestand bij verbinden. Wijzigingen worden vervolgens met een versiecontrole (ETag) opgeslagen. Wanneer een andere computer het bestand tussentijds wijzigt, stopt de app met overschrijven en vraagt om opnieuw in te laden. Download de lokale versie eerst als er een conflict is.

Nieuwe jaren gebruiken een eigen bestand: `LA-Uren-Km-2027.xlsx`, enzovoort. Kies in Instellingen **Jaar aanmaken** om projecten/activiteiten over te nemen zonder oude registraties. Deze nieuwe jaarbestanden kunnen op dezelfde STACK-map worden opgeslagen.

## Registratie en fiscus

- **2026:** het standaard rekenbedrag voor zakelijke kilometers met privévervoer is € 0,25 per kilometer. Dit is een inkomstenbelastingberekening, niet automatisch een aan klanten factureerbaar tarief. Voor 2027 is het tarief bewust niet ingevuld.
- Autoafstand wordt op basis van postcodelocaties en de autoroute berekend wanneer een routeplanner bereikbaar is. De uitkomst is indicatief; controleer of deze overeenkomt met de werkelijk gereden afstand. Voor volledige fiscale rittenregistratie (zoals bewijs van maximaal 500 privé-kilometers bij een zakelijke auto) zijn begin-/eindkilometerstand, werkelijke adressen, beide ritten van een retour en uitzonderlijke routes belangrijk. Gebruik daarvoor de uitbreidbare ritgegevens en laat de registratie op jouw autosituatie aansluiten.
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
- Excel-moederbestanden: afzonderlijk downloaden en **privé** bewaren.

SheetJS 0.20.3 wordt vanaf de officiële SheetJS-CDN geladen. Om volledig onafhankelijk van internet-CDN's te werken kan de scriptbibliotheek later lokaal worden opgeslagen en via een relatief pad worden geladen.

## Betrouwbaarheid

Bij ontbreken van STACK blijven gegevens lokaal in de browser. Dit is **geen vervanging voor een back-up**. De site is niet bedoeld voor gelijktijdig bewerken op meerdere apparaten zonder gecontroleerde STACK-synchronisatie. Bewaar tokens uitsluitend in de Cloudflare Worker-secrets, niet in HTML, JavaScript of GitHub.

## GitHub Pages

Publiceer via **Settings → Pages → Build and deployment → Deploy from a branch**, kies `main` en `/(root)` en sla op. Het adres wordt dan `https://mlemson.github.io/urenregistratie/`. De site is publiek, maar het werkbestand staat niet in de repository. De Cloudflare Worker moet apart worden gepubliceerd voordat STACK-synchronisatie kan werken.