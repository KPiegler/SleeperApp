/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SLEEPER_LEAGUE_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
