import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '1.1.1:0',
  releaseNotes: {
    en_US:
      '"Open file" / "reveal in folder" now work in the web UI: files download through your browser and folders open in a built-in file browser (with download links and folder archives). "Show log file" in Settings downloads the log. Fixes are cosmetic — the P2P engine is unchanged.',
    es_ES:
      '"Abrir archivo" / "mostrar en carpeta" ya funcionan en la Web UI: los archivos se descargan en tu navegador y las carpetas se abren en un explorador de archivos integrado, con enlaces de descarga y archivos comprimidos. "Mostrar registro" en Ajustes descarga el registro. El motor P2P no cambia.',
    de_DE:
      '"Datei öffnen" / "in Ordner anzeigen" funktionieren jetzt in der Weboberfläche: Dateien werden über den Browser heruntergeladen, Ordner öffnen sich in einem integrierten Dateibrowser (mit Download-Links und Ordnerarchiven). "Log-Datei anzeigen" in den Einstellungen lädt das Log herunter. Am P2P-Engine ändert sich nichts.',
    pl_PL:
      '"Otwórz plik" / "pokaż w folderze" działają teraz w Web UI: pliki pobierają się przez przeglądarkę, a foldery otwierają się we wbudowanej przeglądarce plików (z linkami pobierania i archiwami folderów). "Pokaż plik dziennika" w Ustawieniach pobiera dziennik. Silnik P2P bez zmian.',
    fr_FR:
      '« Ouvrir le fichier » / « afficher dans le dossier » fonctionnent désormais dans l’interface web : les fichiers se téléchargent via votre navigateur et les dossiers s’ouvrent dans un explorateur intégré (liens de téléchargement et archives de dossier). « Afficher le fichier journal » dans les réglages télécharge le journal. Le moteur P2P est inchangé.',
  },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
