import { runMain as _runMain } from 'citty'
import { main } from './main'

export const runMain = (): Promise<void> => _runMain(main)
