import { useDispatch, useSelector } from 'react-redux'

// Minimal hooks shim for strict-optional typecheck to avoid importing full store types
export const useAppDispatch = () => useDispatch<any>()
export function useAppSelector<T>(selector: (state: any) => T): T {
  return useSelector(selector as any) as T
}
