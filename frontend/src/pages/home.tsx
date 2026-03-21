import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Zap, Copy, Shield, Clock, CreditCard, Users,
  ArrowRight, CheckCircle2, Star, ChevronRight,
  Download, Forward, Video,
} from 'lucide-react'

const features = [
  {
    icon: Copy,
    title: 'Clone Completo',
    desc: 'Copia todas as mensagens, fotos, vídeos e arquivos de qualquer grupo ou canal.',
  },
  {
    icon: Download,
    title: 'Modo Reupload',
    desc: 'Baixa e reenvia sem "Encaminhado de...". Cópia limpa como se fosse conteúdo original.',
  },
  {
    icon: Forward,
    title: 'Modo Forward',
    desc: 'Encaminha direto sem baixar. Mais rápido, sem limite de tamanho de arquivo.',
  },
  {
    icon: Video,
    title: 'Vídeos até 4GB',
    desc: 'Contas Telegram Premium suportam arquivos até 4GB. Contas normais até 2GB.',
  },
  {
    icon: CreditCard,
    title: 'Pague via Pix',
    desc: 'Compre créditos por Pix. Pagamento confirmado na hora, sem esperar.',
  },
  {
    icon: Clock,
    title: '100% Automático',
    desc: 'Clique em clonar e pronto. O sistema faz tudo sozinho em background.',
  },
]

const steps = [
  { step: '1', title: 'Crie sua conta', desc: 'Cadastro grátis com email. Confirma e já entra no painel.' },
  { step: '2', title: 'Compre créditos', desc: 'Escolha o plano, pague via Pix. Créditos liberam na hora.' },
  { step: '3', title: 'Clone o grupo', desc: 'Informe o grupo de origem e destino. Clique em clonar e pronto.' },
]

const faqs = [
  {
    q: 'O que é um crédito?',
    a: '1 crédito = 1 grupo clonado. O tipo do crédito depende da quantidade de mensagens do grupo (Básico até 500, Standard até 1.000, Premium acima de 1.000).',
  },
  {
    q: 'Qual a diferença entre Forward e Reupload?',
    a: 'Forward encaminha direto (rápido, sem limite de tamanho). Reupload baixa e reenvia sem a marca "Encaminhado de..." (cópia limpa, limite de 2GB ou 4GB com Telegram Premium).',
  },
  {
    q: 'Preciso de conta Premium no Telegram?',
    a: 'Não é obrigatório. Contas normais clonam arquivos até 2GB. Com Telegram Premium o limite sobe pra 4GB por arquivo.',
  },
  {
    q: 'Em quanto tempo o Pix é confirmado?',
    a: 'Instantâneo. Assim que o banco confirma, os créditos aparecem na sua conta automaticamente.',
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
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight">
            Copie qualquer grupo do
            <br />
            <span className="bg-gradient-to-r from-primary via-purple-400 to-blue-400 bg-clip-text text-transparent">
              Telegram em minutos
            </span>
          </h1>

          <p className="mt-5 sm:mt-6 text-base sm:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Escolha o grupo, clique em clonar. Todas as mensagens, fotos, vídeos
            e arquivos são copiados para o destino. Simples assim.
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
          <div className="mt-14 sm:mt-16 grid grid-cols-3 gap-6 sm:gap-12 max-w-md mx-auto">
            <div>
              <p className="text-2xl sm:text-3xl font-bold text-foreground">2GB</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">Conta normal</p>
            </div>
            <div>
              <p className="text-2xl sm:text-3xl font-bold text-foreground">4GB</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">Telegram Premium</p>
            </div>
            <div>
              <p className="text-2xl sm:text-3xl font-bold text-foreground">Pix</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">Pagamento na hora</p>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-muted">* Limite por arquivo no modo Reupload. Modo Forward não tem limite.</p>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 sm:py-24 border-t border-border/50 bg-surface/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold">Como funciona</h2>
            <p className="mt-3 text-muted-foreground">3 passos e você já está clonando</p>
          </div>

          <div className="grid gap-8 sm:grid-cols-3 max-w-3xl mx-auto">
            {steps.map((s) => (
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

      {/* Features */}
      <section className="py-16 sm:py-24 border-t border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold">O que você consegue fazer</h2>
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

      {/* Pricing */}
      <section id="planos" className="py-16 sm:py-24 border-t border-border/50 bg-surface/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold">Planos</h2>
            <p className="mt-3 text-muted-foreground">1 crédito = 1 grupo clonado. Escolha pelo tamanho do grupo.</p>
          </div>

          <div className="grid gap-4 sm:gap-6 sm:grid-cols-3 max-w-4xl mx-auto">
            {[
              {
                name: 'Básico', price: '29,90', desc: 'Grupos com até 500 mensagens',
                color: 'from-green-500/20 to-green-500/5 border-green-500/30', accent: 'text-green-400',
                items: ['1 grupo por crédito', 'Até 500 mensagens', 'Forward ou Reupload', 'Suporte via Instagram'],
              },
              {
                name: 'Standard', price: '49,90', desc: 'Grupos de 501 a 1.000 mensagens',
                color: 'from-blue-500/20 to-blue-500/5 border-blue-500/30', accent: 'text-blue-400', popular: true,
                items: ['1 grupo por crédito', 'Até 1.000 mensagens', 'Forward ou Reupload', 'Suporte via Instagram'],
              },
              {
                name: 'Premium', price: '99,90', desc: 'Grupos com mais de 1.000 mensagens',
                color: 'from-purple-500/20 to-purple-500/5 border-purple-500/30', accent: 'text-purple-400',
                items: ['1 grupo por crédito', 'Sem limite de mensagens', 'Forward ou Reupload', 'Suporte prioritário'],
              },
            ].map((p) => (
              <div
                key={p.name}
                className={`relative rounded-2xl border bg-gradient-to-b ${p.color} p-6 ${p.popular ? 'ring-2 ring-primary' : ''}`}
              >
                {p.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[10px] font-bold text-white uppercase">
                    <Star className="h-3 w-3" /> Mais Usado
                  </div>
                )}
                <div className="text-center pt-2">
                  <h3 className={`text-lg font-bold ${p.accent}`}>{p.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{p.desc}</p>
                  <div className="mt-4">
                    <span className="text-xs text-muted-foreground">R$</span>
                    <span className="text-4xl font-extrabold text-foreground ml-1">{p.price}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">por grupo</p>
                </div>

                <ul className="mt-6 space-y-2.5">
                  {p.items.map((f) => (
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

      {/* FAQ */}
      <section className="py-16 sm:py-24 border-t border-border/50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold">Dúvidas Frequentes</h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq) => (
              <div key={faq.q} className="rounded-xl border border-border/50 bg-surface/50 p-5">
                <h3 className="text-sm font-semibold text-foreground">{faq.q}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
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
              Pronto pra clonar?
            </h2>
            <p className="mt-3 text-muted-foreground max-w-md mx-auto">
              Crie sua conta, compre um crédito via Pix e clone seu primeiro grupo agora.
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
