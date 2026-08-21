import { useState } from 'react'
import { User } from 'lucide-react'
import {
  AVATAR_GRADIENTS,
  type UserAvatar,
} from '../../features/auth/services/avatarStore'

export interface UserAvatarViewProps {
  avatar: UserAvatar
  email?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  shape?: 'circle' | 'squircle'
  className?: string
  alt?: string
}

const SIZE_CONFIGS = {
  xs: {
    container: 'h-6 w-6 text-[11px]',
    emoji: 'text-xs',
    squircleRadius: 'rounded-lg',
  },
  sm: {
    container: 'h-7 w-7 text-xs',
    emoji: 'text-sm',
    squircleRadius: 'rounded-xl',
  },
  md: {
    container: 'h-9 w-9 text-sm',
    emoji: 'text-base',
    squircleRadius: 'rounded-xl',
  },
  lg: {
    container: 'h-14 w-14 sm:h-16 sm:w-16 text-xl sm:text-2xl',
    emoji: 'text-2xl sm:text-3xl',
    squircleRadius: 'rounded-2xl',
  },
  xl: {
    container: 'h-20 w-20 sm:h-24 sm:w-24 text-2xl sm:text-3xl',
    emoji: 'text-4xl',
    squircleRadius: 'rounded-3xl',
  },
}

export function UserAvatarView({
  avatar,
  email,
  size = 'md',
  shape = 'squircle',
  className = '',
  alt = '用户头像',
}: UserAvatarViewProps) {
  const [imageError, setImageError] = useState(false)
  const config = SIZE_CONFIGS[size]
  const radiusClass = shape === 'circle' ? 'rounded-full' : config.squircleRadius

  const gradient =
    AVATAR_GRADIENTS[
      typeof avatar.gradientIndex === 'number' &&
      avatar.gradientIndex >= 0 &&
      avatar.gradientIndex < AVATAR_GRADIENTS.length
        ? avatar.gradientIndex
        : 0
    ]

  // 1. Uploaded Custom Photo (Image)
  if (avatar.type === 'image' && avatar.value && !imageError) {
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

  // 2. French Aesthetic Emoji
  if (avatar.type === 'emoji' && avatar.value) {
    return (
      <div
        className={`relative overflow-hidden flex shrink-0 items-center justify-center border border-white/90 shadow-[0_4px_16px_rgba(0,0,0,0.06),inset_0_1px_1.5px_rgba(255,255,255,1)] backdrop-blur-md select-none ${gradient.className} ${config.container} ${radiusClass} ${className}`}
      >
        <span className={`${config.emoji} leading-none drop-shadow-2xs`}>
          {avatar.value}
        </span>
      </div>
    )
  }

  // 3. Custom Monogram Letters
  if (avatar.type === 'monogram' && avatar.value) {
    return (
      <div
        className={`relative overflow-hidden flex shrink-0 items-center justify-center font-display font-semibold tracking-tight border shadow-[0_4px_16px_rgba(0,0,0,0.06),inset_0_1px_1.5px_rgba(255,255,255,1)] backdrop-blur-md select-none ${gradient.className} ${config.container} ${radiusClass} ${className}`}
      >
        <span>{avatar.value.toUpperCase()}</span>
      </div>
    )
  }

  // 4. Default Initial Letter Fallback
  const letter = (avatar.value || (email ? email.charAt(0) : 'P')).toUpperCase()
  return (
    <div
      className={`relative overflow-hidden flex shrink-0 items-center justify-center font-display font-semibold tracking-tight border border-white/90 bg-gradient-to-br from-[#f8f1eb] via-white to-[#f4e6dc] text-[var(--copper)] shadow-[0_4px_16px_rgba(181,106,60,0.12),inset_0_1px_1.5px_rgba(255,255,255,1)] backdrop-blur-md select-none ${config.container} ${radiusClass} ${className}`}
    >
      {letter ? <span>{letter}</span> : <User size={size === 'sm' || size === 'xs' ? 13 : 20} />}
    </div>
  )
}
