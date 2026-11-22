# Parrot: plan

Planversie 9, 22 november 2026. Wijzigingen aan dit plan staan in de git-geschiedenis van deze map; de schets toont dezelfde planversie.

Een pixel-art-papegaai in de Herdr-app die meekijkt terwijl je werkt. Ziet hij een fout, in je terminal of daarbuiten (de logs van je stack, de CI van je PR, je lokale app in de browser), dan schrikt hij op. Klik je op hem, dan zoekt je eigen Claude uit wat er misging en toont in een spraakwolkje de uitleg, met een fix als commando die je met één klik draait. Je kunt hem ook altijd zelf iets vragen.

Agent-panes (Claude Code, Codex, ...) slaat hij over, want daar zit al een Claude.

Visuele schets: `sketch/moods.html`, gepubliceerd als artifact (in het Engels): https://claude.ai/artifact/1fH5s1mvty964pwgxpqzQ7

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
- **Als chatbot:** het wolkje is een gesprek. Je vragen en zijn antwoorden blijven erin staan tot je het sluit. Voor een langer gesprek opent een knop een groter venster (`openOverlay({ kind: "window" })`) met de hele geschiedenis.
- **Navigeren:** een antwoord kan knoppen hebben die je ergens heen brengen, telkens met één klik:
  - naar de pane of tab waar iets draait (`run("pane.focus", ...)`, `run("tab.select", ...)`). Vraag "waar draait de api van feat/login?" en hij brengt je naar die pane;
  - naar een bestand op de juiste regel in Cursor (`cursor -g <bestand>:<regel>`);
  - naar de PR, de CI-run of de pagina in je browser (`open <url>`).
- **Zelfde regels als bij de uitleg:** Claude leest alleen, draait alleen controles uit de vaste lijst, en commando's lopen pas na jouw klik.

## Hoe het werkt

Drie delen:

1. **De mod** in de Herdr-app: de papegaai, het wolkje en de knop. Hij doet zelf niets zwaars. Hij volgt `~/.parrot/events/` met `watchFolder`, toont wat er binnenkomt en roept Claude aan na een klik.
2. **De zsh-hook** (`preexec` en `precmd`, één bestand dat je in `.zshrc` sourcet) schrijft na elk commando een regel naar `~/.parrot/events/`: het commando, de exitcode, de map, de duur, het tijdstip en de pid van de shell. Parrot koppelt de pid aan een terminal via `hc ls --json` (het veld `pid`).
3. **De wachter** (`parrot-watch`): een klein Bun-script dat op de achtergrond draait als terminal van herdr-core (`hc run --bg --name parrot-watch`). De mod start hem als parrot aan staat en stopt hem met `hc kill parrot-watch` als je hem uitzet. Hij volgt de bronnen buiten de terminal (zie Bronnen) en schrijft wat hij ziet als events in dezelfde map. De mod kan dat niet zelf, want `exec` stopt na hoogstens 10 minuten.

Na een klik:

1. **Context verzamelen.** Bij een terminalfout knipt parrot de output van dat ene commando uit `hc read`, tussen de promptregels. Bij andere fouten neemt hij de logregels, de CI-log of de browserfout uit het event. Daarbij komen telkens de map, de branch en `git status`.
2. **Geheimen maskeren en het Claude vragen:** `claude -p --output-format json`, met alleen tools die lezen en de vaste lijst controles (zie Nauwkeurigheid).
3. **Het antwoord tonen.** Het wolkje toont het antwoord met het label Gecontroleerd of Vermoeden, de regels waarop het steunt en de voorgestelde fix als knop.
4. **De fix draaien, met één klik.** Een fix kan uit meerdere stappen bestaan, maar het blijft één knop.
   - Parrot stuurt de eerste stap met `hc send <terminal> "<cmd>"` en wacht tot de hook exitcode 0 meldt voor die terminal. Dan stuurt hij de volgende stap.
   - Het wolkje toont welke stap loopt en welke klaar is.
   - Faalt een stap, dan stopt hij en schrikt hij opnieuw op, met die fout als context.

## Aan en uit

Een knop **Parrot** in de tabbalk, naast je andere mod-knoppen zoals Chartroom, zet hem aan of uit. ⌥⌘P doet hetzelfde (`parrot.toggle`).

- **Alleen met een terminal in de tab:** parrot kijkt naar shells, niet naar agents.
  - In een tab met alleen een agent-sessie kun je hem niet aanzetten: de knop staat gedimd, en een klik of ⌥⌘P geeft een melding.
  - Heeft de tab een terminal-pane, dan kijkt hij daarnaar, ook terwijl je in de agent-sessie ernaast typt.
- **Aan:** de papegaai staat rechtsboven in het venster, onder de tabbalk en de titelbalk van de panes. Sleep je hem ergens anders heen, dan houdt Herdr die plek bij. Vanaf v0.5 start ook de wachter.
- **Uit:** het venster sluit, de wachter stopt, en de hook schrijft niets meer weg zolang `~/.parrot/off` bestaat. Geen meekijken, geen squawk en geen Claude.
- **De knop** toont een kleine papegaaienkop: in kleur als de papegaai er staat, grijs als hij uit staat of de tab geen terminal heeft.

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

**Voorlopig buiten scope** (sinds planversie 4): de wachter, de logs van je stack, de CI van je PR en de browser-extensie. Parrot blijft bij de terminal en wat je zelf in de chat plakt. Dit stuk blijft staan als idee voor later.

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
| Vrij staan, zonder kaartje rond zich, en versleept worden | Een venster zonder kader: `openOverlay({ kind: "window", frame: "none", key: "parrot-corner", at })`. Herdr houdt de plek bij waar je het neerzet |
| Of als kaartje aan de rand van het werkgebied | Floating block in de layout (`floating`, `edge`, `align`); Herdr tekent er wel altijd een kader met schaduw rond |
| Een aan/uit-knop in de tabbalk, naast je andere mod-knoppen | Een block met de mod in de rij van de tabbalk, zoals `chartroom-button`; de knop opent of sluit het venster |
| Half achter de rand zitten, zodat hij geen terminaltekst bedekt | `peek` op een floating block aan een zijkant: alleen zijn kop steekt uit tot je erover hovert |
| Een pixel-art-papegaai in volle kleur tonen | `image()` met PNG-frames uit de mod-map |
| Animeren | Native: `loop("top")` voor wiegen, `loop("left")` voor schudden, `frames()` voor de z's en de "...". Een timer alleen voor één knipperframe om de paar seconden en voor korte reeksen (schrikken, dansen, praten) |
| Weten welke pane focus heeft en wat er draait | `panes()`, `focused()`, `agents()`; `hc ls --json` geeft per terminal het programma op de voorgrond |
| De tekst van een pane lezen | `hc read <t> --lines N`: scherm plus geschiedenis |
| Een helper op de achtergrond laten draaien | `hc run --bg --name parrot-watch` start hem als terminal van herdr-core; `hc kill parrot-watch` stopt hem |
| Volgen wanneer terminals veranderen | `hc events` geeft elke verandering als JSON-regel |
| Je eigen Claude vragen, ook met doorvragen | `exec("claude", ["-p", ...])`, maximaal 10 minuten per call; `--resume <session-id>` voor een vervolgvraag |
| Een fix in de pane laten lopen, stap voor stap | `hc send <t> <tekst>` (plakt en drukt Enter, wacht als je zelf iets half getypt hebt); na elke stap wacht parrot op het hook-event met exitcode 0 |
| Je ergens heen brengen | `run("pane.focus", ...)`, `run("tab.select", ...)`, `cursor -g <bestand>:<regel>`, `open <url>` |
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

- **Herkennen gebeurt lokaal.** De hook en de wachter gebruiken patronen, geen Claude.
- **Claude, alleen na je klik of bij een typfout.** Er gaat niets naar Claude tot je op de papegaai klikt of iets vraagt. De enige uitzondering (sinds planversie 7, op jouw vraag) is een commando dat zsh niet vindt of dat volgens zijn output verkeerd gebruikt is. Dan vraagt parrot je Claude meteen wat je bedoelde: met Haiku, zonder tools en zonder bewaarde sessie, met de regel, de gemaskeerde output, de scripts van het project en de commando's die je gebruikt. Een falende testrun of build wacht wel op je klik.
- **Wat er meegaat:** alleen de context van die ene fout of vraag (zie Hoe het werkt), met de geheimen gemaskeerd.
- **Claude leest alleen:** Read, Grep, Glob en de vaste lijst controles. Nooit Edit, Write of vrije Bash.
- **Eén klik, ook voor wat iets weggooit.** Een fix loopt pas na jouw klik, en nooit meer dan één klik.
  - Commando's die iets weggooien of overschrijven (`rm -rf`, `git reset --hard`, `git push --force`, `kill`, `DROP`, `docker system prune`, ...) krijgen een rood label en lopen pas na 3 seconden.
  - In die tijd annuleert een klik of Esc. Een bevestigingsklik is niet nodig.
- **Liever zelf Enter geven?** Een instelling zet zo'n commando in je prompt zonder Enter, zodat je het nog ziet en zelf start. zsh's `print -z` kan dat, ook met `&&` en pipes (getest in de spike); een onzichtbaar alternatief via het klembord testen we in PR 4.
- **De browser-extensie** volgt alleen localhost en stuurt alleen naar `127.0.0.1`.
- **Uit is uit:** geen hook-events, geen wachter en geen Claude.
- **Model:** standaard een snel model voor de eerste uitleg; vervolgvragen op het model dat je kiest, zoals de Ask van chartroom.

## Vragen voor de spike

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
9. **In je prompt zonder Enter:** typt `hc keys` een commando met spaties, `&&` en pipes correct in, toets per toets?

## Uitkomst van de spike

Getest op 22 november 2026 in de Herdr-app, op branch `spike/perch` (niet gemerged).

1. **Waar hij zit:** in een venster zonder kader.
   - De achtergrond is echt doorzichtig: de papegaai staat los op de terminal, zonder kaartje of schaduw. Floating block en pane-header zijn dus niet meer nodig.
   - `mod.json` kan het venster zelf beschrijven (`"overlay": { "kind": "window", "frame": "none", "key": "parrot" }`), en `mod.open` opent en sluit het. In PR 1 bleek een eigen `parrot.toggle` via de knop beter; zie punt 5.
   - `herdr-app do parrot.<commando>` bereikt het venster. Zo kunnen de hook en de wachter hem later laten schrikken.
   - Een mod achter een symlink herlaadt niet bij opslaan. Het venster sluiten en opnieuw openen laadt de nieuwe versie; `install.sh` linkt opnieuw, zoals bij chartroom.
2. **Animatie:** Herdr raadt timers voor animatie af, want elke redraw hertekent het hele venster.
   - Rustig, meekijken en slapen zijn dus native: wiegen met `loop("top")` en de z's als tekst met `frames()`. Knipperen is één frame om de 4 à 7 seconden.
   - Alleen korte reeksen (schrikken, dansen, praten) lopen met een timer. Alle stemmingen tonen correct.
3. **De zsh-hook:** werkt.
   - Hij geeft de juiste exitcode, ook met pipes en `&&`, en geldige JSON, ook met aanhalingstekens en backslashes.
   - Hij staat als eerste in `precmd_functions`, zodat `$?` nog van het commando is. In PR 2 zet hij zich bij elk commando opnieuw vooraan, voor het geval een andere hook later voorkruipt.
4. **Snelheid:** `claude -p` met een eigen systeemprompt, alleen Read, Grep en Glob, en zonder MCP-servers geeft een antwoord in zo'n 4,5 s op Haiku en 5 s op Sonnet.
   - `--bare` valt af: dat gebruikt alleen een API-key, niet je abonnement.
   - Je eigen `~/.claude/CLAUDE.md` wordt mee geladen: het antwoord begon met "Captain". In PR 3 zoeken we hoe parrot zijn eigen toon houdt.
5. **De knop en het venster** (bijgesteld tijdens PR 1, na je test):
   - `at: "pointer"` werkt niet voor vensters, en Herdr onthoudt per `key` de eerste plek van een venster.
   - Een mod kent de grootte van het Herdr-venster niet. De knop meet die daarom één keer per sessie met een strookje van 2 punten hoog over de volle breedte (`width: 1`), en opent de papegaai dan rechtsboven.
   - De knop is de kopie van parrot die er altijd is. Hij opent en sluit de papegaai zelf als de tab verandert, en neemt ⌥⌘P (`parrot.toggle`).
   - Een papegaaivenster dat de knop niet zelf opende, zoals een bewaard venster van een oudere versie, sluit meteen.
6. **De wachter als achtergrondterminal:** een terminal van `hc run --bg --no-parent --name ...` verschijnt niet in je Herdr-venster.
7. **`hc events`** meldt alleen welk programma op de voorgrond draait (begin en einde van een commando), geen output. De wachter leest panes met een draaiend programma dus zelf, om de paar seconden.
8. **Vals alarm:** pas te meten in PR 5, met echte logs.
9. **In je prompt zonder Enter:**
   - `hc keys` kan geen `&` of `|` typen; shift wordt genegeerd.
   - zsh's `print -z` werkt wel: `hc send <t> " print -z -- '<cmd>'"` zet het commando klaar in de prompt, met `&&` en pipes, zonder het te starten. Het nadeel is één extra regel in de scrollback.
   - In PR 4 testen we klembord plus `terminal.paste`, dat onzichtbaar is.

## Bouwvolgorde

Elk stuk is een eigen PR die op zichzelf werkt.

1. **Papegaai op de kaart:** de mod op de plek die de spike kiest, de sprite met rustig, slapen en kijkt mee, de aan/uit-knop in de tabbalk met ⌥⌘P, en `install.sh` die de knop en de toetsen toevoegt zoals bij chartroom.
2. **Chatten met parrot:**
   - een klik op de papegaai opent een chat over het project van de terminal in je tab;
   - `claude -p` loopt in de map van die terminal en leest alleen;
   - de laatste output van de terminal gaat mee, met geheimen gemaskeerd;
   - doorvragen met `--resume`, één gesprek per project, en de papegaai denkt na terwijl je wacht.
3. **Schrikken bij terminalfouten, met suggesties bij typfouten:**
   - de zsh-hook, de events-map en opschrikken (de squawk verhuist naar de afwerking: `playSound` speelt alleen MP3, en hier is geen encoder om er een te maken);
   - een verkeerd getypt commando (`tetsts`, `gid`) meldt zsh's `command_not_found_handler` meteen;
   - je Claude zegt welk commando je waarschijnlijk bedoelde, en alleen je Claude (sinds planversie 8): Haiku, een paar seconden. Hij krijgt de regel, de exitcode, de gemaskeerde output (met de hint van de tool zelf erin), de scripts van het project, je aliassen en functies, en de commando's die je gebruikt. Kan Claude niet antwoorden, dan zegt de melding waarom;
   - één klik zet het commando in je terminal.
4. **Commando's uit de chat op je prompt** (naar voren gehaald in planversie 9, met "Ask Parrot why" uit 0.3.0 als uitleg bij fouten):
   - de berichten als chatbubbels in de kleuren van de papegaai: de jouwe blauw, de zijne zacht rood;
   - code in een afgerond blok, met onder elk shell-commando een groene link die het op je prompt zet (niet uitgevoerd, de pane krijgt de focus); wat iets weggooit, overschrijft of pusht krijgt een rode link;
   - "Clear chat" en `/clear` maken de chat van een project leeg.
5. **Run en controles:** de fix als één knop die hem ook draait (ook met meerdere stappen), het rode label met 3 seconden om te annuleren, het label Gecontroleerd of Vermoeden met de vaste lijst controles, en knoppen die je naar een pane, bestand of URL brengen.
6. **Afwerking:** de squawk (een MP3), stille modus, piratentaal aan of uit, modelkeuze, README met screenshots in licht en donker.

**Voorlopig buiten scope:** de wachter (draaiende programma's in andere panes, de logs van je stack, "Wat hij zag"), de CI van je PR en de browser-extensie.

## Versies

Parrot volgt [semver](https://semver.org). Tot alles uit de bouwvolgorde er is, blijft hij op 0.x, en elk stuk uit de bouwvolgorde is een minor-versie:

| Versie | Wat erbij komt |
|---|---|
| 0.1.0 | Papegaai op de kaart |
| 0.2.0 | Chatten met parrot |
| 0.3.0 | Schrikken bij terminalfouten, met suggesties bij typfouten |
| 0.4.0 | Commando's uit de chat op je prompt |
| 0.5.0 | Run en controles |
| 1.0.0 | Afwerking |

- **Fixes tussendoor** zijn patch-versies, zoals 0.3.1.
- **Eén plek voor het nummer:** het versienummer staat alleen in `package.json`. De mod toont het in de tooltip van de knop en `install.sh` drukt het af.
- **Elke versie** krijgt een stuk in `CHANGELOG.md` (Keep a Changelog) en een git-tag `vX.Y.Z`.
- **Zodra de repo op GitHub staat:** een release per tag, zoals bij portly.
- **Het plan** heeft een eigen planversie bovenaan. Die gaat omhoog als de koers verandert, en de schets toont dezelfde.

Testen met `bun test` voor de delen zonder app: de hook-regels lezen, output knippen tussen promptregels, geheimen maskeren, foutpatronen per bron (met geanonimiseerde logs als voorbeelden), gevaarlijke commando's herkennen, het antwoord in uitleg, stappen en navigatieknoppen splitsen.
