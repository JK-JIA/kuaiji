/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  /** 豆包智能识别（火山方舟 API Key），勿提交到仓库 */
  readonly VITE_DOUBAO_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
