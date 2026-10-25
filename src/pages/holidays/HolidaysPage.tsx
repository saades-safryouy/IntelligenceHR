import { useEffect, useState } from 'react'
import { ModulePage } from '../../components/common/ModulePage'
import { getHolidays } from '../../data/employeeStore'
import { holidayRepository } from '../../data/mockRepository'
import { isApiDataMode } from '../../lib/apiClient'
import type { Holiday } from '../../types/models'

export function HolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>(() => (!isApiDataMode ? getHolidays() : []))

  useEffect(() => {
    if (!isApiDataMode) return
    let active = true
    holidayRepository
      .list()
      .then((result) => {
        if (active) setHolidays(result.data)
      })
      .catch(() => {
        if (active) setHolidays([])
      })
    return () => {
      active = false
    }
  }, [])

  return <ModulePage title="Holidays" data={holidays} />
}

