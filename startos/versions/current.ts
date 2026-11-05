import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '1.1.0:0',
  releaseNotes: {
    en_US:
      'Rebuilt on the new PearDrop desktop app (upstream peardrive/peardrop-desktop v0.29.0). The StartOS Web UI is now the real PearDrop React interface — sidebar library layout, Pear/Paper themes, per-drive cards and downloads — served by a headless engine host over the browser. Data moves from /data/peardrop to /data/.peardrop (migrated automatically on first launch). Actions were redesigned: Engine Status, Downloaded Files, Copy Downloads, and Engine Logs replace the old history-based tools.',
    es_ES:
      'Reconstruido sobre la nueva aplicación de escritorio PearDrop (peardrive/peardrop-desktop v0.29.0). La Web UI de StartOS ahora es la interfaz React real de PearDrop, servida por un motor sin cabeza en el servidor. Los datos migran de /data/peardrop a /data/.peardrop automáticamente. Actions rediseñadas: estado del motor, archivos descargados, copiar descargas y registros.',
    de_DE:
      'Neu aufgebaut auf der neuen PearDrop-Desktop-App (peardrive/peardrop-desktop v0.29.0). Die StartOS-Weboberfläche ist jetzt die echte PearDrop-React-Oberfläche, bereitgestellt von einem kopflosen Engine-Host. Daten wandern automatisch von /data/peardrop nach /data/.peardrop. Neue Actions: Engine-Status, heruntergeladene Dateien, Downloads kopieren, Engine-Logs.',
    pl_PL:
      'Przebudowano na nową aplikację PearDrop Desktop (peardrive/peardrop-desktop v0.29.0). Web UI w StartOS to teraz prawdziwy interfejs React PearDrop, serwowany przez silnik działający bez GUI. Dane migrują automatycznie z /data/peardrop do /data/.peardrop. Nowe akcje: status silnika, pobrane pliki, kopiowanie pobrań, logi silnika.',
    fr_FR:
      'Reconstruit sur la nouvelle application PearDrop Desktop (peardrive/peardrop-desktop v0.29.0). L’interface web de StartOS est désormais la vraie interface React de PearDrop, servie par un moteur headless. Les données migrent automatiquement de /data/peardrop vers /data/.peardrop. Actions repensées : état du moteur, fichiers téléchargés, copie des téléchargements, journaux.',
  },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
