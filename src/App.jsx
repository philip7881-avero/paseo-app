import { useState, useEffect } from 'react'
import { sg, ss } from './firebase.js'
import PHOTOS from './photos.js'

/* ── DATOS ── */
const MEALS = [
  { id:'v_almuerzo', label:'Almuerzo viernes',   short:'V · Almuerzo', weight:1.0 },
  { id:'v_tarde',    label:'Tarde / aperitivos',  short:'V · Tarde',    weight:0.5 },
  { id:'v_noche',    label:'Cena viernes',         short:'V · Cena',     weight:1.0 },
  { id:'s_desayuno', label:'Desayuno sábado',      short:'S · Desayuno', weight:0.5 },
  { id:'s_almuerzo', label:'Almuerzo sábado',      short:'S · Almuerzo', weight:1.0 },
]
const ARRIVALS = [
  { id:'v_almuerzo', label:'Viernes en el almuerzo', mark:'12:00', from:0 },
  { id:'v_tarde',    label:'Viernes en la tarde',     mark:'16:00', from:1 },
  { id:'v_noche',    label:'Viernes en la noche',     mark:'20:00', from:2 },
  { id:'s_manana',   label:'Sábado en la mañana',     mark:'09:00', from:3 },
]
const DEPARTURES = [
  { id:'s_early',    label:'Sábado muy temprano',             sub:'Antes del desayuno',  until:2 },
  { id:'s_desayuno', label:'Después del desayuno',            sub:'Sábado en la mañana', until:3 },
  { id:'s_mediodia', label:'Al mediodía del sábado',          sub:'Sin almuerzo',        until:4 },
  { id:'s_tarde',    label:'Después del almuerzo del sábado', sub:'Tarde del sábado',    until:4 },
]
const GROUPS = [
  {
    id:'bebidas', label:'Bebidas', note:'¿Qué tomas durante el paseo?',
    forMeals:['v_almuerzo','v_tarde','v_noche','s_almuerzo'],
    opts:[
      {id:'vino_tinto',  label:'Vino tinto'},
      {id:'vino_blanco', label:'Vino blanco / Rosé'},
      {id:'cerveza',     label:'Cerveza'},
      {id:'aperitivo',   label:'Aperitivo / Cócteles'},
      {id:'sin_alcohol', label:'Sin alcohol'},
      {id:'otros',       label:'Otros', isText:true},
    ],
  },
  {
    id:'comida', label:'Para comer', note:'¿Qué prefieres en almuerzo y cena?',
    forMeals:['v_almuerzo','v_noche','s_almuerzo'],
    opts:[
      {id:'carne',   label:'Carne vacuno'},
      {id:'cerdo',   label:'Cerdo / Chorizo'},
      {id:'pollo',   label:'Pollo'},
      {id:'pescado', label:'Pescado / Mariscos'},
      {id:'veggie',  label:'Vegetariano / Vegano'},
      {id:'otros',   label:'Otros', isText:true},
    ],
  },
  {
    id:'picoteo', label:'Picoteo', note:'Para la tarde del viernes',
    forMeals:['v_tarde'],
    opts:[
      {id:'palta',     label:'Guacamole / Palta'},
      {id:'chorizo',   label:'Chorizos'},
      {id:'entraña',   label:'Entraña'},
      {id:'provoleta', label:'Provoleta'},
      {id:'queso',     label:'Queso y fiambres'},
      {id:'frutos',    label:'Frutos secos'},
      {id:'hummus',    label:'Hummus'},
      {id:'aceitunas', label:'Aceitunas'},
      {id:'otros',     label:'Otros', isText:true},
    ],
  },
  {
    id:'desayuno', label:'Desayuno', note:'Sábado en la mañana',
    forMeals:['s_desayuno'],
    opts:[
      {id:'cafe',   label:'Café'},
      {id:'te',     label:'Té'},
      {id:'jugo',   label:'Jugo natural'},
      {id:'huevos', label:'Huevos'},
      {id:'palta',  label:'Palta'},
      {id:'frutas', label:'Frutas'},
      {id:'yogurt', label:'Yogurt'},
      {id:'pan',    label:'Pan / Marraqueta'},
      {id:'otros',  label:'Otros', isText:true},
    ],
  },
]

/* ── CLAVES FIREBASE ── */
const SK = { cfg:'paseo_cfg', pax:'paseo_pax', exp:'paseo_exp' }

/* ── LÓGICA ── */
function getMeals(aId, dId) {
  const a = ARRIVALS.find(x => x.id === aId)
  const d = DEPARTURES.find(x => x.id === dId)
  if (!a || !d) return []
  return MEALS.filter((_, i) => i >= a.from && i <= d.until)
}
function relevantGroups(aId, dId) {
  const mIds = getMeals(aId, dId).map(m => m.id)
  return GROUPS.filter(g => g.forMeals.some(m => mIds.includes(m)))
}
function calcShares(pax, total) {
  const w = pax.map(p => ({
    ...p,
    meals: getMeals(p.arrival, p.departure),
    weight: getMeals(p.arrival, p.departure).reduce((s, m) => s + m.weight, 0),
  }))
  const tw = w.reduce((s, p) => s + p.weight, 0)
  return w.map(p => ({ ...p, share: tw > 0 ? Math.round((p.weight / tw) * total) : 0 }))
}
function aggregate(pax) {
  const res = {}
  GROUPS.forEach(g => { res[g.id] = {}; g.opts.forEach(o => { res[g.id][o.id] = 0 }) })
  pax.forEach(p => {
    const mIds = getMeals(p.arrival, p.departure).map(m => m.id)
    GROUPS.forEach(g => {
      if (!g.forMeals.some(m => mIds.includes(m))) return
      ;(p.prefs?.[g.id] || []).forEach(oid => { if (res[g.id][oid] !== undefined) res[g.id][oid]++ })
    })
  })
  return res
}
function getOtrosText(p, groupId) { return p.prefs?.[groupId + '_otros'] || '' }
const clp = n => '$' + Math.round(n).toLocaleString('es-CL')
function makeWALink(p, bank, eventName) {
  const mls = p.meals?.map(m => m.short).join(', ') || ''
  const msg = [
    `Hola ${p.name} 👋`, ``,
    `Cerramos la cuenta del *${eventName}*:`, ``,
    `💰 Tu parte: *${clp(p.share)}*`,
    `Participaste en: ${mls}`, ``,
    `Transfiere a:`,
    `▸ ${bank.name}`, `▸ ${bank.bank} — ${bank.type}`,
    `▸ N° cuenta: ${bank.number}`, `▸ RUT: ${bank.rut}`, `▸ Email: ${bank.email}`,
    ``, `¡Gracias, fue un placer! 🥂`,
  ].join('\n')
  const digits = p.phone.replace(/\D/g, '')
  const num = digits.startsWith('56') ? digits : digits.startsWith('9') && digits.length === 9 ? '56' + digits : digits
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`
}

/* ── TOKENS ── */
const C   = { bg:'#fff', text:'#0a0a0a', muted:'#6b7280', faint:'#9ca3af', border:'#e5e7eb', surface:'#f9fafb', ok:'#15803d' }
const mono = "'IBM Plex Mono','Courier New',monospace"

/* ── ÁTOMOS ── */
const Label = ({ children }) => (
  <span style={{ fontFamily:mono, fontSize:10, fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase', color:C.faint }}>{children}</span>
)
const HR = () => <div style={{ height:1, background:C.border }} />

function Btn({ onClick, children, variant='primary', full, disabled }) {
  const vs = {
    primary: { background:C.text, color:'#fff', border:'none' },
    ghost:   { background:C.surface, color:C.text, border:`1px solid ${C.border}` },
    success: { background:C.ok, color:'#fff', border:'none' },
    outline: { background:'#fff', color:C.text, border:`1.5px solid ${C.text}` },
  }
  return (
    <button disabled={disabled} onClick={onClick}
      style={{ fontFamily:mono, padding:'13px 20px', borderRadius:10, fontWeight:700, fontSize:13, cursor:disabled?'not-allowed':'pointer', opacity:disabled?0.35:1, transition:'filter 0.15s', width:full?'100%':'auto', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8, ...vs[variant] }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.filter='brightness(1.08)' }}
      onMouseLeave={e => { e.currentTarget.style.filter='' }}>
      {children}
    </button>
  )
}

function Field({ label, value, onChange, placeholder, type='text', note }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {label && <Label>{label}</Label>}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ fontFamily:mono, padding:'12px 14px', borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:13, color:C.text, background:'#fff', outline:'none' }}
        onFocus={e => { e.target.style.borderColor = C.text }}
        onBlur={e  => { e.target.style.borderColor = C.border }} />
      {note && <p style={{ fontFamily:mono, fontSize:11, color:C.faint, margin:0 }}>{note}</p>}
    </div>
  )
}

function RadioRow({ sel, onSel, label, sub }) {
  return (
    <button onClick={onSel} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 16px', borderRadius:10, border:sel?`1.5px solid ${C.text}`:`1.5px solid ${C.border}`, background:sel?C.text:'#fff', cursor:'pointer', width:'100%', textAlign:'left', transition:'all 0.15s' }}>
      <span style={{ fontFamily:mono, fontSize:13, fontWeight:sel?700:400, color:sel?'#fff':C.text }}>{label}</span>
      {sub && <span style={{ fontFamily:mono, fontSize:11, color:sel?'#d1d5db':C.faint, flexShrink:0, marginLeft:12 }}>{sub}</span>}
    </button>
  )
}

function CheckPill({ checked, onChange, label }) {
  return (
    <button onClick={() => onChange(!checked)} style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', borderRadius:10, border:checked?`1.5px solid ${C.text}`:`1.5px solid ${C.border}`, background:checked?C.text:'#fff', cursor:'pointer', width:'100%', textAlign:'left', transition:'all 0.15s' }}>
      <span style={{ width:15, height:15, borderRadius:4, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', border:`1.5px solid ${checked?'rgba(255,255,255,0.5)':C.faint}` }}>
        {checked && <span style={{ color:'#fff', fontSize:9, fontWeight:700, lineHeight:1 }}>✕</span>}
      </span>
      <span style={{ fontFamily:mono, fontSize:12, fontWeight:500, color:checked?'#fff':C.text }}>{label}</span>
    </button>
  )
}

function OtrosPill({ checked, onCheck, text, onTextChange }) {
  return (
    <div style={{ gridColumn:'1 / -1' }}>
      <button onClick={() => onCheck(!checked)} style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', borderRadius:checked?'10px 10px 0 0':10, border:checked?`1.5px solid ${C.text}`:`1.5px solid ${C.border}`, borderBottom:checked?'1px solid rgba(255,255,255,0.2)':`1.5px solid ${C.border}`, background:checked?C.text:'#fff', cursor:'pointer', width:'100%', textAlign:'left', transition:'all 0.15s' }}>
        <span style={{ width:15, height:15, borderRadius:4, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', border:`1.5px solid ${checked?'rgba(255,255,255,0.5)':C.faint}` }}>
          {checked && <span style={{ color:'#fff', fontSize:9, fontWeight:700, lineHeight:1 }}>✕</span>}
        </span>
        <span style={{ fontFamily:mono, fontSize:12, fontWeight:500, color:checked?'#fff':C.text }}>Otros</span>
      </button>
      {checked && (
        <input autoFocus value={text} onChange={e => onTextChange(e.target.value)} placeholder="¿Qué agregarías? Escribe aquí…"
          style={{ fontFamily:mono, width:'100%', padding:'11px 14px', borderRadius:'0 0 10px 10px', border:`1.5px solid ${C.text}`, borderTop:'none', fontSize:12, color:C.text, background:C.surface, outline:'none', boxSizing:'border-box' }} />
      )}
    </div>
  )
}

/* ── LANDING ── */
function LandingScreen({ config, onEnter }) {
  const GAP = 2
  const cell = { display:'flex', overflow:'hidden', position:'relative' }
  const Img = ({ src }) => <img src={src} style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'center 30%', display:'block' }} />
  return (
    <div style={{ minHeight:'100vh', background:'#000', display:'flex', flexDirection:'column', fontFamily:mono, position:'relative', overflow:'hidden' }}>
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:GAP, maxHeight:'calc(100vh - 110px)' }}>
        <div style={{ display:'flex', gap:GAP, flex:'1.3 0 0' }}>
          <div style={{ ...cell, flex:'2 0 0' }}><Img src={PHOTOS[0]} /></div>
          <div style={{ ...cell, flex:'1 0 0' }}><Img src={PHOTOS[1]} /></div>
        </div>
        <div style={{ display:'flex', gap:GAP, flex:'1 0 0' }}>
          <div style={{ ...cell, flex:'1 0 0' }}><Img src={PHOTOS[2]} /></div>
          <div style={{ ...cell, flex:'1 0 0' }}><Img src={PHOTOS[3]} /></div>
          <div style={{ ...cell, flex:'1 0 0' }}><Img src={PHOTOS[4]} /></div>
        </div>
        <div style={{ display:'flex', gap:GAP, flex:'1.2 0 0' }}>
          <div style={{ ...cell, flex:'1 0 0' }}><Img src={PHOTOS[5]} /></div>
          <div style={{ ...cell, flex:'1 0 0' }}><Img src={PHOTOS[6]} /></div>
        </div>
        <div style={{ display:'flex', gap:GAP, flex:'1 0 0' }}>
          <div style={{ ...cell, flex:'1 0 0' }}><Img src={PHOTOS[7]} /></div>
          <div style={{ ...cell, flex:'1 0 0' }}><Img src={PHOTOS[8]} /></div>
          <div style={{ ...cell, flex:'1 0 0' }}><Img src={PHOTOS[9]} /></div>
        </div>
        <div style={{ display:'flex', gap:GAP, flex:'1 0 0' }}>
          <div style={{ ...cell, flex:'1 0 0' }}><Img src={PHOTOS[10]} /></div>
          <div style={{ ...cell, flex:'2 0 0' }}><Img src={PHOTOS[11]} /></div>
        </div>
        <div style={{ display:'flex', flex:'0.9 0 0' }}>
          <div style={{ ...cell, flex:'1 0 0' }}><Img src={PHOTOS[12]} /></div>
        </div>
      </div>
      <div style={{ position:'absolute', bottom:0, left:0, right:0, background:'linear-gradient(to top, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.85) 55%, transparent 100%)', padding:'12px 24px 24px', display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
        {config?.eventName && (
          <p style={{ fontFamily:mono, fontSize:10, fontWeight:500, letterSpacing:'0.22em', textTransform:'uppercase', color:'rgba(255,255,255,0.45)', margin:0, textAlign:'center' }}>
            {config.eventName}
          </p>
        )}
        <button onClick={onEnter} style={{ fontFamily:mono, fontSize:13, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'#000', background:'#fff', border:'none', padding:'15px 0', borderRadius:4, cursor:'pointer', width:'100%', maxWidth:300, transition:'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background='#e5e5e5' }}
          onMouseLeave={e => { e.currentTarget.style.background='#fff' }}>
          Entrar en la joda →
        </button>
      </div>
    </div>
  )
}

/* ── SETUP ── */
function SetupScreen({ onSave }) {
  const [f, setF] = useState({ eventName:'El Paseo', adminCode:'', bankName:'', bank:'', bankType:'Cuenta Corriente', bankNum:'', rut:'', email:'' })
  const upd = k => v => setF(p => ({ ...p, [k]:v }))
  const ok  = f.eventName && f.adminCode.length >= 4 && f.bankName && f.bank && f.bankNum && f.rut
  return (
    <div style={{ minHeight:'100vh', background:C.bg, fontFamily:mono, padding:'32px 20px' }}>
      <div style={{ maxWidth:420, margin:'0 auto' }}>
        <div style={{ marginBottom:32 }}>
          <Label>Configuración inicial</Label>
          <h1 style={{ fontFamily:mono, fontSize:26, margin:'8px 0 6px', color:C.text, fontWeight:700 }}>Crear el paseo</h1>
          <p style={{ color:C.muted, fontSize:13, margin:0 }}>Solo el organizador completa esto una vez.</p>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:14, marginBottom:28 }}>
          <Field label="Nombre del paseo"                    value={f.eventName} onChange={upd('eventName')} placeholder="El Paseo de los 50" />
          <Field label="Código admin (mín. 4 caracteres)"    value={f.adminCode} onChange={upd('adminCode')} placeholder="Solo tú lo sabrás" type="password" note="No se puede recuperar. Guárdalo bien." />
        </div>
        <HR />
        <div style={{ display:'flex', flexDirection:'column', gap:14, margin:'28px 0 36px' }}>
          <Label>Tu cuenta bancaria</Label>
          <Field label="Tu nombre completo"          value={f.bankName} onChange={upd('bankName')} placeholder="Juan Pérez González" />
          <Field label="Banco"                       value={f.bank}     onChange={upd('bank')}     placeholder="Banco de Chile, BCI…" />
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <Label>Tipo de cuenta</Label>
            <select value={f.bankType} onChange={e => setF(p => ({ ...p, bankType:e.target.value }))} style={{ fontFamily:mono, padding:'12px 14px', borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:13, color:C.text, background:'#fff', outline:'none' }}>
              {['Cuenta Corriente','Cuenta Vista','Cuenta RUT','Cuenta de Ahorro'].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <Field label="Número de cuenta"            value={f.bankNum}  onChange={upd('bankNum')}  placeholder="000000000" />
          <Field label="RUT"                         value={f.rut}      onChange={upd('rut')}      placeholder="12.345.678-9" />
          <Field label="Email para comprobante"      value={f.email}    onChange={upd('email')}    placeholder="tu@email.com" type="email" />
        </div>
        <Btn onClick={() => onSave({ eventName:f.eventName, adminCode:f.adminCode, bank:{ name:f.bankName, bank:f.bank, type:f.bankType, number:f.bankNum, rut:f.rut, email:f.email } })} disabled={!ok} full>
          Crear paseo →
        </Btn>
      </div>
    </div>
  )
}

/* ── PARTICIPANTE ── */
function ParticipantApp({ config, onAdminClick }) {
  const [step, setStep]           = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]           = useState(false)
  const [form, setForm]           = useState({ name:'', phone:'', arrival:'', departure:'', prefs:{} })
  const upd = (k, v) => setForm(p => ({ ...p, [k]:v }))

  const handleSubmit = async () => {
    setSubmitting(true)
    const existing = await sg(SK.pax) || []
    const arr = Array.isArray(existing) ? existing : Object.values(existing)
    const idx = arr.findIndex(p => p.name.toLowerCase().trim() === form.name.toLowerCase().trim())
    const participant = { id:idx >= 0 ? arr[idx].id : Date.now().toString(), name:form.name.trim(), phone:form.phone.trim(), arrival:form.arrival, departure:form.departure, prefs:form.prefs, ts:Date.now() }
    const newPax = idx >= 0 ? arr.map((x, i) => i === idx ? participant : x) : [...arr, participant]
    await ss(SK.pax, newPax)
    setSubmitting(false)
    setDone(true)
  }

  const meals   = getMeals(form.arrival, form.departure)
  const groups  = relevantGroups(form.arrival, form.departure)
  const step1ok = form.name.trim().length >= 2 && form.phone.replace(/\D/g,'').length >= 8
  const step2ok = form.arrival && form.departure && meals.length > 0

  const toggleOpt = (gId, oId) => {
    const cur = form.prefs[gId] || []
    upd('prefs', { ...form.prefs, [gId]: cur.includes(oId) ? cur.filter(x => x !== oId) : [...cur, oId] })
  }
  const toggleOtros = (gId, checked) => {
    const cur = form.prefs[gId] || []
    const newSel = checked ? [...cur,'otros'] : cur.filter(x => x !== 'otros')
    const np = { ...form.prefs, [gId]:newSel }
    if (!checked) delete np[gId+'_otros']
    upd('prefs', np)
  }
  const setOtrosText = (gId, text) => upd('prefs', { ...form.prefs, [gId+'_otros']:text })

  if (done) return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', padding:24, fontFamily:mono }}>
      <div style={{ maxWidth:360, width:'100%' }}>
        <p style={{ fontFamily:mono, fontSize:44, margin:'0 0 4px', fontWeight:700, color:C.text }}>Listo.</p>
        <h2 style={{ fontFamily:mono, fontSize:22, color:C.muted, margin:'0 0 20px', fontWeight:400 }}>{form.name}</h2>
        <HR />
        <p style={{ color:C.muted, fontSize:13, lineHeight:1.7, margin:'20px 0 24px' }}>
          Tus preferencias para <strong style={{ color:C.text }}>{config.eventName}</strong> quedaron registradas. Cuando se cierren las compras recibirás un WhatsApp con tu parte y los datos para transferir.
        </p>
        <Btn variant="ghost" full onClick={() => { setDone(false); setStep(0); setForm({ name:'',phone:'',arrival:'',departure:'',prefs:{} }) }}>
          Volver al inicio
        </Btn>
      </div>
    </div>
  )

  const stepLabels = ['Tus datos','Tu horario','Tus preferencias']
  return (
    <div style={{ minHeight:'100vh', background:C.bg, fontFamily:mono, padding:'32px 20px' }}>
      <div style={{ maxWidth:420, margin:'0 auto' }}>
        <div style={{ marginBottom:28 }}>
          <Label>Viernes → Sábado</Label>
          <h1 style={{ fontFamily:mono, fontSize:24, margin:'6px 0 0', color:C.text, fontWeight:700 }}>{config.eventName}</h1>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:32 }}>
          {stepLabels.map((s, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontFamily:mono, fontSize:11, fontWeight:i===step?700:400, color:i===step?C.text:i<step?C.ok:C.faint, display:'flex', alignItems:'center', gap:5 }}>
                <span style={{ width:20, height:20, borderRadius:'50%', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:10, background:i<step?C.ok:i===step?C.text:C.border, color:i<=step?'#fff':C.faint, fontWeight:700, flexShrink:0 }}>{i<step?'✓':i+1}</span>
                {i===step && s}
              </span>
              {i < 2 && <span style={{ width:20, height:1, background:i<step?C.ok:C.border }} />}
            </div>
          ))}
        </div>

        {/* STEP 0 */}
        {step===0 && (
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
            <div><h2 style={{ fontFamily:mono, fontSize:20, margin:'0 0 4px', fontWeight:400, fontStyle:'italic' }}>¿Quién eres?</h2><p style={{ color:C.muted, fontSize:13, margin:0 }}>Ingresa tus datos para participar</p></div>
            <Field label="Nombre"    value={form.name}  onChange={v => upd('name',v)}  placeholder="Tu nombre completo" />
            <Field label="WhatsApp"  value={form.phone} onChange={v => upd('phone',v)} placeholder="+56 9 1234 5678" type="tel" note="Solo para enviarte la cuenta al final. Incluye el +56." />
            <Btn onClick={() => setStep(1)} disabled={!step1ok} full>Siguiente →</Btn>
          </div>
        )}

        {/* STEP 1 */}
        {step===1 && (
          <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
            <div><h2 style={{ fontFamily:mono, fontSize:20, margin:'0 0 4px', fontWeight:400, fontStyle:'italic' }}>Tu horario</h2><p style={{ color:C.muted, fontSize:13, margin:0 }}>¿Cuándo llegas y cuándo te vas?</p></div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <Label>Llegada</Label>
              <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:6 }}>
                {ARRIVALS.map(a => <RadioRow key={a.id} sel={form.arrival===a.id} onSel={() => upd('arrival',a.id)} label={a.label} sub={a.mark} />)}
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <Label>Salida</Label>
              <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:6 }}>
                {DEPARTURES.map(d => <RadioRow key={d.id} sel={form.departure===d.id} onSel={() => upd('departure',d.id)} label={d.label} sub={d.sub} />)}
              </div>
            </div>
            {form.arrival && form.departure && (
              <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:16 }}>
                {meals.length > 0
                  ? <><Label>Comidas incluidas</Label><div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:10 }}>{meals.map(m => <span key={m.id} style={{ fontFamily:mono, fontSize:11, padding:'5px 12px', borderRadius:20, border:`1px solid ${C.border}`, color:C.text, background:C.surface }}>{m.label}</span>)}</div></>
                  : <p style={{ fontFamily:mono, fontSize:13, color:'#b45309', margin:0 }}>Con ese horario no participas en ninguna comida. Revisa la selección.</p>}
              </div>
            )}
            <div style={{ display:'flex', gap:10 }}>
              <Btn onClick={() => setStep(0)} variant="ghost" full>← Volver</Btn>
              <Btn onClick={() => setStep(2)} disabled={!step2ok} full>Siguiente →</Btn>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step===2 && (
          <div style={{ display:'flex', flexDirection:'column', gap:28 }}>
            <div><h2 style={{ fontFamily:mono, fontSize:20, margin:'0 0 4px', fontWeight:400, fontStyle:'italic' }}>¿Qué prefieres?</h2><p style={{ color:C.muted, fontSize:13, margin:0 }}>Selecciona todo lo que te guste.</p></div>
            {groups.map((g, gi) => (
              <div key={g.id}>
                {gi > 0 && <HR />}
                <div style={{ paddingTop:gi > 0 ? 20 : 0 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:12 }}>
                    <span style={{ fontFamily:mono, fontSize:16, fontWeight:700, color:C.text }}>{g.label}</span>
                    <span style={{ fontFamily:mono, fontSize:10, color:C.faint }}>{g.note}</span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                    {g.opts.map(opt => {
                      if (opt.isText) {
                        const isChecked = (form.prefs[g.id]||[]).includes('otros')
                        const otrosText = form.prefs[g.id+'_otros'] || ''
                        return <OtrosPill key="otros" checked={isChecked} onCheck={c => toggleOtros(g.id,c)} text={otrosText} onTextChange={t => setOtrosText(g.id,t)} />
                      }
                      return <CheckPill key={opt.id} checked={(form.prefs[g.id]||[]).includes(opt.id)} onChange={() => toggleOpt(g.id,opt.id)} label={opt.label} />
                    })}
                  </div>
                </div>
              </div>
            ))}
            <div style={{ display:'flex', gap:10 }}>
              <Btn onClick={() => setStep(1)} variant="ghost" full>← Volver</Btn>
              <Btn onClick={handleSubmit} variant="success" full disabled={submitting}>{submitting?'Guardando…':'Confirmar'}</Btn>
            </div>
          </div>
        )}

        <div style={{ borderTop:`1px solid ${C.border}`, marginTop:44, paddingTop:20, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontFamily:mono, fontSize:11, color:C.faint }}>¿Eres el organizador?</span>
          <button onClick={onAdminClick} style={{ fontFamily:mono, fontSize:11, fontWeight:700, color:C.text, background:'none', border:'none', cursor:'pointer', padding:0, textDecoration:'underline', textUnderlineOffset:3 }}>
            Acceder al panel →
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── ADMIN LOGIN ── */
function AdminLogin({ config, onSuccess, onBack }) {
  const [code, setCode] = useState('')
  const [err, setErr]   = useState(false)
  const tryLogin = () => { if (code === config.adminCode) { onSuccess() } else { setErr(true); setTimeout(() => setErr(false), 2000) } }
  return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', padding:24, fontFamily:mono }}>
      <div style={{ maxWidth:340, width:'100%' }}>
        <Label>Panel organizador</Label>
        <h2 style={{ fontFamily:mono, fontSize:26, margin:'8px 0 28px', color:C.text, fontWeight:400, fontStyle:'italic' }}>Acceso</h2>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <Field label="Código de acceso" value={code} onChange={setCode} placeholder="••••" type="password" />
          {err && <p style={{ fontFamily:mono, fontSize:12, color:'#b91c1c', margin:0 }}>Código incorrecto</p>}
          <Btn onClick={tryLogin} full>Entrar →</Btn>
          <button onClick={onBack} style={{ fontFamily:mono, fontSize:12, color:C.muted, background:'none', border:'none', cursor:'pointer', padding:'8px 0', textAlign:'center' }}>← Volver al formulario</button>
        </div>
      </div>
    </div>
  )
}

/* ── ADMIN PANEL ── */
function AdminPanel({ config, initialPax, initialExp, onBack }) {
  const [pax, setPax]         = useState(initialPax)
  const [tab, setTab]         = useState('pax')
  const [expItems, setExpItems] = useState(initialExp?.items || [])
  const [newDesc, setNewDesc] = useState('')
  const [newAmt, setNewAmt]   = useState('')
  const [copied, setCopied]   = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const total  = expItems.reduce((s, i) => s + Number(i.amount || 0), 0)
  const shares = calcShares(pax, total)
  const counts = aggregate(pax)

  const refresh = async () => {
    setRefreshing(true)
    const p = await sg(SK.pax)
    setPax(Array.isArray(p) ? p : p ? Object.values(p) : [])
    setTimeout(() => setRefreshing(false), 500)
  }
  const addExp = async () => {
    if (!newDesc || !newAmt) return
    const items = [...expItems, { desc:newDesc, amount:Number(newAmt) }]
    setExpItems(items); setNewDesc(''); setNewAmt('')
    await ss(SK.exp, { total:items.reduce((s,i) => s+i.amount, 0), items })
  }
  const removeExp = async idx => {
    const items = expItems.filter((_, i) => i !== idx)
    setExpItems(items)
    await ss(SK.exp, { total:items.reduce((s,i) => s+i.amount, 0), items })
  }
  const copyLink = () => {
    navigator.clipboard?.writeText(window.location.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500) })
  }

  const TABS = [{ id:'pax', label:`Participantes (${pax.length})` }, { id:'shop', label:'Lista compras' }, { id:'pay', label:'Cuentas' }]

  return (
    <div style={{ minHeight:'100vh', background:C.bg, fontFamily:mono }}>
      <div style={{ borderBottom:`1px solid ${C.border}`, padding:'18px 24px', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, background:C.bg, zIndex:10 }}>
        <div>
          <Label>Panel organizador</Label>
          <h1 style={{ fontFamily:mono, fontSize:18, margin:'4px 0 0', color:C.text, fontWeight:700 }}>{config.eventName}</h1>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={copyLink} style={{ fontFamily:mono, fontSize:11, fontWeight:700, padding:'8px 12px', borderRadius:8, border:`1.5px solid ${C.border}`, background:'#fff', cursor:'pointer', color:copied?C.ok:C.text }}>{copied?'✓ Copiado':'Copiar enlace'}</button>
          <button onClick={refresh} style={{ fontFamily:mono, fontSize:11, fontWeight:700, padding:'8px 12px', borderRadius:8, border:`1.5px solid ${C.border}`, background:'#fff', cursor:'pointer', color:C.text, transition:'transform 0.4s', transform:refreshing?'rotate(180deg)':'none' }}>↻</button>
        </div>
      </div>
      <div style={{ borderBottom:`1px solid ${C.border}`, padding:'0 24px', display:'flex' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ fontFamily:mono, fontSize:12, fontWeight:tab===t.id?700:400, padding:'14px 14px', border:'none', borderBottom:tab===t.id?`2px solid ${C.text}`:'2px solid transparent', background:'none', cursor:'pointer', color:tab===t.id?C.text:C.muted, marginBottom:-1 }}>{t.label}</button>
        ))}
      </div>

      <div style={{ maxWidth:600, margin:'0 auto', padding:'28px 20px' }}>

        {/* PARTICIPANTES */}
        {tab==='pax' && (
          pax.length === 0
            ? <div style={{ textAlign:'center', padding:'64px 0', color:C.faint }}><p style={{ fontFamily:mono, fontSize:16, fontStyle:'italic', marginBottom:8 }}>Sin participantes aún</p><p style={{ fontSize:12, margin:0 }}>Comparte el enlace para que se unan</p></div>
            : pax.map((p, i) => {
                const m = getMeals(p.arrival, p.departure)
                return (
                  <div key={p.id}>
                    {i > 0 && <HR />}
                    <div style={{ padding:'20px 0' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                        <div><p style={{ fontSize:15, fontWeight:700, color:C.text, margin:'0 0 3px' }}>{p.name}</p><p style={{ fontSize:11, color:C.faint, margin:0 }}>{p.phone}</p></div>
                        <span style={{ fontSize:11, color:C.muted, background:C.surface, padding:'4px 10px', borderRadius:20, border:`1px solid ${C.border}` }}>{m.length} comidas</span>
                      </div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:8 }}>
                        {m.map(mx => <span key={mx.id} style={{ fontSize:10, color:C.muted, padding:'3px 9px', borderRadius:20, border:`1px solid ${C.border}` }}>{mx.short}</span>)}
                      </div>
                      {p.prefs && (
                        <div style={{ marginTop:6 }}>
                          {GROUPS.map(g => {
                            const sel = (p.prefs[g.id]||[]).filter(id => id!=='otros')
                            const ot  = p.prefs[g.id+'_otros']
                            const labels = sel.map(id => g.opts.find(o => o.id===id)?.label).filter(Boolean)
                            if (ot) labels.push(`Otros: ${ot}`)
                            if (!labels.length) return null
                            return <p key={g.id} style={{ fontSize:11, color:C.muted, margin:'2px 0' }}><strong style={{ color:C.text }}>{g.label}:</strong> {labels.join(', ')}</p>
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
        )}

        {/* LISTA COMPRAS */}
        {tab==='shop' && (
          pax.length === 0
            ? <div style={{ textAlign:'center', padding:'64px 0', color:C.faint }}><p style={{ fontFamily:mono, fontSize:16, fontStyle:'italic' }}>Necesitas participantes primero</p></div>
            : GROUPS.map((g, gi) => {
                const cc = counts[g.id] || {}
                const items = g.opts.filter(o => !o.isText && cc[o.id] > 0).sort((a, b) => cc[b.id]-cc[a.id])
                const otrosList = pax.map(p => ({ name:p.name, text:getOtrosText(p,g.id) })).filter(x => x.text)
                if (!items.length && !otrosList.length) return null
                return (
                  <div key={g.id} style={{ marginBottom:28 }}>
                    {gi > 0 && <HR />}
                    <div style={{ paddingTop:gi > 0 ? 24 : 0 }}>
                      <h3 style={{ fontFamily:mono, fontSize:16, margin:'0 0 16px', color:C.text, fontWeight:700 }}>{g.label}</h3>
                      {items.map(opt => (
                        <div key={opt.id} style={{ marginBottom:12 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                            <span style={{ fontSize:13, color:C.text }}>{opt.label}</span>
                            <span style={{ fontSize:11, color:C.muted, fontWeight:700 }}>{cc[opt.id]} de {pax.length}</span>
                          </div>
                          <div style={{ height:3, background:C.surface, borderRadius:10, overflow:'hidden' }}>
                            <div style={{ height:'100%', background:C.text, borderRadius:10, width:`${Math.round(cc[opt.id]/pax.length*100)}%`, transition:'width 0.5s' }} />
                          </div>
                        </div>
                      ))}
                      {otrosList.length > 0 && (
                        <div style={{ marginTop:10, padding:'10px 14px', borderRadius:10, border:`1px solid ${C.border}`, background:C.surface }}>
                          <p style={{ fontSize:10, fontWeight:700, color:C.faint, margin:'0 0 6px', textTransform:'uppercase', letterSpacing:'0.08em' }}>Otros sugeridos</p>
                          {otrosList.map((x, i) => <p key={i} style={{ fontSize:12, color:C.text, margin:'3px 0' }}><span style={{ color:C.muted }}>{x.name}:</span> {x.text}</p>)}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
        )}

        {/* CUENTAS */}
        {tab==='pay' && (
          <div style={{ display:'flex', flexDirection:'column', gap:28 }}>
            <div>
              <h3 style={{ fontFamily:mono, fontSize:16, margin:'0 0 16px', fontWeight:700 }}>Gastos del paseo</h3>
              {expItems.length === 0 && <p style={{ fontSize:12, color:C.faint, marginBottom:16 }}>Agrega los gastos aquí</p>}
              {expItems.map((item, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', padding:'10px 0', borderBottom:`1px solid ${C.border}` }}>
                  <span style={{ flex:1, fontSize:13, color:C.text }}>{item.desc}</span>
                  <span style={{ fontWeight:700, fontSize:13, color:C.text, marginRight:16 }}>{clp(item.amount)}</span>
                  <button onClick={() => removeExp(i)} style={{ background:'none', border:'none', color:C.faint, fontSize:18, cursor:'pointer', padding:4, lineHeight:1 }}>×</button>
                </div>
              ))}
              <div style={{ paddingTop:16, display:'flex', flexDirection:'column', gap:10 }}>
                <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Descripción (ej: Supermercado…)"
                  style={{ fontFamily:mono, padding:'11px 14px', borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:13, color:C.text, background:'#fff', outline:'none' }}
                  onFocus={e => e.target.style.borderColor=C.text} onBlur={e => e.target.style.borderColor=C.border} />
                <div style={{ display:'flex', gap:10 }}>
                  <input type="number" value={newAmt} onChange={e => setNewAmt(e.target.value)} placeholder="Monto $"
                    style={{ fontFamily:mono, flex:1, padding:'11px 14px', borderRadius:8, border:`1.5px solid ${C.border}`, fontSize:13, color:C.text, background:'#fff', outline:'none' }}
                    onFocus={e => e.target.style.borderColor=C.text} onBlur={e => e.target.style.borderColor=C.border} />
                  <button onClick={addExp} style={{ fontFamily:mono, padding:'11px 16px', borderRadius:10, fontWeight:700, fontSize:12, cursor:'pointer', background:'#fff', color:C.text, border:`1.5px solid ${C.text}` }}>+ Agregar</button>
                </div>
              </div>
              {total > 0 && <div style={{ marginTop:16, paddingTop:16, borderTop:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between' }}><span style={{ fontSize:13, fontWeight:700 }}>Total gastado</span><span style={{ fontFamily:mono, fontSize:22, fontWeight:700 }}>{clp(total)}</span></div>}
            </div>
            <HR />
            {total > 0 && pax.length > 0 && (
              <div>
                <div style={{ marginBottom:16 }}>
                  <h3 style={{ fontFamily:mono, fontSize:16, margin:'0 0 4px', fontWeight:700 }}>División proporcional</h3>
                  <p style={{ fontSize:11, color:C.muted, margin:0 }}>Más comidas = mayor parte. Proporcional al tiempo de cada uno.</p>
                </div>
                {shares.map((p, i) => (
                  <div key={p.id}>
                    {i > 0 && <HR />}
                    <div style={{ padding:'20px 0' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                        <div><p style={{ fontWeight:700, fontSize:15, color:C.text, margin:'0 0 3px' }}>{p.name}</p><p style={{ fontSize:11, color:C.faint, margin:0 }}>{p.meals?.map(m => m.short).join(' · ')}</p></div>
                        <span style={{ fontFamily:mono, fontSize:22, fontWeight:700, color:C.text }}>{clp(p.share)}</span>
                      </div>
                      {p.phone && (
                        <a href={makeWALink(p,config.bank,config.eventName)} target="_blank" rel="noreferrer"
                          style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'13px', borderRadius:10, background:'#16a34a', color:'#fff', fontSize:12, fontWeight:700, textDecoration:'none', fontFamily:mono }}>
                          Enviar cuenta por WhatsApp → {p.name}
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!total && <p style={{ fontSize:12, color:C.faint, textAlign:'center', padding:'32px 0' }}>Agrega los gastos para ver la división</p>}
            <HR />
            <div style={{ textAlign:'center' }}><button onClick={onBack} style={{ fontFamily:mono, fontSize:11, color:C.faint, background:'none', border:'none', cursor:'pointer' }}>← Volver al formulario</button></div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── APP RAÍZ ── */
export default function App() {
  const [state, setState] = useState('loading')
  const [config, setConfig] = useState(null)
  const [pax, setPax]       = useState([])
  const [exp, setExp]       = useState(null)

  useEffect(() => {
    const link = document.createElement('link')
    link.rel  = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap'
    document.head.appendChild(link)

    async function init() {
      const cfg = await sg(SK.cfg)
      const p   = await sg(SK.pax)
      const e   = await sg(SK.exp)
      setConfig(cfg)
      setPax(Array.isArray(p) ? p : p ? Object.values(p) : [])
      setExp(e)
      setState(!cfg ? 'setup' : 'landing')
    }
    init()
  }, [])

  if (state==='loading')     return <div style={{ minHeight:'100vh', background:'#000', display:'flex', alignItems:'center', justifyContent:'center' }}><p style={{ fontFamily:'monospace', fontSize:12, color:'#555' }}>Cargando…</p></div>
  if (state==='setup')       return <SetupScreen onSave={async cfg => { await ss(SK.cfg, cfg); setConfig(cfg); setState('admin') }} />
  if (state==='landing')     return <LandingScreen config={config} onEnter={() => setState('participant')} />
  if (state==='admin_login') return <AdminLogin config={config} onSuccess={() => setState('admin')} onBack={() => setState('participant')} />
  if (state==='admin')       return <AdminPanel config={config} initialPax={pax} initialExp={exp} onBack={() => setState('participant')} />
  return <ParticipantApp config={config} onAdminClick={() => setState('admin_login')} />
}
