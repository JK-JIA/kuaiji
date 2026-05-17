/** 非 Android 壳内访问生产构建时展示（不提供网页版客户端） */
export function BrowserOnlyNotice() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-stone-100 px-6 text-center">
      <p className="text-lg font-semibold text-kj-primary">请使用 Android 应用</p>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-stone-500">
        不提供浏览器端界面。请安装官方 APK 使用；登录后数据存储在服务器数据库。
      </p>
    </div>
  )
}
