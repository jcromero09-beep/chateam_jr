import { createContext, useContext, ReactNode } from 'react'
import { useAuth as useAuthHook, User } from '../../hooks/useAuth'
import { Socket } from 'socket.io-client'

interface AuthContextType {
    isAuthenticated: boolean
    user: User | null
    loading: boolean
    login: (email: string, password: string, force?: boolean) => Promise<any>
    logout: () => Promise<void>
    socket: Socket | null
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
    children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
    const auth = useAuthHook()

    return (
        <AuthContext.Provider value={auth}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (context === undefined) {
        // Fallback to direct hook usage if not wrapped in provider
        // This maintains backward compatibility
        return undefined
    }
    return context
}

export default AuthContext
