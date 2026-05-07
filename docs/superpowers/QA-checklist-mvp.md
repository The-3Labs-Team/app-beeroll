# MVP QA Checklist

Manual smoke test for the MVP build.

## Prerequisiti
- [ ] yt-dlp e ffmpeg installati (`brew install yt-dlp ffmpeg`)
- [ ] API key Anthropic salvata via Settings (`Save & test` mostra ✓)
- [ ] Cartella `~/B-Roll Projects/` non esiste o è vuota

## Happy path
- [ ] App si apre su `/projects` e mostra "No projects yet"
- [ ] Nessun banner rosso "Missing tools" se yt-dlp e ffmpeg sono in PATH
- [ ] Click "+ New project" → form con campi name + textarea voiceover
- [ ] Inserisci nome "QA Test" e ~5 frasi di transcript di esempio
- [ ] Submit → loader → ReviewPage mostra ≥3 punti B-Roll con keyword
- [ ] Click "Start picking videos →" → PickerPage carica
- [ ] Vedi keyword grande in alto, grid 3x3 con thumbnails caricati
- [ ] Hover su thumbnail → vedi storyboards animati (su video >30s)
- [ ] Click su thumbnail → iframe carica e parte autoplay (muted)
- [ ] Click pulsante 🔇 → audio attivo
- [ ] Click "Download & use" → bottone diventa "Downloading…" → automaticamente passi al prossimo punto al termine del download
- [ ] Verifica file in `~/B-Roll Projects/qa-test/clips/0001_<title>.mp4`
- [ ] Apri il file: ha overlay "© <channel>" in basso a sinistra
- [ ] Premi → durante un punto → si salta al successivo, marker timeline diventa grigio (skipped)
- [ ] Premi ← → torni indietro al punto precedente
- [ ] Premi 1-9 → seleziona N-esimo video e carica iframe
- [ ] Premi Invio → conferma il selezionato (= "Download & use")
- [ ] Doppio click sulla keyword o ✎ → diventa editabile, modifica e Invio → ri-cerca
- [ ] Completa tutti i punti → arrivi a Summary
- [ ] "Open folder" → si apre Finder sulla cartella progetto

## Errori
- [ ] Settings: API key invalida (es. `sk-ant-fake`) → "Save & test" mostra errore rosso
- [ ] Settings: API key che non inizia con `sk-ant-` → errore validazione client
- [ ] Picker: keyword senza risultati → "No results. Try a different keyword."
- [ ] Picker: yt-dlp/ffmpeg non in PATH → banner rosso in ProjectsPage all'avvio

## Persistenza
- [ ] Crea progetto, scarica 2 clip, chiudi app
- [ ] Riapri app → progetto compare in lista projects
- [ ] Click su progetto → torna al primo punto non-done
- [ ] I clip già scaricati restano in `~/B-Roll Projects/<slug>/clips/`

## Note esecuzione
- Il primo download può essere lento (yt-dlp risolve formato + scarica + ffmpeg overlay).
- Se compare la richiesta di permessi macOS Keychain alla prima `Save & test`, accettare.
