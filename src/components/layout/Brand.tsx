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
          alt="IntillegenceHR"
        />
      </div>

      {!compact && (
        <div>
          <strong>
            Intillgence<span>HR</span>
          </strong>

          <small>
            INTILLIGENCE AGENCY
          </small>
        </div>
      )}
    </div>
  )
}

