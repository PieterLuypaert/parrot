# Parrot: plan

Planversie 1, 22 november 2026. Wijzigingen aan dit plan staan in de git-geschiedenis van deze map; de schets toont dezelfde planversie.

Een pixel-art-papegaai in de Herdr-app die meekijkt terwijl je werkt. Ziet hij een fout, in je terminal of daarbuiten (de logs van je stack, de CI van je PR, je lokale app in de browser), dan schrikt hij op. Klik je op hem, dan zoekt je eigen Claude uit wat er misging en toont in een spraakwolkje de uitleg, met een fix als commando die je met één klik draait. Je kunt hem ook altijd zelf iets vragen.

Agent-panes (Claude Code, Codex, ...) slaat hij over, want daar zit al een Claude.

Visuele schets: `sketch/moods.html`, gepubliceerd als artifact: https://claude.ai/artifact/1fH5s1mvty964pwgxpqzQ7

## Wat je ziet

| Stemming | Wanneer | Wat hij doet |
|---|---|---|
| Rustig | Niets aan de hand | Zit op zijn stok, wiegt zachtjes, knippert af en toe |
| Slaapt | Een tijd niets gebeurd | Kop gezakt, ogen dicht, "z z" |
| Kijkt mee | Er loopt een commando | Kopje scheef, kijkt naar de tekst |
| Schrikt | Hij ziet een fout: een commando met een foutcode, een fout in de logs van je stack, een rode CI-check of een fout in je lokale app | Veren recht, ogen wijd, snavel open, rood uitroepteken, korte squawk |
| Denkt na | Claude is bezig met je vraag | Kijkt omhoog, "..." in het wolkje |
| Danst | Het commando na een fix slaagt | Vleugels op en neer, wipt heen en weer |

Hij blijft in zijn hoek tot jij klikt. Hij opent niets vanzelf en duwt niets voor je neus.

- **Bij een fout** staat in het wolkje waar hij ze zag: `zsh · shop-api`, `docker · api-1`, `CI · test (web)` of `browser · localhost:3000`.
- **Zonder actuele fout** toont een klik "Wat hij zag" (de laatste vijf meldingen) en de vraagbalk.

## Vragen stellen

De vraagbalk staat altijd in het wolkje. Klik op de papegaai, of druk ⌥⇧⌘P (vrij in je `keys.json`).

- **Wat je kunt vragen:**
  - over een fout: "waarom faalt dit?";
  - over de code: "waar wordt die mail verstuurd?";
  - over je stack: "draait alles van deze worktree?";
  - los van alles: "hoe zet ik een postgres-dump terug?".
- **Context die vanzelf meegaat:** de pane met focus (map, branch, laatste output), wat hij recent zag, en `git status` van die repo. Andere panes alleen als je erom vraagt.
- **Doorvragen:** elk gesprek is een Claude-sessie. Het eerste antwoord geeft een session-id (`claude -p --output-format json`), en vervolgvragen gaan verder met `--resume <id>`. Er is één gesprek per pane, tot je het wolkje sluit.
- **Plakken:** een fout van ergens anders (Slack, Sentry, een mail) plak je in de vraagbalk. Hij legt ze uit in de context van de repo van de pane.
- **Zelfde regels als bij de uitleg:** Claude leest alleen, draait alleen controles uit de vaste lijst, en commando's lopen pas na jouw klik.

## Hoe het werkt

Drie delen:

1. **De mod** in de Herdr-app: de papegaai, het wolkje en de knop. Hij doet zelf niets zwaars. Hij volgt `~/.parrot/events/` met `watchFolder`, toont wat er binnenkomt en roept Claude aan na een klik.
2. **De zsh-hook** (`preexec` en `precmd`, één bestand dat je in `.zshrc` sourcet) schrijft na elk commando een regel naar `~/.parrot/events/`: het commando, de exitcode, de map, de duur, het tijdstip en de pid van de shell. Parrot koppelt de pid aan een terminal via `hc ls --json` (het veld `pid`).
3. **De wachter** (`parrot-watch`): een klein Bun-script dat op de achtergrond draait als terminal van herdr-core (`hc run --bg --name parrot-watch`). De mod start hem als parrot aan staat en stopt hem met `hc kill parrot-watch` als je hem uitzet. Hij volgt de bronnen buiten de terminal (zie Bronnen) en schrijft wat hij ziet als events in dezelfde map. De mod kan dat niet zelf, want `exec` stopt na hoogstens 10 minuten.

Na een klik:

1. **Context verzamelen.** Bij een terminalfout knipt parrot de output van dat ene commando uit `hc read`, tussen de promptregels. Bij andere fouten neemt hij de logregels, de CI-log of de browserfout uit het event. Daarbij komen telkens de map, de branch en `git status`.
2. **Geheimen maskeren en het Claude vragen:** `claude -p --output-format json`, met alleen tools die lezen en de vaste lijst controles (zie Nauwkeurigheid).
3. **Het antwoord tonen.** Het wolkje toont het antwoord met het label Gecontroleerd of Vermoeden, de regels waarop het steunt en de voorgestelde commando's als knoppen. **Run** stuurt een commando met `hc send <terminal> "<cmd>"` naar de pane.

## Aan en uit

Een knop **Parrot** in de tabbalk, naast je andere mod-knoppen zoals Chartroom, zet hem aan of uit. ⌥⌘P doet hetzelfde.

- **Aan:** het venster met de papegaai opent en de wachter start. Met `keep: true` komt het venster terug na een herstart, tot je hem uitzet.
- **Uit:** het venster sluit, de wachter stopt, en de hook schrijft niets meer weg zolang `~/.parrot/off` bestaat. Geen meekijken, geen squawk en geen Claude.
- **De knop** toont een kleine papegaaienkop: in kleur als hij aan staat, grijs als hij uit staat.

`install.sh` zet de knop in de tabbalk zoals bij chartroom (een block `parrot-button` met de mod en `props: { button: true }` in de rij van de tabbalk) en bindt ⌥⌘P en ⌥⇧⌘P als die toetsen vrij zijn.

## Nauwkeurigheid

Getest op een van je shells: `hc read` geeft de letterlijke tekst van een pane terug, met de promptregels, zonder kleuren, en met de hele geschiedenis (`"complete": true`).

| Stap | Hoe goed | Wat we doen |
|---|---|---|
| Wat hij ziet | Letterlijke tekst, geen screenshot. Mist de kleuren, en van fullscreen-programma's (vim, htop, lazygit) alleen het huidige scherm | Fouten herkennen aan woorden, niet aan kleur |
| Welke output bij welk commando hoort | Goed: de hook kent het commando en het tijdstip, en de promptregels staan in de tekst | Knippen tussen de prompt van dat commando en de volgende. Bij lange output het begin, het einde en de regels met `error`, `fail` of `exception` |
| Fouten buiten de terminal herkennen | Met patronen per bron, dus vals alarm is mogelijk | Eigen regels per bron, dezelfde fout na elkaar telt als één melding met een teller, en een knop "dit is geen fout" die dat patroon stil zet |
| De diagnose | Hangt af van wat Claude mag nakijken | Drie niveaus, hieronder |

De drie niveaus van de diagnose:

1. **Alleen de tekst:** goed voor bekende fouten (stack traces, bezette poorten, ontbrekende modules, git-conflicten), maar soms gokken.
2. **Met de code:** Read, Grep en Glob, zodat Claude het bestand en de regel uit een stack trace opzoekt.
3. **Met controles die alleen lezen:** een vaste lijst commando's die Claude zelf mag draaien, via `--allowedTools "Bash(<commando>:*)"`. Om te beginnen: `git status`, `git log -5`, `git diff --stat`, `docker compose ps`, `docker compose logs --tail`, `lsof -i`, `node -v`, `pnpm -v` en `gh pr checks`. Niets dat schrijft, stopt of installeert.

Elk antwoord krijgt een label: **Gecontroleerd**, met de controle die hij draaide, of **Vermoeden**, als hij het alleen uit de tekst haalt. Eronder staan de regels waarop het steunt.

**Geheimen.** Voor er iets naar Claude gaat, maskeert parrot bekende patronen: API-keys, tokens, JWT's, wachtwoorden in URLs en waarden uit `.env`. Dat vangt niet alles, en daarom gaat er pas iets weg na jouw klik.

## Bronnen: fouten buiten de terminal

De wachter herkent fouten lokaal, met patronen, zonder Claude. Claude komt pas na je klik.

| Bron | Wat hij ziet | Hoe | Wanneer |
|---|---|---|---|
| Commando's in je shells | Een commando dat eindigt met een foutcode | De zsh-hook | v1 |
| Plakken | Een fout van eender waar (Slack, Sentry, een mail) | De vraagbalk | v1 |
| Draaiende programma's in andere panes (dev-server, test-watcher) | Een fout die verschijnt terwijl het programma blijft draaien | De wachter leest die panes met `hc read` als ze veranderen en zoekt nieuwe foutregels | v2 |
| De logs van je stack | Fouten in de containers van de worktree (api, worker, db) | `docker compose logs --follow`, per worktree met een wt-stack | v2 |
| Wat je recent veranderde | Geen fouten, wel context: "dat bestand heb je net aangepast" | `git diff` en `git log` bij de uitleg | v2 |
| De CI van je PR | Een rode check op de branch van een worktree | `gh pr checks` om de paar minuten; bij de uitleg `gh run view --log-failed` | v3 |
| Je lokale app in de browser | Consolefouten en mislukte requests (4xx en 5xx) op localhost | Een kleine Chrome-extensie die alleen localhost volgt en naar de wachter op `127.0.0.1` stuurt | v4 |

Hoe hij het je laat weten:

- **Je kijkt naar Herdr:** hij schrikt op en squawkt.
- **Je zit ergens anders, bijvoorbeeld in de browser:** ook een Herdr-melding met `notify()`, zodat je het ziet als je terugkomt.
- **Stille modus:** alleen het uitroepteken, geen geluid.

## Wat parrot kan binnen de Herdr-app

Elk punt hieronder steunt op iets dat de Herdr-app of herdr-core vandaag geeft (`~/.config/herdr-app/AGENTS.md`, `herdr.d.ts`, `gpui-kit.d.ts`, `hc --help`).

| Kan | Hoe |
|---|---|
| Vrij staan, zonder kaartje rond zich, en versleept worden | Een venster zonder kader: `openOverlay({ kind: "window", frame: "none", key: "parrot", keep: true })`. Het onthoudt waar je het neerzet en komt terug bij een herstart |
| Of als kaartje aan de rand van het werkgebied | Floating block in de layout (`floating`, `edge`, `align`); Herdr tekent er wel altijd een kader met schaduw rond |
| Een aan/uit-knop in de tabbalk, naast je andere mod-knoppen | Een block met de mod in de rij van de tabbalk, zoals `chartroom-button`; de knop opent of sluit het venster |
| Half achter de rand zitten, zodat hij geen terminaltekst bedekt | `peek` op een floating block aan een zijkant: alleen zijn kop steekt uit tot je erover hovert |
| Een pixel-art-papegaai in volle kleur tonen | `image()` met PNG-frames uit de mod-map |
| Animeren | Frames wisselen met een timer (`cx.sleep`, `timer.after`) voor knipperen, schrikken en dansen. Native motion op `top`, `left` en `opacity` voor wiegen en wippen. `frames()` voor de "..." |
| Weten welke pane focus heeft en wat er draait | `panes()`, `focused()`, `agents()`; `hc ls --json` geeft per terminal het programma op de voorgrond |
| De tekst van een pane lezen | `hc read <t> --lines N`: scherm plus geschiedenis |
| Een helper op de achtergrond laten draaien | `hc run --bg --name parrot-watch` start hem als terminal van herdr-core; `hc kill parrot-watch` stopt hem |
| Volgen wanneer terminals veranderen | `hc events` geeft elke verandering als JSON-regel |
| Je eigen Claude vragen, ook met doorvragen | `exec("claude", ["-p", ...])`, maximaal 10 minuten per call; `--resume <session-id>` voor een vervolgvraag |
| Een commando in de pane laten lopen | `hc send <t> <tekst>` (plakt en drukt Enter, wacht als je zelf iets half getypt hebt) |
| Geluid maken | `playSound(<mp3>)`: een eigen squawk |
| Een melding geven als je ergens anders kijkt | `notify()`, de toast die je al hebt |
| Instellingen en geheugen bewaren | Gedeelde state per mod (stille modus, piratentaal aan of uit, model, stilgezette patronen) |
| Een groter venster openen voor een lang antwoord | `openOverlay({ kind: "window" })`, versleepbaar, zonder rand als we willen |

## Wat parrot niet kan

| Kan niet | Waarom | Wat we doen |
|---|---|---|
| In de terminaltekst zelf tekenen, tussen je regels | Mods tekenen alleen in hun eigen block of overlay | Hij staat boven het werkgebied, niet erin |
| Vanzelf weten dat een commando faalde | herdr-core geeft alleen de exitcode van de terminal zelf, niet van elk commando erin | De zsh-hook |
| Zelf blijven volgen vanuit de mod | `exec` stopt na hoogstens 10 minuten | De wachter draait als achtergrondterminal van herdr-core |
| In de browser kijken | De Herdr-app heeft geen toegang tot je browser | Een Chrome-extensie voor localhost (v4) |
| Merken dat een dev-server goed opgestart is | De hook ziet alleen commando's die eindigen; `pnpm dev` blijft draaien | Fouten van een draaiende server ziet de wachter wel (v2); dansen doet hij alleen na commando's die eindigen |
| Precies op de rand van één bepaalde pane gaan zitten | `panes()` geeft geen positie in pixels; een floating block hoort bij één deel van de layout | v1: één papegaai die de pane met de fout noemt. Spike: hem in de pane-header laten zitten (zie Open vragen) |
| Vrij over het hele venster vliegen | Een doorzichtig venster over alles zou je klikken opvangen | Wegvliegen en aankomen als animatie binnen zijn eigen venster |
| Draaien of schalen als animatie | Native motion kent alleen `opacity`, `width`, `height`, `left`, `top` | Kop scheef, vleugels en dansen tekenen we als aparte frames |
| HTML, CSS of een web view gebruiken | Mods zijn native GPUI | Alles als native elementen en PNG-frames |
| Het antwoord van Claude woord per woord tonen | `exec` geeft de uitvoer pas als het programma klaar is | "Denkt na" tot het antwoord er is; later eventueel `--output-format stream-json` naar een bestand dat de mod volgt |
| Meekijken in een agent-pane | Kan technisch wel, maar daar zit al een Claude, en zijn context verstoren we niet | Agent-panes slaat hij over |
| Shells op een andere machine volgen | `watchFolder` werkt alleen lokaal | v1 alleen lokaal; later pollen met `readTextFile({ on })` |

## Privacy, kosten en veiligheid

- **Herkennen gebeurt lokaal.** De hook en de wachter gebruiken patronen, geen Claude. Er gaat niets naar Claude tot je op de papegaai klikt of iets vraagt. Je sub wordt dus alleen gebruikt als jij het wil.
- **Wat er meegaat:** alleen de context van die ene fout of vraag (zie Hoe het werkt), met de geheimen gemaskeerd.
- **Claude leest alleen:** Read, Grep, Glob en de vaste lijst controles. Nooit Edit, Write of vrije Bash.
- **Run alleen na een klik.** Commando's die iets weggooien of overschrijven (`rm -rf`, `git reset --hard`, `git push --force`, `kill`, `DROP`, `docker system prune`, ...) krijgen een rood label en vragen een tweede klik.
- **De browser-extensie** volgt alleen localhost en stuurt alleen naar `127.0.0.1`.
- **Uit is uit:** geen hook-events, geen wachter en geen Claude.
- **Model:** standaard een snel model voor de eerste uitleg; vervolgvragen op het model dat je kiest, zoals de Ask van chartroom.

## Open vragen voor een spike

1. **Waar hij zit.** Drie kandidaten, in volgorde van voorkeur:
   - een venster zonder kader (`frame: "none"`): staat vrij en is versleepbaar. Is de achtergrond echt doorzichtig rond de sprite, en blijft hij staan als je van tab wisselt?
   - een floating block: betrouwbaar en met `peek`, maar altijd in een kaartje;
   - de pane-header: elke pane heeft een header-mod (`pane`, 30 px hoog). Als we die clonen, kan hij precies op de pane met de fout zitten en van pane naar pane "vliegen". Is 30 px groot genoeg voor een leesbare papegaai?
2. **Frames wisselen** met `cx.sleep` aan zo'n 8 per seconde: vloeiend genoeg, en zuinig genoeg als hij urenlang rustig zit? Stilzitten kan zonder timer, met alleen native motion.
3. **De zsh-hook** naast de shell-integratie van Ghostty en Herdr: komen ze elkaar niet in de weg, en vangt hij ook commando's met pipes en `&&`?
4. **Snelheid** van `claude -p` voor een eerste uitleg: hoeveel seconden tot het wolkje er is, per model?
5. **De knop en het bewaarde venster.** Na een herstart opent Herdr het venster opnieuw (`keep: true`), met een nieuw id. De knop moet het terugvinden om het te kunnen sluiten, via de gedeelde state van de mod.
6. **De wachter als achtergrondterminal.** Blijft een terminal van `hc run --bg` buiten je tabs, en hoe start de mod hem opnieuw na een herstart van herdr-core?
7. **`hc events`:** meldt het ook nieuwe output, of moet de wachter panes met draaiende programma's om de paar seconden lezen?
8. **Vals alarm:** hoeveel geven de patronen op echte dev-server- en containerlogs uit je eigen stacks?

## Bouwvolgorde

Elk stuk is een eigen PR die op zichzelf werkt.

1. **Papegaai op de kaart:** de mod op de plek die de spike kiest, de sprite met rustig, slapen en kijkt mee, de aan/uit-knop in de tabbalk met ⌥⌘P, en `install.sh` die de knop en de toetsen toevoegt zoals bij chartroom.
2. **Schrikken bij terminalfouten:** de zsh-hook, de events-map, opschrikken en de squawk.
3. **Uitleg en vragen:** de klik, `hc read` met knippen tussen de promptregels, `claude -p` die alleen leest, het label Gecontroleerd of Vermoeden, de vraagbalk met doorvragen en plakken, en het maskeren van geheimen.
4. **Run en controles:** de knoppen voor commando's, het rode label, de vaste lijst controles, dansen na een geslaagde fix.
5. **De wachter:** `parrot-watch`, draaiende programma's in andere panes, de logs van je stack, "Wat hij zag" en context uit git.
6. **De CI van je PR.**
7. **De browser-extensie** voor localhost.
8. **Afwerking:** stille modus, piratentaal aan of uit, modelkeuze, README met screenshots in licht en donker.

## Versies

Parrot volgt [semver](https://semver.org). Tot alles uit de bouwvolgorde er is, blijft hij op 0.x, en elk stuk uit de bouwvolgorde is een minor-versie:

| Versie | Wat erbij komt |
|---|---|
| 0.1.0 | Papegaai op de kaart |
| 0.2.0 | Schrikken bij terminalfouten |
| 0.3.0 | Uitleg en vragen |
| 0.4.0 | Run en controles |
| 0.5.0 | De wachter |
| 0.6.0 | De CI van je PR |
| 0.7.0 | De browser-extensie |
| 1.0.0 | Afwerking |

- **Fixes tussendoor** zijn patch-versies, zoals 0.3.1.
- **Eén plek voor het nummer:** het versienummer staat alleen in `package.json`. De mod toont het in de tooltip van de knop en `install.sh` drukt het af.
- **Elke versie** krijgt een stuk in `CHANGELOG.md` (Keep a Changelog) en een git-tag `vX.Y.Z`.
- **Zodra de repo op GitHub staat:** een release per tag, zoals bij portly.
- **Het plan** heeft een eigen planversie bovenaan. Die gaat omhoog als de koers verandert, en de schets toont dezelfde.

Testen met `bun test` voor de delen zonder app: de hook-regels lezen, output knippen tussen promptregels, geheimen maskeren, foutpatronen per bron (met geanonimiseerde logs als voorbeelden), gevaarlijke commando's herkennen, het antwoord in uitleg en commando's splitsen.
