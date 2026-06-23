import { create } from 'zustand'
import type { ConnectedAccount } from '@shared/types'

interface AccountState {
  accounts: ConnectedAccount[]
  activeAccountId: string | null
  setAccounts: (accounts: ConnectedAccount[]) => void
  setActive: (id: string | null) => void
  getActive: () => ConnectedAccount | null
}

export const useAccountStore = create<AccountState>((set, get) => ({
  accounts: [],
  activeAccountId: null,
  setAccounts: (accounts) => set({ accounts }),
  setActive: (id) => set({ activeAccountId: id }),
  getActive: () => {
    const { accounts, activeAccountId } = get()
    return accounts.find((a) => a.id === activeAccountId) ?? null
  }
}))
