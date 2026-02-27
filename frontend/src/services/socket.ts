import { io, Socket } from 'socket.io-client'

class SocketService {
  private static instance: SocketService | null = null
  private socket: Socket | null = null
  private companyId: number | null = null
  private userId: number | null = null

  private constructor() {}

  static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService()
    }
    return SocketService.instance
  }

  connect(companyId: number, userId: number): Socket {
    if (this.socket && this.socket.connected && this.companyId === companyId) {
      return this.socket
    }

    // Disconnect existing socket if company changed
    if (this.socket) {
      this.socket.disconnect()
    }

    this.companyId = companyId
    this.userId = userId

    // Siempre conectar directamente al backend para websockets
    // El proxy de Vite no maneja bien los namespaces de socket.io
    const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'

    console.log(`Conectando socket a: ${backendUrl}/${companyId}`)

    this.socket = io(`${backendUrl}/${companyId}`, {
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
      query: { userId: String(userId) },
      // Forzar usar websocket primero
      transports: ['websocket', 'polling']
    })

    this.socket.on('connect', () => {
      console.log(`Socket.IO conectado al namespace /${companyId}`)
    })

    this.socket.on('disconnect', (reason) => {
      console.log('Socket.IO desconectado:', reason)
    })

    this.socket.on('connect_error', (error) => {
      console.error('Error de conexion Socket.IO:', error.message)
    })

    // Debug: log all incoming events
    this.socket.onAny((eventName, ...args) => {
      console.log('Socket event received:', eventName, args)
    })

    return this.socket
  }

  getSocket(): Socket | null {
    return this.socket
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
      this.companyId = null
      this.userId = null
    }
  }

  on(event: string, callback: (...args: any[]) => void): void {
    if (this.socket) {
      this.socket.on(event, callback)
    }
  }

  off(event: string, callback?: (...args: any[]) => void): void {
    if (this.socket) {
      if (callback) {
        this.socket.off(event, callback)
      } else {
        this.socket.off(event)
      }
    }
  }

  emit(event: string, data: any): void {
    if (this.socket) {
      this.socket.emit(event, data)
    }
  }
}

export const socketService = SocketService.getInstance()
export default socketService
