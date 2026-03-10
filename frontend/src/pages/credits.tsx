import { useState, useEffect } from 'react'
import { Coins, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { authApi } from '@/services/api'

interface Credits {
  basic: number
  standard: number
  premium: number
}

export function CreditsPage() {
  const [credits, setCredits] = useState<Credits>({ basic: 0, standard: 0, premium: 0 })
  const [loading, setLoading] = useState(true)

  const fetchCredits = () => {
    setLoading(true)
    authApi.me()
      .then((res) => {
        setCredits({
          basic: res.data.credits_basic ?? 0,
          standard: res.data.credits_standard ?? 0,
          premium: res.data.credits_premium ?? 0,
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchCredits()
  }, [])

  const totalCredits = credits.basic + credits.standard + credits.premium

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Créditos</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie seus créditos de clonagem
          </p>
        </div>
        <Button variant="outline" onClick={fetchCredits} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Total */}
      <Card className="border-primary/30">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Coins className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total de Créditos</p>
              <p className="text-3xl font-bold text-foreground">{totalCredits}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Credit tiers */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Básico</CardTitle>
            <CardDescription>Grupos até 500 mensagens</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-foreground">{credits.basic}</div>
            <p className="text-xs text-muted-foreground mt-1">créditos disponíveis</p>
            <div className="mt-4 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${Math.min((credits.basic / 50) * 100, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Standard</CardTitle>
            <CardDescription>Grupos de 501 a 1000 mensagens</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-foreground">{credits.standard}</div>
            <p className="text-xs text-muted-foreground mt-1">créditos disponíveis</p>
            <div className="mt-4 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${Math.min((credits.standard / 50) * 100, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Premium</CardTitle>
            <CardDescription>Grupos com +1000 mensagens</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-foreground">{credits.premium}</div>
            <p className="text-xs text-muted-foreground mt-1">créditos disponíveis</p>
            <div className="mt-4 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-purple-500 transition-all"
                style={{ width: `${Math.min((credits.premium / 50) * 100, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info */}
      <Card>
        <CardContent className="pt-6">
          <div className="text-sm text-muted-foreground space-y-2">
            <p><strong>Como funciona:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>Básico</strong> — 1 crédito por grupo com até 500 mensagens</li>
              <li><strong>Standard</strong> — 1 crédito por grupo de 501 a 1.000 mensagens</li>
              <li><strong>Premium</strong> — 1 crédito por grupo com mais de 1.000 mensagens</li>
            </ul>
            <p className="mt-3">
              Para adquirir créditos adicionais, entre em contato com o administrador.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
