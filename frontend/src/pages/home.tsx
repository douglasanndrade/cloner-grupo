import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Zap, Copy, Shield, Clock, CreditCard, Users,
  ArrowRight, CheckCircle2, Star, ChevronRight,
} from 'lucide-react'

const features = [
  {
    icon: Copy,
    title: 'Clone Completo',
    desc: 'Copie todas as mensagens, fotos, vídeos e arquivos de qualquer grupo ou canal do Telegram.',
  },
  {
    icon: Zap,
    title: 'Dois Modos',
    desc: 'Forward rápido ou Download + Reupload sem marca de encaminhamento. Você escolhe.',
  },
  {
    icon: Shield,
    title: 'Seguro',
    desc: 'Suas credenciais ficam protegidas. Conexão direta com a API oficial do Telegram.',
  },
  {
    icon: Clock,
    title: 'Automático',
    desc: 'Configure e deixe rodando. O sistema clona em background com controle de velocidade.',
  },
  {
    icon: CreditCard,
    title: 'Pix Instantâneo',
    desc: 'Compre créditos via Pix e comece a clonar em segundos. Sem burocracia.',
  },
  {
    icon: Users,
    title: 'Multi-Conta',
    desc: 'Use várias contas Telegram simultaneamente para maior velocidade e segurança.',
  },
]

const plans = [
  {
    name: 'Básico',
    price: '29,90',
    desc: 'Grupos até 500 mensagens',
    color: 'from-green-500/20 to-green-500/5 border-green-500/30',
    accent: 'text-green-400',
    features: ['1 grupo por crédito', 'Até 500 mensagens', 'Forward ou Reupload', 'Suporte via Instagram'],
  },
  {
    name: 'Standard',
    price: '49,90',
    desc: 'Grupos de 501 a 1.000 mensagens',
    color: 'from-blue-500/20 to-blue-500/5 border-blue-500/30',
    accent: 'text-blue-400',
    popular: true,
    features: ['1 grupo por crédito', 'Até 1.000 mensagens', 'Forward ou Reupload', 'Suporte via Instagram'],
  },
  {
    name: 'Premium',
    price: '99,90',
    desc: 'Grupos com +1.000 mensagens',
    color: 'from-purple-500/20 to-purple-500/5 border-purple-500/30',
    accent: 'text-purple-400',
    features: ['1 grupo por crédito', 'Mensagens ilimitadas', 'Forward ou Reupload', 'Suporte prioritário'],
  },
]

export function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 h-16">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
              <Zap className="h-4.5 w-4.5 text-white" />
            </div>
            <span className="text-lg font-bold">Cloner Grupo</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" size="sm">Entrar</Button>
            </Link>
            <Link to="/register">
              <Button size="sm">
                Criar Conta <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-16 sm:pb-20 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 border border-primary/20 px-4 py-1.5 text-xs font-medium text-primary mb-6">
            <Zap className="h-3.5 w-3.5" />
            Plataforma profissional de clonagem
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight">
            Clone grupos e canais
            <br />
            <span className="bg-gradient-to-r from-primary via-purple-400 to-blue-400 bg-clip-text text-transparent">
              do Telegram
            </span>
          </h1>

          <p className="mt-5 sm:mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Copie mensagens, mídias e arquivos entre canais de forma rápida e segura.
            Modo Forward ou Reupload sem marca de encaminhamento.
          </p>

          <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <Link to="/register">
              <Button size="lg" className="w-full sm:w-auto text-base px-8 h-12">
                Começar Agora <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <a href="#planos">
              <Button variant="outline" size="lg" className="w-full sm:w-auto text-base px-8 h-12">
                Ver Planos
              </Button>
            </a>
          </div>

          {/* Stats */}
          <div className="mt-14 sm:mt-16 grid grid-cols-3 gap-6 sm:gap-12 max-w-lg mx-auto">
            <div>
              <p className="text-2xl sm:text-3xl font-bold text-foreground">2</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">Modos de clone</p>
            </div>
            <div>
              <p className="text-2xl sm:text-3xl font-bold text-foreground">4GB</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">Limite Premium</p>
            </div>
            <div>
              <p className="text-2xl sm:text-3xl font-bold text-foreground">Pix</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">Pagamento instantâneo</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 sm:py-24 border-t border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold">Tudo que você precisa</h2>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
              Ferramenta completa para clonar qualquer grupo ou canal do Telegram
            </p>
          </div>

          <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-border/50 bg-surface/50 p-6 hover:border-primary/30 hover:bg-surface transition-all"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/15 transition-colors">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 sm:py-24 border-t border-border/50 bg-surface/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold">Como funciona</h2>
            <p className="mt-3 text-muted-foreground">Em 3 passos simples</p>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {[
              { step: '1', title: 'Crie sua conta', desc: 'Cadastro rápido, sem verificação. Já entra direto no painel.' },
              { step: '2', title: 'Compre créditos', desc: 'Pague via Pix e receba os créditos instantaneamente na sua conta.' },
              { step: '3', title: 'Clone o grupo', desc: 'Informe origem e destino, escolha o modo e clique em clonar.' },
            ].map((s) => (
              <div key={s.step} className="text-center">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 text-2xl font-bold text-primary mb-4">
                  {s.step}
                </div>
                <h3 className="text-base font-semibold text-foreground">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="planos" className="py-16 sm:py-24 border-t border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold">Planos</h2>
            <p className="mt-3 text-muted-foreground">1 crédito = 1 grupo clonado</p>
          </div>

          <div className="grid gap-4 sm:gap-6 sm:grid-cols-3 max-w-4xl mx-auto">
            {plans.map((p) => (
              <div
                key={p.name}
                className={`relative rounded-2xl border bg-gradient-to-b ${p.color} p-6 ${p.popular ? 'ring-2 ring-primary' : ''}`}
              >
                {p.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[10px] font-bold text-white uppercase">
                    <Star className="h-3 w-3" /> Popular
                  </div>
                )}
                <div className="text-center pt-2">
                  <h3 className={`text-lg font-bold ${p.accent}`}>{p.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{p.desc}</p>
                  <div className="mt-4">
                    <span className="text-xs text-muted-foreground">R$</span>
                    <span className="text-4xl font-extrabold text-foreground ml-1">{p.price}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">por crédito</p>
                </div>

                <ul className="mt-6 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className={`h-4 w-4 shrink-0 ${p.accent}`} />
                      {f}
                    </li>
                  ))}
                </ul>

                <Link to="/register" className="block mt-6">
                  <Button className="w-full" variant={p.popular ? 'default' : 'outline'}>
                    Começar <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-24 border-t border-border/50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <div className="rounded-3xl bg-gradient-to-b from-primary/15 to-primary/5 border border-primary/20 p-8 sm:p-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
              Pronto para clonar?
            </h2>
            <p className="mt-3 text-muted-foreground max-w-md mx-auto">
              Crie sua conta agora e comece a clonar grupos do Telegram em minutos.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/register">
                <Button size="lg" className="w-full sm:w-auto px-8 h-12">
                  Criar Conta Grátis <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <a href="https://www.instagram.com/douglasanndrade2/" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="lg" className="w-full sm:w-auto px-8 h-12">
                  Falar no Instagram
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
              <Zap className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold">Cloner Grupo</span>
          </div>
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Cloner Grupo. Todos os direitos reservados.
          </p>
          <div className="flex gap-4">
            <Link to="/login" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Entrar</Link>
            <Link to="/register" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Criar Conta</Link>
            <a href="https://www.instagram.com/douglasanndrade2/" target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Instagram</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
