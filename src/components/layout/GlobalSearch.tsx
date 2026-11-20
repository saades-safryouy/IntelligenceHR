import { useMemo, useState } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import { getEmployees } from '../../data/employeeStore'
import type { Employee } from '../../types/models'

type SearchModule = {
  label: string
  to: string
}

type SearchResult =
  | { kind: 'employee'; employee: Employee }
  | { kind: 'module'; module: SearchModule }

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function employeeSearchText(employee: Employee) {
  return normalize(Object.values(employee).map((value) => String(value ?? '')).join(' '))
}

export function GlobalSearch({
  placeholder,
  modules,
  employeeTo,
  onNavigate,
}: {
  placeholder: string
  modules: SearchModule[]
  employeeTo: string
  onNavigate: (to: string) => void
}) {
  const [query, setQuery] = useState('')
  const normalizedQuery = normalize(query)
  const searchableModules = useMemo(() => modules.filter((module, index, all) => all.findIndex((item) => item.to === module.to) === index), [modules])
  const results = useMemo<SearchResult[]>(() => {
    if (!normalizedQuery) return []

    const employeeResults: SearchResult[] = getEmployees()
      .filter((employee) => employeeSearchText(employee).includes(normalizedQuery))
      .slice(0, 6)
      .map((employee) => ({ kind: 'employee', employee }))

    const moduleResults: SearchResult[] = searchableModules
      .filter((module) => normalize(module.label).includes(normalizedQuery))
      .slice(0, 4)
      .map((module) => ({ kind: 'module', module }))

    return [...moduleResults, ...employeeResults].slice(0, 8)
  }, [normalizedQuery, searchableModules])

  const navigate = (to: string) => {
    setQuery('')
    onNavigate(to)
  }

  return (
    <div className="global-search">
      <Search size={17} />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      <kbd>⌘ K</kbd>

      {query && (
        <div className="search-results">
          {results.length ? results.map((result) => {
            if (result.kind === 'module') {
              return (
                <button key={`module-${result.module.to}`} onClick={() => navigate(result.module.to)}>
                  <Search size={16} />
                  <span>
                    <strong>{result.module.label}</strong>
                    <small>Module</small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              )
            }

            const { employee } = result
            return (
              <button key={`employee-${employee.id}`} onClick={() => navigate(employeeTo)}>
                <div className="avatar">{employee.initials}</div>
                <span>
                  <strong>{employee.firstName} {employee.lastName}</strong>
                  <small>{employee.jobTitle} · {employee.department} · {employee.email}</small>
                </span>
                <ChevronRight size={15} />
              </button>
            )
          }) : (
            <span className="no-results">No matching modules or people found</span>
          )}
        </div>
      )}
    </div>
  )
}
