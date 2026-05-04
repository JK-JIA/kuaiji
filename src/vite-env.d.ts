/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  /** 豆包智能识别（火山方舟 API Key），勿提交到仓库 */
  readonly VITE_DOUBAO_API_KEY?: string
  /**
   * 设为 true 时，生产构建在普通浏览器中也会加载完整应用（仅应急调试，勿用于对外站点）
   */
  readonly VITE_ALLOW_BROWSER?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
