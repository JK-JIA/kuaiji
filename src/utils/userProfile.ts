const STORAGE_KEY = 'kuaiji_user_profile_v1'

export type UserProfile = {
  nickname: string
  avatarDataUrl: string | null
  bio: string
  gender: string
  birthday: string
  monthlyIncome: string
  userId: string
}

const DEFAULT_PROFILE: Omit<UserProfile, 'userId'> = {
  nickname: 'kuaiji',
  avatarDataUrl: null,
  bio: '',
  gender: '',
  birthday: '',
  monthlyIncome: '',
}

function newUserId(): string {
  return String(10000 + Math.floor(Math.random() * 90000))
}

function loadRaw(): UserProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { ...DEFAULT_PROFILE, userId: newUserId() }
    }
    const j = JSON.parse(raw) as Partial<UserProfile>
    return {
      nickname:
        typeof j.nickname === 'string' && j.nickname.trim()
          ? j.nickname.trim()
          : DEFAULT_PROFILE.nickname,
      avatarDataUrl:
        typeof j.avatarDataUrl === 'string' ? j.avatarDataUrl : null,
      bio: typeof j.bio === 'string' ? j.bio : '',
      gender: typeof j.gender === 'string' ? j.gender : '',
      birthday: typeof j.birthday === 'string' ? j.birthday : '',
      monthlyIncome: typeof j.monthlyIncome === 'string' ? j.monthlyIncome : '',
      userId:
        typeof j.userId === 'string' && j.userId.trim()
          ? j.userId.trim()
          : newUserId(),
    }
  } catch {
    return { ...DEFAULT_PROFILE, userId: newUserId() }
  }
}

export function readUserProfile(): UserProfile {
  return loadRaw()
}

export function saveUserProfile(patch: Partial<UserProfile>): UserProfile {
  const next = { ...loadRaw(), ...patch }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* quota — drop avatar if needed */
    if (patch.avatarDataUrl) {
      const slim = { ...next, avatarDataUrl: null }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim))
      return slim
    }
  }
  return next
}

export function displayNickname(profile: UserProfile): string {
  return profile.nickname.trim() || 'kuaiji'
}
