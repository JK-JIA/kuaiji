/**
 * 语音诊断曾用于界面展示；已移除 UI，保留空实现以免调用方报错。
 * 开发时可在控制台过滤 [ASR]（见 volcAsrClient 如需恢复）。
 */

export function subscribeAsrDiag(_onStoreChange: () => void): () => void {
  return () => {}
}

export function getAsrDiagSnapshot(): string {
  return ''
}

export function clearAsrDiag(): void {}

export function asrDiagLog(_message: string): void {}
