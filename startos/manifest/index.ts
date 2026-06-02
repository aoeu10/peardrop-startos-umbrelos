import { setupManifest } from '@start9labs/start-sdk'
import { long, short } from './i18n'

export const manifest = setupManifest({
  id: 'peardrop',
  title: 'PearDrop',
  license: 'MIT',
  packageRepo: 'https://github.com/Start9-Community/peardrop-startos',
  upstreamRepo: 'https://github.com/nicholasgriffintn/peardrop',
  marketingUrl: 'https://peardrop.org/',
  donationUrl: null,
  description: { short, long },
  volumes: ['main'],
  images: {
    peardrop: {
      source: {
        dockerBuild: {
          dockerfile: 'Dockerfile',
          workdir: '.',
        },
      },
      arch: ['x86_64', 'aarch64'],
    },
  },
  alerts: {
    install: null,
    update: null,
    uninstall: null,
    restore: null,
    start: null,
    stop: null,
  },
  dependencies: {},
})
