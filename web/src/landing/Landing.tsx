import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Logo } from '../components/icons'
import { CASE_STUDY_URL } from './links'
import Trial from './Trial'
import './landing.css'

const idx = (i: number): CSSProperties => ({ ['--i' as string]: i })

function Arrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M9 2v13M3.5 9.5 9 15l5.5-5.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Marks the page for scroll reveals and drives the progress bar. Content stays visible if script never runs. */
function useFieldEffects(root: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const node = root.current
    if (!node) return
    node.classList.add('fc-js')
    const targets = node.querySelectorAll('[data-reveal]')
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute('data-in', '')
            io.unobserve(entry.target)
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    )
    targets.forEach((target) => io.observe(target))
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight
        node.style.setProperty('--p', String(max > 0 ? Math.min(1, window.scrollY / max) : 0))
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [root])
}

function Header() {
  const link = 'hidden h-11 items-center rounded-full px-4 font-semibold text-white/85 hover:bg-white/10 hover:text-white md:inline-flex'
  return (
    <header className="fc-on-ink fc-glass sticky top-0 z-30 text-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-1 px-4 md:px-6">
        <a href="#top" className="group mr-auto inline-flex h-11 items-center gap-2.5 rounded-full pr-3 text-lg font-extrabold">
          <span className="transition-transform duration-300 group-hover:-rotate-12 group-active:scale-90">
            <Logo size={30} />
          </span>
          Fieldcard
        </a>
        <nav aria-label="Page sections" className="flex items-center gap-1">
          <a href="#trial" className={link}>
            Try it
          </a>
          <a href="#what" className={link}>
            How it works
          </a>
          <a href="#questions" className={link}>
            Questions
          </a>
          <a
            href="#video"
            className="ml-1 inline-flex h-11 items-center rounded-full bg-[var(--fc-light)] px-5 font-bold text-[var(--fc-deep)] transition-transform duration-200 hover:-translate-y-0.5 active:scale-95"
          >
            Watch video
          </a>
        </nav>
      </div>
    </header>
  )
}

const TRADES = [
  { name: 'Electrical', title: 'Replace blown fuse set', site: 'Westgate · North', asset: 'Panel P-42', photos: 3, amount: 36000 },
  { name: 'Civil', title: 'Repair cracked slab near gate 3', site: 'Pine Hill · South', asset: 'Slab S-3', photos: 4, amount: 84500 },
  { name: 'Mechanical', title: 'Replace worn pump seal', site: 'Harbor Lane · North', asset: 'Pump U7', photos: 2, amount: 18500 },
  { name: 'Plumbing', title: 'Fix leaking joint on line 6', site: 'Maple Court · South', asset: 'Line L-6', photos: 3, amount: 9200 },
  { name: 'HVAC', title: 'Service chiller unit 2', site: 'Lake View · North', asset: 'Chiller C-2', photos: 2, amount: 27800 },
  { name: 'Painting', title: 'Repaint boundary wall, block B', site: 'Orchard Road · South', asset: 'Wall B', photos: 5, amount: 15600 },
]

/** A made-up job card. Tap the status to close it, move over it to tilt it. */
function SampleCard({ trade }: { trade: (typeof TRADES)[number] }) {
  const [closed, setClosed] = useState(false)
  const [amount, setAmount] = useState(0)
  const card = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = card.current
    if (!node) return
    const io = new IntersectionObserver(([entry]) => entry.isIntersecting && setVisible(true), { threshold: 0.3 })
    io.observe(node)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    // A new trade starts a fresh, open job whose amount counts up.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the card when the trade changes
    setClosed(false)
    if (!visible) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setAmount(trade.amount)
      return
    }
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900)
      setAmount(Math.round(trade.amount * (1 - Math.pow(1 - t, 4))))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [trade, visible])

  const tilt = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return
    const box = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - box.left) / box.width - 0.5
    const y = (event.clientY - box.top) / box.height - 0.5
    event.currentTarget.style.setProperty('--ry', `${x * 9}deg`)
    event.currentTarget.style.setProperty('--rx', `${-y * 9}deg`)
  }
  const level = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.style.setProperty('--ry', '0deg')
    event.currentTarget.style.setProperty('--rx', '0deg')
  }
  const toggle = () => {
    setClosed((value) => !value)
    try {
      navigator.vibrate?.(12)
    } catch {
      /* haptics are optional */
    }
  }
  const row = (label: string, value: ReactNode) => (
    <div className="flex justify-between gap-4 py-2.5 odd:-mx-3 odd:bg-[#eeeaf8] odd:px-3">
      <dt className="text-[#5b5478]">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  )

  return (
    <figure className="m-0">
      <div
        ref={card}
        onPointerMove={tilt}
        onPointerLeave={level}
        className="fc-card fc-glass-card relative rounded-3xl p-5 text-[15px] text-[var(--fc-ink)] shadow-[0_18px_40px_-12px_rgba(40,30,80,0.5)]"
      >
        <div className="flex items-center justify-between">
          <p className="text-base font-bold">{trade.name} job</p>
          <button
            type="button"
            onClick={toggle}
            aria-pressed={closed}
            className={`fc-chip min-h-11 min-w-24 cursor-pointer rounded-full px-4 text-sm font-bold ${closed ? 'bg-[#0b5d3b] text-white' : 'bg-[var(--fc-light)] text-[var(--fc-deep)]'}`}
          >
            {closed ? 'Closed' : 'Open'}
          </button>
        </div>
        <div key={trade.name} className="fc-swap">
          <p className="fc-display mt-3 min-h-[4rem] text-[2rem] leading-[1]">{trade.title}</p>
          <dl className="mt-4 px-3">
            {row('Site', trade.site)}
            {row('Asset', trade.asset)}
            {row('Photos', `${trade.photos} attached`)}
            {row('Quote amount', <span className="tabular-nums">₹{amount.toLocaleString('en-IN')}</span>)}
          </dl>
        </div>
        {closed && (
          <span
            aria-hidden="true"
            className="fc-stamp absolute right-4 top-[4.4rem] rounded-lg bg-[#0b5d3b] px-3 py-1 text-sm font-extrabold uppercase text-white"
            style={{ rotate: '-4deg' }}
          >
            Done
          </span>
        )}
      </div>
      <figcaption className="mt-3 text-sm font-medium text-white/90">
        Sample data. Tap Open to close the job. Every name and amount is invented.
      </figcaption>
    </figure>
  )
}

/** A drawn on-site scene — stands in for a job photo, on-brand, no stock. */
function SitePhoto() {
  return (
    <svg viewBox="0 0 160 120" className="block h-full w-full" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#efeafb" />
          <stop offset="1" stopColor="#d9cef2" />
        </linearGradient>
      </defs>
      <rect width="160" height="120" fill="url(#sky)" />
      <circle cx="128" cy="30" r="16" fill="#fff" opacity="0.7" />
      <path d="M0 96h160v24H0Z" fill="#b7a9dd" />
      <path d="M0 96q40-10 80-4t80-6v34H0Z" fill="#a393d1" />
      {/* utility pole + lines */}
      <rect x="40" y="36" width="5" height="64" rx="1.5" fill="#43386b" />
      <rect x="30" y="44" width="25" height="4" rx="2" fill="#43386b" />
      <path d="M33 48l-18 10M52 48l22 9" stroke="#5e4f8f" strokeWidth="1.4" fill="none" />
      {/* worker: hard hat + body silhouette */}
      <g>
        <rect x="96" y="74" width="18" height="26" rx="7" fill="#2b2250" />
        <circle cx="105" cy="66" r="8" fill="#43386b" />
        <path d="M96 64a9 9 0 0 1 18 0Z" fill="#e8b84a" />
        <rect x="100" y="61" width="10" height="3" rx="1.5" fill="#d7a53a" />
      </g>
      {/* panel box on the ground */}
      <rect x="60" y="80" width="22" height="20" rx="2" fill="#f6f4fb" stroke="#43386b" strokeWidth="1.6" />
      <path d="M66 86h10M66 90h10M66 94h6" stroke="#5e4f8f" strokeWidth="1.4" />
    </svg>
  )
}

function Hero() {
  const [pick, setPick] = useState(0)
  return (
    <section id="top" aria-labelledby="hero-title" className="fc-on-ink fc-grad-field relative overflow-hidden text-white">
      <div className="fc-aurora" aria-hidden="true"><span className="a1" /><span className="a2" /><span className="a3" /></div>
      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-14 pt-10 md:px-6 md:pb-24 md:pt-16">
        <div
          className="fc-headline"
          onPointerMove={(e) => {
            if (e.pointerType !== 'mouse') return
            const r = e.currentTarget.getBoundingClientRect()
            e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
            e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
          }}
          onPointerLeave={(e) => {
            e.currentTarget.style.setProperty('--mx', '-999px')
            e.currentTarget.style.setProperty('--my', '-999px')
          }}
        >
          <span className="fc-spot" aria-hidden="true" />
          <h1 id="hero-title" className="fc-display relative z-10 text-[clamp(2.2rem,min(12.6vw,8.5rem),8.5rem)]">
            <span className="fc-line">
              <span style={idx(0)}>Log the job on site.</span>
            </span>
            <span className="fc-line">
              <span className="fc-h-grad" style={idx(1)}>Find it in a second.</span>
            </span>
          </h1>
          <span aria-hidden="true" className="fc-glow-layer fc-display text-[clamp(2.2rem,min(12.6vw,8.5rem),8.5rem)]">
            <span className="fc-line"><span>Log the job on site.</span></span>
            <span className="fc-line"><span>Find it in a second.</span></span>
          </span>
        </div>
        <div className="mt-8 grid items-stretch gap-10 md:mt-10 md:grid-cols-[1fr_minmax(0,26rem)] md:gap-16">
          <div>
            <p className="fc-fade max-w-xl text-lg font-medium leading-7 md:text-xl md:leading-8" style={idx(2)}>
              A job register for crews in any trade: electrical, civil, mechanical, plumbing and more. The crew fills one short form on
              a phone, every job lands in one searchable table, and the owner exports it when the bill is due.
            </p>
            <div className="fc-fade mt-8 flex flex-wrap gap-3" style={idx(3)}>
              <a href="#trial" className="fc-btn fc-btn-ink">
                Log a sample job
                <Arrow />
              </a>
              <a href="#video" className="fc-btn fc-btn-ghost">
                Watch the video
              </a>
            </div>
            <p className="fc-fade mt-4 text-sm font-semibold" style={idx(4)}>
              Takes about 30 seconds. Nothing is saved.
            </p>
            <div className="fc-fade mt-10" style={idx(5)}>
              <p className="text-sm font-semibold" id="trade-label">
                Tap a trade to see its job card:
              </p>
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-labelledby="trade-label">
                {TRADES.map((trade, i) => (
                  <button
                    key={trade.name}
                    type="button"
                    aria-pressed={pick === i}
                    onClick={() => setPick(i)}
                    className={`fc-chip min-h-11 cursor-pointer rounded-full px-4 text-[15px] font-bold ${pick === i ? 'bg-[var(--fc-paper)] text-[var(--fc-deep)]' : 'bg-white/15 text-white hover:bg-white/25'}`}
                  >
                    {trade.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="fc-fade relative mx-auto w-full max-w-sm md:mt-6 md:max-w-none" style={idx(3)}>
            <SampleCard trade={TRADES[pick]} />
            {/* Floating product micro-UI for depth, lifted clear of the card body */}
            <div className="fc-float b fc-accent absolute -right-3 -top-5 z-20 hidden items-center gap-2 rounded-2xl px-3 py-2 md:flex" aria-hidden="true">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-[#0b5d3b] text-white"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg></span>
              <span className="text-[13px] font-bold text-[var(--fc-deep)]">Exported to Excel</span>
            </div>
            <div className="fc-float fc-accent absolute -left-6 -top-8 z-20 hidden items-center gap-2 rounded-2xl p-2 pr-3 md:flex" aria-hidden="true">
              <span className="h-12 w-16 overflow-hidden rounded-xl ring-1 ring-black/5"><SitePhoto /></span>
              <span className="text-[13px] font-bold leading-tight text-[var(--fc-deep)]">Site photo<br /><span className="font-semibold text-[#5b5478]">added on save</span></span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const VIDEO_STEPS = [
  'Sign in on a phone.',
  'Log the job: description, site, asset, quote number.',
  'Add a photo.',
  'Save it.',
  'Find any job with search.',
  'Edit it and close the job.',
  'Print the job card PDF, or export to Excel or CSV.',
  'Set up crew, roles and fields for your trade.',
]

function VideoSection() {
  const base = import.meta.env.BASE_URL
  return (
    <section id="video" aria-labelledby="video-title" className="mx-auto w-full max-w-6xl scroll-mt-16 px-4 pt-6 md:px-6 md:pt-10">
      <h2 id="video-title" data-reveal className="fc-display text-[clamp(2.4rem,9vw,6rem)]">
        See it work.
      </h2>
      <p data-reveal style={idx(1)} className="mt-5 max-w-2xl text-lg leading-7">
        Fifty seconds, start to finish, recorded from the real app with sample data: a crew member logs a job on a phone, the owner
        finds it, closes it and takes the data out.
      </p>
      <div data-reveal style={idx(2)} className="fc-glass-bezel mt-8 rounded-[28px] p-2 md:p-3">
        <video
          className="block aspect-video w-full rounded-[20px] bg-[var(--fc-deep)]"
          controls
          muted
          playsInline
          preload="metadata"
          poster={`${base}walkthrough-poster.jpg`}
          aria-label="Walkthrough of Fieldcard: logging, saving, finding, editing and exporting a job card"
        >
          <source src={`${base}walkthrough.mp4`} type="video/mp4" />
          Your browser cannot play this video.
        </video>
      </div>
      <p className="mt-3 text-sm font-medium md:hidden">Tap the full-screen icon for a closer look.</p>
      <ol data-reveal style={idx(3)} className="mt-6 grid gap-x-8 gap-y-2 text-base leading-6 md:grid-cols-2">
        {VIDEO_STEPS.map((t, i) => (
          <li key={t} className="flex gap-3">
            <span className="w-6 shrink-0 font-bold text-[var(--fc-field)]">{i + 1}</span>
            <span>{t}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function TrialSection() {
  return (
    <section id="trial" aria-labelledby="trial-title" className="mx-auto w-full max-w-6xl scroll-mt-16 px-4 py-16 md:px-6 md:py-28">
      <h2 id="trial-title" data-reveal className="fc-display text-[clamp(2.4rem,9vw,6rem)]">
        Try it yourself.
      </h2>
      <p data-reveal style={idx(1)} className="mt-5 max-w-2xl text-lg leading-7">
        This is the real Fieldcard screen running in your browser. The form is ready to save, so press Save job card, then open See
        the data to find your job.
      </p>
      <div data-reveal style={idx(2)} className="fc-glass-bezel mt-10 rounded-[28px] p-2 md:p-3">
        <Trial />
      </div>
    </section>
  )
}

const STEPS = [
  { title: 'Fill the form.', text: 'Date, work done, place, amounts and up to five photos. The job number is assigned for you.' },
  { title: 'See it in the table.', text: 'Search, sort and page through every job. Open one to edit it or add the closing date.' },
  { title: 'Send it on.', text: 'Export the table to a spreadsheet, or print one job as a clean card for the file.' },
]

function Info() {
  return (
    <section id="what" aria-labelledby="what-title" className="fc-on-ink fc-grad-deep scroll-mt-16 text-white">
      <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-28">
        <h2 id="what-title" data-reveal className="fc-display text-[clamp(2.4rem,9vw,6rem)] text-[var(--fc-light)]">
          One form in. One table out.
        </h2>
        <ol className="mt-12 md:mt-16">
          {STEPS.map((step, i) => (
            <li key={step.title} data-reveal style={idx(i)} className="fc-step -mx-3 grid gap-2 rounded-2xl px-3 py-6 md:grid-cols-[1.1fr_1fr] md:items-center md:gap-10 md:py-8">
              <h3 className="fc-display fc-step-title text-[clamp(1.9rem,5.4vw,3.4rem)]">{step.title}</h3>
              <p className="max-w-md text-lg leading-7 text-white/90">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

const QUESTIONS: { q: string; a: string }[] = [
  {
    q: 'Who is Fieldcard for?',
    a: 'Crews and small contractors who do jobs on site and need to keep track of them: electrical, civil, mechanical, plumbing, HVAC, painting and similar trades. If a job has a date, a place, a description, some photos and an amount, it fits.',
  },
  {
    q: 'Who can use it?',
    a: 'Three kinds of people. Crew members add and edit jobs. Supervisors can also delete jobs and export the table. Admins set up the form and the people. Each business sees only its own jobs.',
  },
  {
    q: 'How do I use it?',
    a: 'Open it on your phone, fill in the form (what was done, where, any amounts, a few photos) and press Save. Later, open the table to search, sort, edit a job or add its closing date. When the bill is due, export the table to a spreadsheet.',
  },
  {
    q: 'Is it easy or hard to learn?',
    a: 'Easy. There is one form and one table, with large buttons that work with a thumb. A crew member can learn it in a few minutes. Setting up the form for your trade takes longer, but you do it once.',
  },
  {
    q: 'Do I need to install anything?',
    a: 'No. It runs in the browser on a phone or a computer. For now it needs a signal to save a job. An offline draft queue for patchy sites is the next thing on the list.',
  },
  {
    q: 'Can I change the form for my trade?',
    a: 'Yes, in the full app. Admins rename labels, reorder fields and add new ones without any code. This demo uses a general site-work template so you can see how it behaves.',
  },
  {
    q: 'Is this demo the real app, and where does my data go?',
    a: 'These are the real screens. A small stand-in replaces the server so the demo runs on a static page. Nothing you type is sent or saved. It lives in this tab and disappears when you reload or press Reset. Sign-in, the admin screens, Excel export and the printable PDF card are not in the demo.',
  },
  {
    q: 'Can my business use it?',
    a: 'Fieldcard is a portfolio project, not a hosted product. The case study explains the decisions behind it. It is built with React and TypeScript in front, and FastAPI and PostgreSQL behind.',
  },
]

function Questions() {
  return (
    <section id="questions" aria-labelledby="q-title" className="mx-auto grid w-full max-w-6xl scroll-mt-16 gap-10 px-4 py-16 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)] md:gap-16 md:px-6 md:py-28">
      <h2 id="q-title" data-reveal className="fc-display self-start text-[clamp(2.4rem,9vw,6rem)] md:sticky md:top-24">
        Questions.
      </h2>
      <div className="space-y-3">
        {QUESTIONS.map((item, i) => (
          <details key={item.q} data-reveal style={idx(i % 4)} className="fc-faq fc-lift group rounded-2xl px-5">
            <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-3 text-lg font-bold">
              {item.q}
              <span aria-hidden="true" className="fc-plus grid size-9 shrink-0 place-items-center rounded-full bg-[var(--fc-light)] text-xl text-[var(--fc-deep)]">
                +
              </span>
            </summary>
            <div className="fc-faq-body">
              <div>
                <p className="pb-5 text-base leading-7 text-[#4a4466]">{item.a}</p>
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="fc-on-ink fc-grad-field text-white">
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-16 md:px-6 md:pt-24">
        <p data-reveal className="fc-display text-[clamp(3.6rem,19vw,17rem)] leading-[0.85]" aria-hidden="true">
          Fieldcard
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <a href="#trial" className="fc-btn fc-btn-ink">
            Try the demo
          </a>
          <a href={CASE_STUDY_URL} className="fc-btn fc-btn-ghost">
            Behind this design
          </a>
          <a href="#top" className="fc-btn fc-btn-ghost">
            Back to top
          </a>
        </div>
        <p className="mt-8 max-w-xl text-base font-medium leading-6">
          A portfolio project by Om Mangrulkar. A generic version of a job register built for a field-service business. All data on
          this site is sample data.
        </p>
      </div>
    </footer>
  )
}

export default function Landing() {
  const root = useRef<HTMLDivElement>(null)
  useFieldEffects(root)
  return (
    <div ref={root} className="fc min-h-dvh">
      <div className="fc-progress" aria-hidden="true" />
      <a
        href="#main"
        className="absolute left-2 top-2 z-50 -translate-y-20 rounded-full bg-[var(--fc-deep)] px-4 py-3 font-bold text-white focus:translate-y-0"
      >
        Skip to content
      </a>
      <Header />
      <main id="main">
        <Hero />
        <VideoSection />
        <TrialSection />
        <Info />
        <Questions />
      </main>
      <Footer />
    </div>
  )
}
