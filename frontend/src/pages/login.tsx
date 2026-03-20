import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { authApi } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Copy, Eye, EyeOff, Lock, Mail } from 'lucide-react'

export function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!username.trim() || !password.trim()) {
      setError('Preencha todos os campos')
      return
    }

    setLoading(true)
    try {
      const res = await authApi.login({ username: username.trim(), password })
      login(res.data.token, res.data.username, res.data.is_admin)
      navigate('/')
    } catch (err: any) {
      setError(err.message || 'Erro ao fazer login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo / Title */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-2">
            <Copy className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Cloner Grupo</h1>
          <p className="text-muted-foreground text-sm">
            Faça login para acessar o painel
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Entrar</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <Input
                    id="username"
                    type="email"
                    placeholder="seu@email.com"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-10"
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Sua senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Entrando...' : 'Entrar'}
              </Button>

              <div className="flex items-center justify-between text-sm">
                <Link to="/forgot-password" className="text-muted-foreground hover:text-primary transition-colors">
                  Esqueci minha senha
                </Link>
                <Link to="/register" className="text-primary font-medium hover:underline">
                  Criar conta
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted">
          Cloner Grupo &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
