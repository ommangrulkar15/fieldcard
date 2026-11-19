import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Logo } from '../components/icons'
import { CASE_STUDY_URL } from './links'
import DemoStage from './DemoStage'
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
          <a href="#what" className={link}>
            How it works
          </a>
          <a href="#video" className={link}>
            Video
          </a>
          <a href="#questions" className={link}>
            Questions
          </a>
          <a
            href="#trial"
            className="ml-1 inline-flex h-11 items-center rounded-full bg-[var(--fc-light)] px-5 font-bold text-[var(--fc-deep)] transition-transform duration-200 hover:-translate-y-0.5 active:scale-95"
          >
            Try it
          </a>
        </nav>
      </div>
    </header>
  )
}


/** A made-up job card. Tap the status to close it, move over it to tilt it. */
const TRADE_WORDS = ['electrical', 'plumbing', 'civil', 'HVAC', 'painting', 'welding']

type HeroJob = { no: number; date: string; trade: string; what: string; site: string; open: boolean; fresh?: boolean; age?: number }
const AGES = ['Just now', '4 min ago', '11 min ago', '26 min ago', '1 hr ago', '2 hr ago']
const HERO_JOBS: HeroJob[] = [
  { no: 29, date: '15 Nov', trade: 'Plumbing', what: 'Fix leaking joint on line 3', site: 'Pine Hill', open: false },
  { no: 28, date: '13 Nov', trade: 'Welding', what: 'Repair railing at bay 8', site: 'Maple Court', open: false },
  { no: 27, date: '10 Nov', trade: 'Mechanical', what: 'Replace pump seal on unit 7', site: 'Maple Court', open: true },
  { no: 26, date: '09 Nov', trade: 'Civil', what: 'Repair cracked slab near gate 17', site: 'Lake View', open: true },
  { no: 25, date: '08 Nov', trade: 'Electrical', what: 'Replace blown fuse on panel 6', site: 'Orchard Road', open: false },
  { no: 24, date: '06 Nov', trade: 'HVAC', what: 'Clean filters on rooftop unit 2', site: 'Westgate', open: false },
]
const HERO_QUEUE = [
  { trade: 'Electrical', what: 'Replace light fitting in store 2', site: 'Westgate' },
  { trade: 'Plumbing', what: 'Clear blocked drain in block C', site: 'Harbor Lane' },
  { trade: 'Painting', what: 'Touch up stairwell B walls', site: 'Pine Hill' },
  { trade: 'HVAC', what: 'Service rooftop unit 4', site: 'Lake View' },
  { trade: 'Civil', what: 'Patch pothole at loading dock', site: 'Orchard Road' },
  { trade: 'Welding', what: 'Fix broken gate hinge', site: 'Maple Court' },
  { trade: 'Mechanical', what: 'Grease conveyor bearings', site: 'Westgate' },
  { trade: 'Electrical', what: 'Test emergency lights, floor 2', site: 'Lake View' },
]

function usePrefersMotion() {
  const [ok, setOk] = useState(true)
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)')
    setOk(!m.matches)
    const on = () => setOk(!m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return ok
}

function Hero() {
  const motion = usePrefersMotion()
  const [word, setWord] = useState(0)
  const [jobs, setJobs] = useState<HeroJob[]>(HERO_JOBS)
  const next = useRef(0)

  useEffect(() => {
    if (!motion) return
    const t = window.setInterval(() => setWord((w) => (w + 1) % TRADE_WORDS.length), 2200)
    return () => window.clearInterval(t)
  }, [motion])

  useEffect(() => {
    if (!motion) return
    const t = window.setInterval(() => {
      setJobs((list) => {
        const q = HERO_QUEUE[next.current % HERO_QUEUE.length]
        next.current += 1
        const no = list[0].no + 1
        // the oldest open job gets closed, and a new one arrives at the top
        const oldestOpen = [...list].reverse().find((j) => j.open)
        const rest = list.map((j) => {
          const age = j.age === undefined ? undefined : j.age + 1
          return { ...j, age, date: age === undefined ? j.date : AGES[Math.min(age, AGES.length - 1)], fresh: false, open: j === oldestOpen ? false : j.open }
        })
        return [{ no, date: AGES[0], age: 0, ...q, open: true, fresh: true }, ...rest].slice(0, 6)
      })
    }, 4200)
    return () => window.clearInterval(t)
  }, [motion])

  const latest = jobs[0]
  const tiltWrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = tiltWrap.current
    if (!el || !motion) {
      el?.style.setProperty('--p', '1')
      return
    }
    let raf = 0
    const update = () => {
      raf = 0
      const vh = window.innerHeight
      const top = el.getBoundingClientRect().top
      // 0 while the table sits low in the window, 1 once its top reaches the upper fifth
      const p = Math.min(1, Math.max(0, (vh * 0.95 - top) / (vh * 0.75)))
      el.style.setProperty('--p', p.toFixed(3))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [motion])
  const slot = useRef<HTMLSpanElement>(null)
  const [slotW, setSlotW] = useState<number | undefined>(undefined)
  useLayoutEffect(() => {
    const measure = () => {
      const el = slot.current?.children[word] as HTMLElement | undefined
      if (el) setSlotW(el.scrollWidth)
    }
    measure()
    void document.fonts?.ready.then(measure)
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [word])

  return (
    <section
      id="top"
      aria-labelledby="hero-title"
      className="relative overflow-hidden"
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse') return
        const r = e.currentTarget.getBoundingClientRect()
        e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
        e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
      }}
    >
      <span className="fc-hero-light" aria-hidden="true" />
      <div className="fc-aurora" aria-hidden="true"><span className="a1" /><span className="a2" /><span className="a3" /></div>
      <div className="relative z-10 mx-auto max-w-6xl px-4 pt-14 text-center md:px-6 md:pt-20">
        <h1 id="hero-title" className="fc-display mx-auto max-w-5xl text-[clamp(2.3rem,6.6vw,5rem)] leading-[1.06] md:leading-[0.98]">
          <span className="sr-only">Log the job on site. Find it in a second.</span>
          <span aria-hidden="true" className="fc-fade block" style={idx(0)}>
            Log the{' '}
            <span className="fc-roll" ref={slot} style={{ width: slotW }}>
              {TRADE_WORDS.map((w, i) => (
                <span key={w} data-on={i === word}>
                  {w}
                </span>
              ))}
            </span>{' '}
            job on site.
          </span>
          <span aria-hidden="true" className="fc-fade block" style={idx(1)}>
            Find it in <span className="text-[var(--fc-light)]">a second.</span>
          </span>
        </h1>
        <p className="fc-fade mx-auto mt-6 max-w-2xl text-lg font-medium leading-7 text-white/90 md:text-xl md:leading-8" style={idx(2)}>
          The crew logs a job on a phone. The office finds it in one table, ready to export when the bill is due.
        </p>
        <div className="fc-fade mt-8 flex flex-wrap justify-center gap-3 max-[379px]:flex-col max-[379px]:items-center" style={idx(3)}>
          <a href="#trial" className="fc-btn fc-btn-ink">
            Try it yourself
            <Arrow />
          </a>
          <a href="#video" className="fc-btn fc-btn-ghost">
            Watch video
          </a>
        </div>

        <div ref={tiltWrap} className="fc-hero-window-wrap fc-fade" style={idx(4)}>
          <div className="fc-hero-pill p1" aria-hidden="true">
            <span className="fc-hero-ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg></span>
            Job #{latest.no} logged from site
          </div>
          <div className="fc-hero-pill p2" aria-hidden="true">
            <span className="fc-hero-ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8" /></svg></span>
            Office sees it · just now
          </div>
          <div className="fc-hero-pill p3" aria-hidden="true">
            <span className="fc-hero-ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg></span>
            Exported to Excel
          </div>

          <figure className="fc-hero-window" aria-label="The Fieldcard job table, with sample jobs">
            <div className="fc-hero-bar">
              <span className="flex items-center gap-2 font-bold text-[var(--fc-ink)]">
                <Logo size={22} /> Jobs
              </span>
              <span className="fc-hero-search" aria-hidden="true">Search jobs…</span>
              <span className="fc-hero-export" aria-hidden="true">Export</span>
            </div>
            <table className="fc-hero-table">
              <thead>
                <tr>
                  <th scope="col">Job</th>
                  <th scope="col" className="hidden md:table-cell">Date</th>
                  <th scope="col">Work done</th>
                  <th scope="col" className="hidden md:table-cell">Site</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.no} data-fresh={j.fresh || undefined}>
                    <td className="font-mono">#{j.no}</td>
                    <td className="hidden md:table-cell">{j.date}</td>
                    <td>
                      <span className="font-semibold">{j.trade}:</span> {j.what}
                    </td>
                    <td className="hidden md:table-cell">{j.site}</td>
                    <td>
                      <span className={j.open ? 'fc-st open' : 'fc-st closed'}>{j.open ? 'Open' : 'Closed'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="fc-hero-foot" aria-hidden="true">
              <span>Showing 6 of {latest.no} jobs</span>
              <span className="flex gap-1">
                <span className="fc-hero-page on">1</span>
                <span className="fc-hero-page">2</span>
                <span className="fc-hero-page">3</span>
              </span>
            </div>
          </figure>
        </div>
      </div>
    </section>
  )
}


function VideoSection() {
  const base = import.meta.env.BASE_URL
  return (
    <section id="video" aria-labelledby="video-title" className="mx-auto w-full max-w-6xl scroll-mt-16 px-4 pb-28 pt-16 md:px-6 md:pb-40 md:pt-24">
      <h2 id="video-title" data-reveal className="fc-display text-[clamp(2.4rem,8vw,5.6rem)] text-[var(--fc-light)]">
        See it work.
      </h2>
      <p data-reveal style={idx(1)} className="mt-5 max-w-2xl text-lg leading-7 text-white/90">
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
      <p className="mt-3 text-sm font-medium text-white/90 md:hidden">Tap the full-screen icon for a closer look.</p>
    </section>
  )
}

function TrialSection() {
  return (
    <section id="trial" aria-labelledby="trial-title" className="fc-demo-band scroll-mt-16">
     <div className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6 md:py-28">
      <h2 id="trial-title" data-reveal className="fc-display text-[clamp(4rem,22vw,13rem)] leading-[0.85]">
        Try it.
      </h2>
      <p data-reveal style={idx(1)} className="mt-6 max-w-2xl text-xl leading-8">
        This is the real app, so you can see how it looks: log a job on the crew phone, then watch it arrive on the office laptop.
      </p>
      <div data-reveal style={idx(2)} className="mt-10">
        <DemoStage />
      </div>
     </div>
    </section>
  )
}

const STEPS = [
  {
    title: 'Fill the form.',
    text: 'On site, from a phone: date, work done, place, amounts and up to five photos. The job number is assigned for you.',
  },
  {
    title: 'See it in the table.',
    text: 'In the office, on a computer: search, sort and page through every job. Open one to edit it or add the closing date.',
  },
  { title: 'Send it on.', text: 'Export the table to a spreadsheet, or print one job as a clean card for the file.' },
]

/** Phone frame around a real screenshot. */
function PhoneFrame({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="fc-dev-phone">
      <span className="fc-dev-island" aria-hidden="true" />
      <img src={src} alt={alt} width={560} height={1211} loading="lazy" decoding="async" />
    </div>
  )
}

/** Laptop frame around a real screenshot. */
function LaptopFrame({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="fc-dev-laptop">
      <div className="fc-dev-lid">
        <img src={src} alt={alt} width={1600} height={1025} loading="lazy" decoding="async" />
      </div>
      <div className="fc-dev-base" aria-hidden="true" />
    </div>
  )
}

function Info() {
  const base = import.meta.env.BASE_URL
  const [active, setActive] = useState(0)
  const steps = useRef<(HTMLLIElement | null)[]>([])
  useEffect(() => {
    let raf = 0
    const pick = () => {
      raf = 0
      const mid = window.innerHeight / 2
      let best = 0
      let bestD = Infinity
      steps.current.forEach((el, i) => {
        if (!el) return
        const r = el.getBoundingClientRect()
        const d = Math.abs(r.top + r.height / 2 - mid)
        if (d < bestD) {
          bestD = d
          best = i
        }
      })
      setActive(best)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(pick)
    }
    pick()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <section id="what" aria-labelledby="what-title" className="fc-story scroll-mt-16">
      <div className="mx-auto max-w-6xl px-4 pt-16 md:px-6 md:pt-24">
        <h2 id="what-title" data-reveal className="fc-display text-[clamp(2.4rem,8vw,5.6rem)] text-[var(--fc-light)]">
          From the van to the office.
        </h2>
        <p data-reveal style={idx(1)} className="mt-5 max-w-2xl text-lg leading-7 text-white/90">
          One form in, one table out. The crew logs a job on a phone, and the office finds the same job on a computer seconds later. Nobody types it twice.
        </p>
      </div>

      <div className="mx-auto grid max-w-6xl px-4 pb-12 pt-8 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:gap-16 md:px-6 md:pb-16 md:pt-0">
        <div className="fc-story-stage-wrap hidden md:order-last md:block">
          <div className="fc-story-stage" data-step={active}>
            <div className="fc-story-phone">
              <PhoneFrame src={`${base}case/phone-form.webp`} alt="The Fieldcard job form on a phone, with date, work done and status filled in" />
            </div>
            <div className="fc-story-laptop">
              <LaptopFrame src={`${base}case/desk-data.webp`} alt="The same job listed in the Fieldcard table on a laptop, with search, status and export" />
            </div>
            <div key={active} aria-hidden="true">
              {STEP_CHIPS[active].map((c, i) => (
                <span key={c.t} className="fc-schip" style={{ ...c.at, animationDelay: `${450 + i * 140}ms` }}>
                  {c.t}
                </span>
              ))}
            </div>
          </div>
        </div>

        <ol className="fc-rail md:py-[4vh]">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              data-step={i}
              ref={(el) => {
                steps.current[i] = el
              }}
              className="fc-story-step flex flex-col justify-center py-8 md:min-h-[34vh] md:py-0"
              data-on={active === i}
            >
              <h3 className="fc-display text-[clamp(2rem,4.6vw,3.4rem)]">{step.title}</h3>
              <p className="mt-3 max-w-md text-lg leading-7 text-white/90">{step.text}</p>
              <div className="mt-6 md:hidden" aria-hidden="true">
                <div className="mb-4 flex flex-wrap gap-2">
                  {STEP_CHIPS[i].map((c) => (
                    <span key={c.t} className="fc-schip fc-schip-m">
                      {c.t}
                    </span>
                  ))}
                </div>
                {i === 0 && (
                  <div className="mx-auto w-40">
                    <PhoneFrame src={`${base}case/phone-form.webp`} alt="" />
                  </div>
                )}
                {i === 1 && (
                  <div className="fc-crop">
                    <img src={`${base}case/desk-data.webp`} alt="" loading="lazy" decoding="async" />
                  </div>
                )}
                {i === 2 && (
                  <div className="fc-file">
                    <span className="fc-file-ico">XLSX</span>
                    <span>
                      <span className="block font-bold text-[var(--fc-ink)]">jobs.xlsx</span>
                      <span className="block text-sm text-[#5b5478]">Every job, ready for the bill</span>
                    </span>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
      <Features />
    </section>
  )
}

const FEATURES = [
  {
    id: 'photos',
    label: 'Photos',
    title: 'Up to five photos a job.',
    text: 'Taken on site from the phone and kept with the job, so the office sees the work, not just a description.',
  },
  {
    id: 'pdf',
    label: 'Job card PDF',
    title: 'One clean card per job.',
    text: 'Print it or send it to the customer. Date, site, work done, status and photos, laid out for the file.',
  },
  {
    id: 'roles',
    label: 'Roles',
    title: 'Everyone sees what they need.',
    text: 'Crew add and edit jobs. Supervisors can also delete and export. Admins set up the form and the people.',
  },
  {
    id: 'brand',
    label: 'Your form, your colours',
    title: 'Made to fit your trade.',
    text: 'Rename and reorder fields without code, and pick a brand colour. Fieldcard darkens it if needed so text stays readable.',
  },
] as const

function FeatureVisual({ id }: { id: (typeof FEATURES)[number]['id'] }) {
  if (id === 'photos')
    return (
      <div className="fc-fv">
        <p className="text-sm font-bold text-[var(--fc-ink)]">Job #29 · Photos 3 of 5</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {['#5e4f8f', '#7a6bb0', '#43386b'].map((c, i) => (
            <span key={c} className="fc-fv-photo" style={{ background: c }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {i === 1 ? <path d="M4 20h16M7 20V9l5-4 5 4v11" /> : <path d="M4 17l5-5 4 4 3-3 4 4M4 5h16v14H4z" />}
              </svg>
            </span>
          ))}
        </div>
        <span className="fc-fv-add">+ Add photo</span>
      </div>
    )
  if (id === 'pdf')
    return (
      <div className="fc-fv fc-fv-paper">
        <div className="flex items-center justify-between border-b border-[#ebe7f5] pb-2">
          <span className="flex items-center gap-2 font-bold text-[var(--fc-ink)]">
            <Logo size={20} /> Job card #29
          </span>
          <span className="fc-st closed">Closed</span>
        </div>
        <dl className="mt-2 grid grid-cols-[6rem_1fr] gap-y-1 text-sm">
          <dt className="text-[#5b5478]">Date</dt>
          <dd className="text-[var(--fc-ink)]">15 Nov 2026</dd>
          <dt className="text-[#5b5478]">Site</dt>
          <dd className="text-[var(--fc-ink)]">Pine Hill, line 3</dd>
          <dt className="text-[#5b5478]">Work done</dt>
          <dd className="text-[var(--fc-ink)]">Fixed leaking joint</dd>
        </dl>
        <span className="mt-3 block border-t border-dashed border-[#cfc6e6] pt-1 text-xs text-[#5b5478]">Signed</span>
      </div>
    )
  if (id === 'roles')
    return (
      <div className="fc-fv">
        {[
          ['Crew', 'Add and edit jobs'],
          ['Supervisor', 'Also delete and export'],
          ['Admin', 'Set up the form and people'],
        ].map(([r, t]) => (
          <div key={r} className="flex items-center justify-between gap-4 border-b border-[#ebe7f5] py-2 last:border-0">
            <span className="font-bold text-[var(--fc-ink)]">{r}</span>
            <span className="text-sm text-[#5b5478]">{t}</span>
          </div>
        ))}
      </div>
    )
  return (
    <div className="fc-fv">
      <p className="text-sm font-bold text-[var(--fc-ink)]">Brand colour</p>
      <div className="mt-3 flex gap-2">
        {['#43386b', '#036695', '#0f7133', '#745908', '#9b2c4f'].map((c) => (
          <span key={c} className="size-9 rounded-full" style={{ background: c }} />
        ))}
      </div>
      <span className="mt-4 inline-flex rounded-lg bg-[#036695] px-4 py-2 text-sm font-bold text-white">Save job card</span>
      <p className="mt-2 text-xs text-[#5b5478]">Text on every colour stays at 4.5:1 or better.</p>
    </div>
  )
}

function Features() {
  const [tab, setTab] = useState(0)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const f = FEATURES[tab]
  const move = (i: number) => {
    const n = (i + FEATURES.length) % FEATURES.length
    setTab(n)
    refs.current[n]?.focus()
  }
  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 md:px-6 md:pb-24">
      <h3 data-reveal className="fc-display text-[clamp(1.8rem,4vw,2.8rem)] text-[var(--fc-light)]">
        What else it does.
      </h3>
      <div role="tablist" aria-label="Features" className="fc-tabs mt-6" data-reveal style={idx(1)}>
        {FEATURES.map((x, i) => (
          <button
            key={x.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`ft-${x.id}`}
            aria-selected={tab === i}
            aria-controls={`fp-${x.id}`}
            tabIndex={tab === i ? 0 : -1}
            onClick={() => setTab(i)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') move(i + 1)
              if (e.key === 'ArrowLeft') move(i - 1)
            }}
            className="fc-tab"
          >
            {x.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`fp-${f.id}`}
        aria-labelledby={`ft-${f.id}`}
        key={f.id}
        className="fc-tabpanel mt-6 grid items-center gap-8 md:grid-cols-[1fr_minmax(0,22rem)] md:gap-16"
      >
        <div>
          <p className="fc-display text-[clamp(1.6rem,3.4vw,2.4rem)] text-white">{f.title}</p>
          <p className="mt-3 max-w-md text-lg leading-7 text-white/90">{f.text}</p>
        </div>
        <FeatureVisual id={f.id} />
      </div>
    </div>
  )
}

// Chips are anchored to the devices: positions use the stage width (cqw), because the devices are sized by width.
// Step 1: phone centred, about 74cqw tall. Steps 2 and 3: small phone (about 40cqw tall) on the left, laptop top at about 56cqw.
const STEP_CHIPS: { t: string; at: CSSProperties }[][] = [
  [
    { t: 'Job #29 · auto-numbered', at: { left: '0', bottom: '56cqw' } },
    { t: '3 photos added', at: { right: '0', bottom: '38cqw' } },
    { t: 'Saved in 30 seconds', at: { left: '0', bottom: '16cqw' } },
  ],
  [
    { t: 'same job', at: { left: '0', bottom: '43cqw' } },
    { t: 'Found by searching “pump”', at: { right: '2%', bottom: '58cqw' } },
    { t: 'Status: Open', at: { right: '0', bottom: '20cqw' } },
  ],
  [
    { t: 'Job card PDF', at: { left: '0', bottom: '43cqw' } },
    { t: 'jobs.xlsx · every job', at: { right: '2%', bottom: '58cqw' } },
    { t: 'Ready for the bill', at: { right: '0', bottom: '20cqw' } },
  ],
]

const QUESTIONS: { q: string; a: string }[] = [
  {
    q: 'Who is it for, and who on the team uses it?',
    a: 'Crews and small contractors in any site trade: electrical, civil, mechanical, plumbing, HVAC, painting. Crew members add and edit jobs, supervisors can also delete and export, and admins set up the form and the people. Each business sees only its own jobs.',
  },
  {
    q: 'How hard is it to learn?',
    a: 'Not hard. There is one form and one table, with large buttons that work with a thumb. Fill in the form on site and press Save; later, search the table, edit a job or add its closing date, and export it when the bill is due. A crew member learns it in a few minutes.',
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
    q: 'Is this the real app, and can my business use it?',
    a: 'These are the real screens, with a small stand-in for the server so the demo runs on a static page. Nothing you type is sent or saved, and Reset puts it all back. Fieldcard itself is a portfolio project, not a hosted product: React and TypeScript in front, FastAPI and PostgreSQL behind.',
  },
]

function Questions() {
  return (
    <section id="questions" aria-labelledby="q-title" className="scroll-mt-16">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 md:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] md:gap-16 md:px-6 md:py-28">
        <div className="self-start md:sticky md:top-24">
          <h2 id="q-title" data-reveal className="fc-display text-[clamp(2.4rem,6vw,4.4rem)] text-[var(--fc-ink)]">
            Questions.
          </h2>
          <p data-reveal style={idx(1)} className="mt-4 max-w-sm text-lg leading-7 text-[#4a4466]">
            Short answers about who it is for, what it needs and where the data goes.
          </p>
          <a data-reveal style={idx(2)} href="#trial" className="fc-btn fc-btn-deep mt-8">
            Try it yourself
          </a>
        </div>
        <div className="fc-faq-list">
          {QUESTIONS.map((item, i) => (
            <details key={item.q} open={i === 0} className="fc-faq group">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-4 text-lg font-bold text-[var(--fc-ink)]">
                {item.q}
                <span aria-hidden="true" className="fc-plus grid size-10 shrink-0 place-items-center rounded-full text-2xl">
                  +
                </span>
              </summary>
              <div className="fc-faq-body">
                <div>
                  <p className="max-w-xl pb-6 text-base leading-7 text-[#4a4466]">{item.a}</p>
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="fc-on-ink fc-sheet fc-foot text-white">
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-16 md:px-6 md:pt-20">
        <div className="mb-6">
          <Logo size={52} />
        </div>
        <p data-reveal className="fc-display text-[clamp(3.6rem,19vw,17rem)] leading-[0.85]" aria-hidden="true">
          Fieldcard
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <a href="#trial" className="fc-btn fc-btn-ink">
            Try it yourself
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
        <div className="fc-dark-run fc-on-ink text-white">
          <Hero />
          <Info />
          <VideoSection />
        </div>
        <div className="fc-sheet fc-sheet-light">
          <TrialSection />
          <Questions />
        </div>
      </main>
      <Footer />
    </div>
  )
}
