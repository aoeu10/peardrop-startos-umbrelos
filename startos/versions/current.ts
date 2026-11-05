import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '1.1.0:0',
  releaseNotes: {
    en_US:
      'Rebuilt on the new PearDrop desktop app (upstream peardrive/peardrop-desktop v0.29.0). The StartOS Web UI is now the real PearDrop React interface — sidebar library layout, Pear/Paper themes, per-drive cards and downloads — served by a headless engine host over the browser. Data moves from /data/peardrop to /data/.peardrop (migrated automatically on first launch). Actions were redesigned: Engine Status, Downloaded Files, Copy Downloads, and Engine Logs replace the old history-based tools.',
    es_ES:
      'Actualiza el motor de escritorio PearDrop incluido de 0.18.0 a 0.25.0. Incluye recuperación persistente de recursos compartidos, manejo de rutas más seguro, guardado atómico del estado, detección de transferencias bloqueadas, validación más estricta de enlaces, mejor manejo de duplicados y el descargador reforzado actual. La Web UI y las Actions de StartOS siguen disponibles.',
    de_DE:
      'Aktualisiert die gebündelte PearDrop-Desktop-Engine von 0.18.0 auf 0.25.0. Enthält persistente Wiederherstellung von Freigaben, sicherere Pfadbehandlung, atomare Statusspeicherung, Erkennung blockierter Übertragungen, strengere Link-Prüfung, verbesserte Duplikatbehandlung und den aktuellen gehärteten Downloader. StartOS Web UI und Actions bleiben verfügbar.',
    pl_PL:
      'Aktualizuje dołączony silnik PearDrop Desktop z wersji 0.18.0 do 0.25.0. Obejmuje trwałe przywracanie udostępnień, bezpieczniejszą obsługę ścieżek, atomowy zapis stanu, wykrywanie zawieszonych transferów, ściślejszą walidację linków, lepszą obsługę duplikatów i aktualny wzmocniony moduł pobierania. Web UI i Actions StartOS pozostają dostępne.',
    fr_FR:
      'Met à jour le moteur de bureau PearDrop intégré de 0.18.0 à 0.25.0. Inclut la reprise persistante des partages, une gestion plus sûre des chemins, l’enregistrement atomique de l’état, la détection des transferts bloqués, une validation renforcée des liens, une meilleure gestion des doublons et le téléchargeur renforcé actuel. La Web UI et les Actions StartOS restent disponibles.',
  },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
