/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  /** 下载站 releases.json 完整 URL；不填时生产包默认 http://8.153.12.131:8080/releases.json */
  readonly VITE_ANDROID_RELEASES_JSON_URL?: string
  /** 豆包智能识别（火山方舟 API Key），勿提交到仓库 */
  readonly VITE_DOUBAO_API_KEY?: string
  /** 与方舟 chat/completions 的 model 一致：ep-xxxx 或文档中的模型端点 ID（如 doubao-1-5-lite-32k-250115） */
  readonly VITE_DOUBAO_MODEL?: string
  /**
   * 设为 true 时，生产构建在普通浏览器中也会加载完整应用（仅应急调试，勿用于对外站点）
   */
  readonly VITE_ALLOW_BROWSER?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
