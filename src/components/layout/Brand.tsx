import type { Theme } from '../../contexts/I18nContext'
import logo from '../../assets/IAgency_logo.png'
import lightLogo from '../../assets/IAgency_light_logo.png'

export function Brand({
  compact = false,
  theme,
  darkSurface = false,
}: {
  compact?: boolean
  theme: Theme
  darkSurface?: boolean
}) {
  return (
    <div className="brand">
      <div className="brand-mark">
        <img
          src={theme === 'light' && !darkSurface ? logo : lightLogo}
          alt="IntelligenceHR"
        />
      </div>

      {!compact && (
        <div>
          <strong>
            Intelligence<span>HR</span>
          </strong>

          <small>
            INTELLIGENCE AGENCY
          </small>
        </div>
      )}
    </div>
  )
}

