import { useSearchParams } from 'react-router-dom'

export function useQueryParam(name: string): string {
  const [sp] = useSearchParams()
  return (sp.get(name) || '').toLowerCase()
}
