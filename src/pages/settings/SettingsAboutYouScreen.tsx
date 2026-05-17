import { useCallback, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getStoredPhone } from '../../api/ledgerClient'
import {
  displayNickname,
  readUserProfile,
  saveUserProfile,
  type UserProfile,
} from '../../utils/userProfile'
import { SETTINGS_SHELL_BG, SettingsSubHeader } from './settingsShell'

function maskPhone(raw: string | null | undefined): string {
  const d = (raw ?? '').replace(/\D/g, '')
  if (d.length >= 11) return `${d.slice(0, 3)}****${d.slice(-4)}`
  return '未绑定'
}

function unsetLabel(v: string) {
  return v.trim() || '未设置'
}

function IconPencil() {
  return (
    <svg
      className="h-4 w-4 text-kj-muted"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
      />
    </svg>
  )
}

function IconCopy() {
  return (
    <svg
      className="h-4 w-4 text-kj-muted"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function ProfileRow({
  label,
  value,
  placeholder,
  onEdit,
  action,
}: {
  label: string
  value: string
  placeholder?: boolean
  onEdit?: () => void
  action?: 'edit' | 'copy'
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      disabled={!onEdit}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-stone-50 bg-kj-raised disabled:active:bg-transparent active:bg-kj-hover"
    >
      <span className="w-16 shrink-0 text-[15px] text-kj-secondary">
        {label}
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-[15px] ${
          placeholder
            ? 'text-kj-muted'
            : 'text-kj-primary'
        }`}
      >
        {value}
      </span>
      {onEdit ? (
        <span className="shrink-0">{action === 'copy' ? <IconCopy /> : <IconPencil />}</span>
      ) : null}
    </button>
  )
}

function ProfileCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-kj-surface shadow-[0_1px_4px_rgba(15,23,42,0.06)] ">
      {children}
    </div>
  )
}

type Props = {
  onBack: () => void
  onOpenAccount: () => void
}

export function SettingsAboutYouScreen({ onBack, onOpenAccount }: Props) {
  const { token, logout } = useAuth()
  const [profile, setProfile] = useState<UserProfile>(() => readUserProfile())
  const fileRef = useRef<HTMLInputElement>(null)
  const phone = maskPhone(getStoredPhone())
  const nickname = displayNickname(profile)

  const refresh = useCallback((patch: Partial<UserProfile>) => {
    const next = saveUserProfile(patch)
    setProfile(next)
    return next
  }, [])

  const editText = (label: string, current: string) => {
    const v = window.prompt(`编辑${label}`, current)
    if (v === null) return
    return v.trim()
  }

  const onAvatarPick = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('图片请小于 2MB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const url = reader.result
      if (typeof url === 'string') refresh({ avatarDataUrl: url })
    }
    reader.readAsDataURL(file)
  }

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(profile.userId)
      alert('已复制 ID')
    } catch {
      alert(`ID：${profile.userId}`)
    }
  }

  return (
    <div className={SETTINGS_SHELL_BG}>
      <SettingsSubHeader title="关于你" onBack={onBack} />
      <div className="mx-auto max-w-lg px-4 pb-10">
        <div className="flex flex-col items-center py-6">
          <div className="relative">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative block h-24 w-24 overflow-hidden rounded-full bg-gradient-to-br from-teal-400 to-cyan-600 shadow-md ring-4 ring-white"
              aria-label="更换头像"
            >
              {profile.avatarDataUrl ? (
                <img
                  src={profile.avatarDataUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-3xl font-bold text-white">
                  {nickname.charAt(0).toUpperCase()}
                </span>
              )}
            </button>
            <span className="pointer-events-none absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-stone-800 text-white">
              <IconPencil />
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                onAvatarPick(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>
        </div>

        <div className="space-y-3">
          <ProfileCard>
            <ProfileRow
              label="昵称"
              value={nickname}
              onEdit={() => {
                const v = editText('昵称', profile.nickname)
                if (v !== undefined && v) refresh({ nickname: v })
              }}
            />
            <div className="border-t border-kj-border" />
            <ProfileRow
              label="手机"
              value={phone}
              placeholder={phone === '未绑定'}
              onEdit={() => onOpenAccount()}
            />
            <div className="border-t border-kj-border" />
            <ProfileRow
              label="ID"
              value={profile.userId}
              onEdit={() => void copyId()}
              action="copy"
            />
          </ProfileCard>

          <ProfileCard>
            <ProfileRow
              label="简介"
              value={profile.bio.trim() || '介绍一下自己'}
              placeholder={!profile.bio.trim()}
              onEdit={() => {
                const v = editText('简介', profile.bio)
                if (v !== undefined) refresh({ bio: v })
              }}
            />
          </ProfileCard>

          <ProfileCard>
            <ProfileRow
              label="性别"
              value={unsetLabel(profile.gender)}
              placeholder={!profile.gender}
              onEdit={() => {
                const v = window.prompt('性别（男 / 女，留空清除）', profile.gender)
                if (v === null) return
                const t = v.trim()
                if (t && t !== '男' && t !== '女') {
                  alert('请填写「男」或「女」')
                  return
                }
                refresh({ gender: t })
              }}
            />
            <div className="border-t border-kj-border" />
            <ProfileRow
              label="生日"
              value={unsetLabel(profile.birthday)}
              placeholder={!profile.birthday}
              onEdit={() => {
                const v = window.prompt('生日（如 1990-05-16）', profile.birthday)
                if (v === null) return
                refresh({ birthday: v.trim() })
              }}
            />
            <div className="border-t border-kj-border" />
            <ProfileRow
              label="月收入"
              value={unsetLabel(profile.monthlyIncome)}
              placeholder={!profile.monthlyIncome}
              onEdit={() => {
                const v = window.prompt('月收入（如 8000-12000）', profile.monthlyIncome)
                if (v === null) return
                refresh({ monthlyIncome: v.trim() })
              }}
            />
          </ProfileCard>
        </div>

        {token ? (
          <button
            type="button"
            onClick={() => {
              if (window.confirm('确定退出登录？')) logout()
            }}
            className="mt-8 w-full rounded-full border border-kj-border-strong bg-kj-surface py-3.5 text-[16px] font-medium text-red-500 shadow-sm transition-colors active:bg-red-50 border-kj-border-strong"
          >
            退出登录
          </button>
        ) : null}
      </div>
    </div>
  )
}
