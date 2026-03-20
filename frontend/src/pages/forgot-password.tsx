import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Copy, ArrowLeft, MessageCircle } from 'lucide-react'

export function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-2">
            <Copy className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Cloner Grupo</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recuperar Senha</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center py-4 text-center">
              <MessageCircle className="h-12 w-12 text-primary mb-4" />
              <p className="text-sm text-foreground font-medium">
                Entre em contato com o administrador
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Para resetar sua senha, envie uma mensagem para o suporte informando o email da sua conta. O administrador irá gerar uma nova senha para você.
              </p>
            </div>

            <Link to="/login" className="block">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar ao login
              </Button>
            </Link>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted">
          Cloner Grupo &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
