import { useState } from 'react'
import { User } from 'lucide-react'
import type { UserAvatar } from '../../features/auth/services/avatarStore'

export interface UserAvatarViewProps {
  avatar?: UserAvatar | null
  email?: string | null
  name?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  shape?: 'circle' | 'squircle'
  className?: string
  alt?: string
}

const SIZE_CONFIGS = {
  xs: {
    container: 'h-6 w-6 text-[11px]',
    squircleRadius: 'rounded-lg',
  },
  sm: {
    container: 'h-7 w-7 text-xs',
    squircleRadius: 'rounded-xl',
  },
  md: {
    container: 'h-9 w-9 text-sm',
    squircleRadius: 'rounded-xl',
  },
  lg: {
    container: 'h-14 w-14 sm:h-16 sm:w-16 text-xl sm:text-2xl',
    squircleRadius: 'rounded-2xl',
  },
  xl: {
    container: 'h-24 w-24 sm:h-28 sm:w-28 text-3xl sm:text-4xl',
    squircleRadius: 'rounded-3xl',
  },
}

export function UserAvatarView({
  avatar,
  email,
  name,
  size = 'md',
  shape = 'squircle',
  className = '',
  alt = '用户头像',
}: UserAvatarViewProps) {
  const [imageError, setImageError] = useState(false)
  const config = SIZE_CONFIGS[size]
  const radiusClass = shape === 'circle' ? 'rounded-full' : config.squircleRadius

  // 1. Uploaded Custom Photo (Image)
  if (avatar?.type === 'image' && avatar.value && !imageError) {
    return (
      <div
        className={`relative overflow-hidden flex shrink-0 items-center justify-center border border-white/90 bg-white/80 shadow-[0_4px_16px_rgba(0,0,0,0.06),inset_0_1px_1.5px_rgba(255,255,255,1)] backdrop-blur-md select-none ${config.container} ${radiusClass} ${className}`}
      >
        <img
          src={avatar.value}
          alt={alt}
          onError={() => setImageError(true)}
          className="h-full w-full object-cover"
          draggable={false}
        />
      </div>
    )
  }

  // 2. Default Initial Letter Fallback (Paris Frosted Copper Glass)
  const initialSource = (name && name.trim()) || (email && email.trim()) || 'P'
  const letter = initialSource.charAt(0).toUpperCase()
  return (
    <div
      className={`relative overflow-hidden flex shrink-0 items-center justify-center font-display font-semibold tracking-tight border border-white/90 bg-gradient-to-br from-[#f8f1eb] via-white to-[#f4e6dc] text-[var(--copper)] shadow-[0_4px_16px_rgba(181,106,60,0.12),inset_0_1px_1.5px_rgba(255,255,255,1)] backdrop-blur-md select-none ${config.container} ${radiusClass} ${className}`}
    >
      {letter ? <span>{letter}</span> : <User size={size === 'sm' || size === 'xs' ? 13 : 20} />}
    </div>
  )
}
