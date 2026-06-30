import jwt from 'jsonwebtoken'

/** 访问令牌有效期（到期前客户端会自动续期） */
const ACCESS_EXPIRY = '30d'
/** 续期令牌有效期：长期保持登录，无需用户重新验证 */
const REFRESH_EXPIRY = '730d'
/** 旧版仅 access 令牌、已过期时仍允许换发新凭证的宽限期 */
const ACCESS_GRACE_SEC = 180 * 24 * 3600

type TokenClaims = {
  sub?: string
  typ?: 'access' | 'refresh'
  exp?: number
}

export function issueAuthTokens(userId: string, jwtSecret: string) {
  const token = jwt.sign(
    { sub: userId, typ: 'access' },
    jwtSecret,
    { expiresIn: ACCESS_EXPIRY },
  )
  const refreshToken = jwt.sign(
    { sub: userId, typ: 'refresh' },
    jwtSecret,
    { expiresIn: REFRESH_EXPIRY },
  )
  return { token, refreshToken }
}

/** 校验访问令牌（兼容无 typ 的旧令牌） */
export function userIdFromAccessToken(
  token: string,
  jwtSecret: string,
): string | null {
  try {
    const p = jwt.verify(token, jwtSecret) as TokenClaims
    if (p.typ && p.typ !== 'access') return null
    return typeof p.sub === 'string' ? p.sub : null
  } catch {
    return null
  }
}

/** 用 refresh 或（宽限期内）已过期的 access 换取 userId */
export function userIdForTokenRefresh(opts: {
  refreshToken?: string | null
  accessToken?: string | null
  jwtSecret: string
}): string | null {
  const { refreshToken, accessToken, jwtSecret } = opts

  if (refreshToken?.trim()) {
    try {
      const p = jwt.verify(refreshToken.trim(), jwtSecret) as TokenClaims
      if (p.typ === 'refresh' && typeof p.sub === 'string') return p.sub
    } catch {
      /* 尝试 access 迁移路径 */
    }
  }

  if (!accessToken?.trim()) return null

  try {
    const p = jwt.verify(accessToken.trim(), jwtSecret, {
      ignoreExpiration: true,
    }) as TokenClaims
    if (p.typ === 'refresh') return null
    if (p.typ && p.typ !== 'access') return null
    if (typeof p.sub !== 'string') return null

    if (typeof p.exp === 'number') {
      const nowSec = Math.floor(Date.now() / 1000)
      if (p.exp >= nowSec) {
        // 未过期的 access：补发 refresh（旧客户端升级）
        return p.sub
      }
      if (nowSec - p.exp > ACCESS_GRACE_SEC) return null
    }
    return p.sub
  } catch {
    return null
  }
}
